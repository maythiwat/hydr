
import fs from 'fs/promises'
import path from 'path'
import { EventEmitter } from 'events'

import axios from 'axios'
import mime from 'mime-types'
import cliProgress from 'cli-progress'

axios.defaults.headers['user-agent'] = 'hydr/1.0'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function setUserAgent(userAgent: string) {
    axios.defaults.headers['user-agent'] = userAgent
}

async function fetchChunk(url: string, byteStart: number, byteEnd: number) {
    return await axios.get(url, {
        headers: {
            range: `bytes=${byteStart}-${byteEnd}`
        },
        responseType: 'stream'
    })
}

async function writeChunks(fileName: string, buffer: Buffer[]) {
    const fd = await fs.open(fileName, 'w+')
    for (let k in buffer) {
        await fd.write(buffer[k])
    }
    await fd.close()
}

async function getHeaderInfo(url: string) {
    const info = {
        connected: false,
        fileBytes: 0,
        fileMime: '',
        supportRanges: false,
        withHead: false,
        url
    }

    try {
        console.log('fetching information (1) ... ')
        let res = await axios.head(url)
        // console.log(res.headers, '\n')

        info.connected = true
        if (res.headers['content-length']) {
            info.fileBytes = parseInt(res.headers['content-length'])
        }
        if (res.headers['accept-ranges']) {
            info.fileMime = res.headers['content-type']
            info.supportRanges = (res.headers['accept-ranges'] == 'bytes')
            info.withHead = true
        }
    } catch (e) {
        if (e.response) {
            console.log('^ server returned code:', e.response.status)
        } else {
            info.connected = false
            console.log('^ failed:', e.message)
        }
    }

    try {
        console.log('fetching information (2) ... ')
        let res = await axios.get(url, {
            headers: {
                range: 'bytes=0-0'
            }
        })
        // console.log(res.headers, '\n')

        info.connected = true
        info.fileMime = res.headers['content-type']
        if (res.headers['content-range']) {
            info.fileBytes = parseInt(res.headers['content-range'].replace('bytes 0-0/', ''))
            info.supportRanges = (parseInt(res.headers['content-length']) == 1)
        }
    } catch (e) {
        if (e.response) {
            console.log('^ server returned code:', e.response.status)
        } else {
            info.connected = false
            console.log('^ failed:', e.message)
        }
    }

    return info
}

function downloader(info: any, chunks: number, delay?: number) {
    let resolves = (v: any) => {}
    let rejects = (v: any) => { }

    const emitter = new EventEmitter()
    const promise = new Promise((resolve, reject) => {
        resolves = resolve
        rejects = reject
    }) as any
    promise.on = emitter.on
    promise.emit = emitter.emit

    //
    ;(async() => {
        const bytesPerChunk = Math.floor(info.fileBytes / chunks)
        const lastChunkOffset = info.fileBytes % chunks

        const chunkBuffers = new Array(chunks)
        const waiting = new Array(chunks)

        for (let i = 0; i < chunks; i++) {
            let j = (i + 1)
            const byteOffset = (j == chunks) ? lastChunkOffset : 0
            const byteStart = bytesPerChunk * i
            const byteEnd = byteOffset + (bytesPerChunk * j) - 1

            if (typeof delay != 'undefined') {
                await sleep(delay)
            }

            promise.emit('start', i)

            waiting.push(new Promise<void>(async (resolve, reject) => {
                try {
                    const { data, headers } = await fetchChunk(info.url, byteStart, byteEnd)

                    if (headers['content-length'] != (bytesPerChunk + byteOffset)) {
                        console.log('\n^ chunk size mismatch!, got:', headers['content-length'], '@', `${byteStart}-${byteEnd}`)
                    }

                    let buffers: Buffer[] = []

                    data.on('data', (c: Buffer) => {
                        buffers.push(c)
                        promise.emit('data', i, c.length)
                    })

                    data.on('end', () => {
                        chunkBuffers[i] = Buffer.concat(buffers)
                        promise.emit('end', i, chunkBuffers[i].length)
                        resolve()
                    })

                    data.on('error', () => {
                        console.log('\n^ stream error', `@ ${byteStart}-${byteEnd}`)
                    })
                } catch (e) {
                    console.log('\n^ http error', `@ ${byteStart}-${byteEnd}`)
                }
            }))
        }
        await Promise.all(waiting)
        resolves(chunkBuffers)
    })()
    //

    return promise
}

async function start(url: string, chunks: number, destFile?: string, delay?: number) {
    const multibar = new cliProgress.MultiBar({
        format: ' <{chunk}> {bar} | {value}/{total} ({percentage}%, eta={eta}s)',
        clearOnComplete: false,
        hideCursor: false
    }, cliProgress.Presets.legacy)

    console.time('time elapsed')

    const info = await getHeaderInfo(url)
    if (!info.connected) {
        console.log('')
        return;
    }

    if (!info.supportRanges && chunks > 1) {
        console.log('^ server is not support ranges (use -c 1 instead)\n')
        return;
    }

    console.log('\nfile mime:', info.fileMime)
    console.log('bytes:', info.fileBytes, ' ranges:', info.supportRanges, ' head:', info.withHead)

    const bc = multibar.create(chunks, 0, { chunk: '###' })
    const b0 = multibar.create(info.fileBytes, 0, { chunk: '###' })

    const chunkBuffers = await downloader(info, chunks, delay)
        .on('data', (c: number, l: number) => b0.increment(l))
        .on('end', () => bc.increment(1))

    //
    multibar.stop()
    if (typeof destFile != 'string') {
        let fUrl = new URL(url)
        let fBasename = path.basename(fUrl.pathname)
        if (fBasename.length > 0) {
            destFile = fBasename
        } else {
            let ext = mime.extension(info.fileMime)
            destFile = `dl-${fUrl.hostname.split('.').join('_')}-${Math.floor(new Date().getTime() / 1000)}.${ext || '.bin'}`
        }
    }

    if (info.fileBytes > 2147483647) {
        console.log('\nwriting chunks into file:', destFile, '...')
        writeChunks(destFile, chunkBuffers)
    } else {
        console.log('\nwriting to file:', destFile, '...')
        const fileBuffer = Buffer.concat(chunkBuffers, info.fileBytes)
        await fs.writeFile(destFile, fileBuffer)
    }

    console.log('')
    console.timeEnd('time elapsed')
    console.log('')
    //
}

module.exports = {
    start, downloader,
    setUserAgent,
    getHeaderInfo, writeChunks, fetchChunk
}

export default {
    start, downloader,
    setUserAgent,
    getHeaderInfo, writeChunks, fetchChunk
}