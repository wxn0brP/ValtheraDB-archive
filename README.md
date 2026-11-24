# ValtheraDB Benchmark

Benchmark suite for [ValtheraDB](https://github.com/wxn0brP/ValtheraDB) - 
measures CRUD operation performance across adapters, runtimes, and platforms.

See [Page](https://wxn0brp.github.io/ValtheraDB-benchmark) for details and visualizations.

## Local benchmark

### Install

Globally, to get the `valthera-bench` command:

```bash
bun add -g @wxn0brp/db-benchmark
# or
npm install -g @wxn0brp/db-benchmark
```
### Usage

Run the benchmark against an adapter straight from the terminal:

```bash
valthera-bench [adapter] [options]
```

`adapter` is a path to a module whose default export is a factory returning a
ValtheraDB adapter (default: `./valthera-e2e/index.ts`).

Options:

| Option | Description |
| --- | --- |
| `-s, --small` | Run only the small collection benchmark (users, 10k) |
| `-j, --json` | Save results as JSON |
| `-f, --jsonFile <path>` | JSON output file (default: `results.json`) |
| `--no-cloud` | Skip comparison with published cloud results |
| `-h, --help` | Show help |

## License

MIT
