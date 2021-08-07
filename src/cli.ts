#!/usr/bin/env node

import yargs from 'yargs/yargs'
import * as hydr from '.'

const options = yargs(process.argv.slice(2))
    .demandCommand(1, 1)
    .options({
        chunks: { alias: 'c', type: 'number', describe: 'number of split chunks', default: 4, demandOption: false },
        delay: { alias: 'd', type: 'number', describe: 'delay per chunks (in ms)', default: 100, demandOption: false },
        timeout: { alias: 't', type: 'number', describe: 'timeout per chunks download (in ms, 0 = forever)', default: 0, demandOption: false },
        retry: { alias: 'r', type: 'number', describe: 'max retries on chunks download timeout', demandOption: false },
        outFlie: { alias: 'o', type: 'string', describe: 'save to filename', demandOption: false },
    })
.parseSync() as any

console.log('')

;(async () => {
    await hydr.start(options._[0], options.chunks, options.outFlie, options.delay, options.timeout, options.retry)
})()