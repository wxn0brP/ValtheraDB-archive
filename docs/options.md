# Configuration Options

This document describes every option accepted by `BinManager` and `createBinValthera`.

## Top-level constructor

```typescript
new BinManager(path: string, options?: Partial<Options>)
```

| Option                       | Type      | Default | Description                                                |
|------------------------------|-----------|---------|------------------------------------------------------------|
| `preferredSize`              | `number`  | `512`   | Block alignment in bytes. All allocations are rounded up to a multiple of this value. Must be a positive integer. Larger values reduce fragmentation at the cost of wasted space per allocation. |
| `growthFactor`               | `number`  | `2`     | Multiplier applied when a collection or region needs to grow. Must be `>= 1.1`. Higher values reduce the frequency of grows but waste more space per event. |
| `defaultIndexed`             | `boolean` | `false` | When `true`, new collections get the `INDEXED` flag and a `_id` index is maintained. You can toggle this at runtime with `mgr.setCollectionIndexed(name, true)`. |
| `recordCrc`                  | `boolean` | `false` | When `true`, every record carries a trailing CRC32. Adds 4 bytes per record but detects corruption. |
| `overwriteRemovedCollection` | `boolean` | `false` | When `true`, the bytes of a removed collection are zero-filled (helps avoid leaking sensitive data to the file). |
| `recordCacheEnabled`         | `boolean` | `true`  | When `true`, decoded record payloads are cached by offset. Speeds up repeated reads of the same record at the cost of memory. |
| `recordCacheSize`            | `number`  | `1024`  | Maximum number of cached records per collection. When exceeded, the oldest entries are evicted. |
| `format`                     | `object`  | msgpack | `{ encode(data, collection): Promise<Buffer>, decode(buf, collection): Promise<any> }`. The default is msgpack. JSON is a common alternative for debugging. |

## Path validation

`path` must be a non-empty string. The constructor throws `"Path not provided"` if not. The adapter opens the file with `r+` (or `w+` for a new file) and stat-based initialization.

## `defaultIndexed` trade-offs

Enabling the index costs:

- One extra read + write per insert (the entire index is rewritten; O(n) in the index size).
- 64 bytes per indexed record on disk.
- Slightly slower scans (the index is checked first when the search is `_id`-only).

The win is O(log n) lookup time for `findOne({ _id })` and `find({ _id })` on large collections. For collections with fewer than a few hundred records, the index rarely pays off; consider leaving it off and enabling it only when needed.

## `recordCrc` trade-offs

Enabling CRC adds 4 bytes per record and one CRC32 computation per write/read. The win is reliable corruption detection: a partial write or a bit flip in the payload causes the CRC check during read to fail.

The CRC is checked on every read. If you do not need this guarantee (e.g. trusted local SSD), leave it off.

## `recordCacheEnabled` trade-offs

The record cache stores decoded payloads keyed by file offset. For workloads with repeated reads of the same record (e.g. index lookups followed by full reads), this reduces disk I/O and decode overhead. For write-heavy workloads with few re-reads, the cache adds memory overhead with little benefit -- disable it.
