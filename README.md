# hydr 
### 🐲 download files faster using multiple http requests, just like hydra!

## hydr Using
### installation
  to install hydr you just using
```bash
npm i -g hydr
```


### usage
  - help (--help) - show help
```bash
hydr --help
```
  - version (--version) - show version number
```bash
hydr --version
```
  - chunks (-c, --chunks) - number of split chunks
```bash
hydr -c <number of chunk>
```
  - delay (-d, --delay) - add delay per chunks (in ms) [default = 100]
```bash
hydr -d <time in ms>
```
  - timeout (-t, --timeout) - timeout per chunks download (in ms, 0 = forever) [default = 0]
```bash
hydr -t <time in ms>
```
  - retry (-r, --retry) - max retries on chunks download timeout 
```bash
hydr -r <amount>
```
  - outFile (-o, --outfile) - save output file name
```bash
hydr -o <filename.extension>
```
