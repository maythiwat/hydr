#!/usr/bin/env node

const yargs = require('yargs')
const hydr = require('.')

const options = yargs
    .usage('Usage: <url>')
    .demandCommand(1, 1)
    .option('chunks', { alias: 'c', describe: 'number of split chunks', type: 'number', default: 4, demandOption: false })
    .option('outFlie', { alias: 'o', describe: 'save to filename', type: 'string', demandOption: false })
    .option('progressBar', { alias: 'p', describe: 'show progress bar for all chunks', type: 'boolean', demandOption: false })
    .argv;

console.log('')

;(async () => {
    await hydr.start(options.chunks, options._[0], options.outFlie, options.progressBar)
})()
