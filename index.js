
const fs = require('fs')
const path = require('path')

const axios = require('axios')
const mime = require('mime-types')
const cliProgress = require('cli-progress')

const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36'

const getHeaderInfo = async (url) => {
    const info = {
        fileBytes: 0,
        fileMime: null,
        supportRanges: false,
        withHead: false
    }

    try {
        console.log('fetching information (1) ... ')
        let res = await axios.head(url, {
            headers: {
                'User-Agent': userAgent
            }
        })
        // console.log(res.headers, '\n')
        if (res.headers['accept-ranges']) {
            info.fileBytes = parseInt(res.headers['content-length'])
            info.fileMime = res.headers['content-type']
            info.supportRanges = (res.headers['accept-ranges'] == 'bytes')
            info.withHead = true
        }
    } catch (e) {
        console.log('^ failed with code:', e.response.status)
    }

    try {
        console.log('fetching information (2) ... ')
        let res = await axios.get(url, {
            headers: {
                range: 'bytes=0-0',
                'User-Agent': userAgent
            }
        })
        // console.log(res.headers, '\n')
        if (res.headers['content-range']) {
            info.fileBytes = parseInt(res.headers['content-range'].replace('bytes 0-0/', ''))
            info.fileMime = res.headers['content-type']
            info.supportRanges = (parseInt(res.headers['content-length']) == 1)
        }
    } catch (e) {
        console.log('^ failed with code:', e.response.status)
    }

    return info
}

const downloader = async (info, chunks, urlTarget, chunkProgress) => {
    const multibar = new cliProgress.MultiBar({
        format: ' <{chunk}> {bar} | {value}/{total} ({percentage}%, eta={eta}s)',
        clearOnComplete: false,
        hideCursor: false
    }, cliProgress.Presets.legacy)

    const bytesPerChunk = Math.floor(info.fileBytes / chunks)
    const lastChunkOffset = info.fileBytes % chunks
    console.log('chunkSize:', bytesPerChunk, ' lastChunkOffset:', lastChunkOffset, '\n')

    console.log('starting download ...')
    const bc = multibar.create(chunks, 0, { chunk: '###' })
    const b0 = multibar.create(info.fileBytes, 0, { chunk: '###' })

    const chunkBuffers = new Array(chunks)
    const waiting = new Array(chunks)

    for (let i = 0; i < chunks; i++) {
        let j = (i + 1)
        const byteOffset = (j == chunks) ? lastChunkOffset : 0
        const byteStart = bytesPerChunk * i
        const byteEnd = byteOffset + (bytesPerChunk * j) - 1

        let b1 = undefined
        if (chunkProgress) {
            b1 = multibar.create(bytesPerChunk + byteOffset, 0, { chunk: j.toString().padStart(3, '0') })
        }

        waiting.push(new Promise(async (resolve, reject) => {
            try {
                const { data, headers } = await axios.get(urlTarget, {
                    headers: {
                        range: `bytes=${byteStart}-${byteEnd}`,
                        'User-Agent': userAgent
                    },
                    responseType: 'stream'
                })

                if (headers['content-length'] != (bytesPerChunk + byteOffset)) {
                    console.log('\n^ chunk size mismatch!, got:', headers['content-length'], '@', `${byteStart}-${byteEnd}`)
                }

                let buffers = []
                data.on('data', (c) => {
                    buffers.push(c)
                    b0.increment(c.length)
                    if (typeof b1 != 'undefined') b1.increment(c.length)
                })

                data.on('end', () => {
                    chunkBuffers[i] = Buffer.concat(buffers)
                    bc.increment(1)
                    if (typeof b1 != 'undefined') b1.stop()
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
    multibar.stop()

    return chunkBuffers
}

const writeChunks = (destName, chunkBuffers) => {
    const bar1 = new cliProgress.SingleBar({
        format: ' <###> {bar} | {value}/{total} ({percentage}%, eta={eta}s)',
        clearOnComplete: false,
        hideCursor: false
    }, cliProgress.Presets.legacy)
    bar1.start(chunkBuffers.length, 0)

    const fd = fs.openSync(destName, 'w+')
    for (let k in chunkBuffers) {
        fs.writeSync(fd, chunkBuffers[k])
        bar1.increment(1)
    }

    fs.closeSync(fd)
    bar1.stop()
}

const start = async (chunks, urlTarget, destFile, chunkProgress) => {
    console.time('time elapsed')

    const info = await getHeaderInfo(urlTarget)
    if (!info.supportRanges) {
        console.log('^ server is not support ranges\n')
        return;
    }

    console.log('\nfile mime:', info.fileMime)
    console.log('bytes:', info.fileBytes, ' ranges:', info.supportRanges, ' head:', info.withHead)
    
    const chunkBuffers = await downloader(info, chunks, urlTarget, chunkProgress) // buffer
    
    if (typeof destFile == 'undefined') {
        let fUrl = new URL(urlTarget)
        let fBasename = path.basename(fUrl.pathname)
        if (fBasename.length > 0) {
            destFile = fBasename
        }else{
            let ext = mime.extension(info.fileMime)
            destFile = `dl-${fUrl.hostname.split('.').join('_')}-${Math.floor(new Date().getTime() / 1000)}.${ext || '.bin'}`
        }
    }

    if (info.fileBytes > 2147483647) {
        console.log('\nwriting chunks into file:', destFile, '...')
        writeChunks(destFile, chunkBuffers)
    }else{
        console.log('\nwriting to file:', destFile, '...')
        const fileBuffer = Buffer.concat(chunkBuffers, info.fileBytes)
        fs.writeFileSync(destFile, fileBuffer)
    }

    console.log('')
    console.timeEnd('time elapsed')
    console.log('')
}

module.exports = {
    start, getHeaderInfo, downloader, writeChunks
}