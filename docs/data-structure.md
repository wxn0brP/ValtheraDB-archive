# Data Structure

This document describes the binary database format (version 4).

## Table of Contents

- [File Layout](#file-layout)
- [File Header](#file-header-128-bytes)
- [Superblock](#superblock)
- [Free Lists](#free-lists)
- [Collection Header](#collection-header-64-bytes)
- [Records](#records)
- [`_id` Index](#_id-index)
- [Alignment and Padding](#alignment-and-padding)
- [Crc32 Coverage](#crc32-coverage)
- [Notes](#notes)

## File Layout

```
[File Header (128B)] [Superblock (var)] [Collections...] [Free Lists...] [Record regions...]
```

The file is a flat sequence of bytes. The header sits at offset 0. All other regions are referenced by offsets stored in the header.

Logical regions:

| Region                | Location                         | Pinned |
|-----------------------|----------------------------------|--------|
| File header           | offset 0, length 128             | Yes    |
| Collections superblock| `header.collectionsOffset`       | No     |
| Free list - small     | `header.freeSmallOffset`         | No     |
| Free list - medium    | `header.freeMediumOffset`        | No     |
| Free list - large     | `header.freeLargeOffset`         | No     |
| Collection regions    | appended at tail of file         | No     |
| Collection indexes    | inside their collection region   | No     |

## File Header (128 bytes)

| Offset | Size | Name                | Description                                          |
|--------|------|---------------------|------------------------------------------------------|
| 0      | 4    | Magic               | `0x56444242` ("VDBB" in ASCII, little-endian)         |
| 4      | 4    | Version             | Format version, currently `4`                         |
| 8      | 1    | Reserved            | Reserved for future use                               |
| 9      | 1    | Flags               | File-level flags                                      |
| 10     | 4    | Collections Offset  | Offset of the msgpack collections array               |
| 14     | 4    | Collections Length  | Length of the msgpack payload                        |
| 18     | 4    | Free Small Offset   | Offset of the small free-list region, `0` if absent   |
| 22     | 4    | Free Small Length   | Length of the small free-list region                  |
| 26     | 4    | Free Medium Offset  | Offset of the medium free-list region, `0` if absent  |
| 30     | 4    | Free Medium Length  | Length of the medium free-list region                 |
| 34     | 4    | Free Large Offset   | Offset of the large free-list region, `0` if absent   |
| 38     | 4    | Free Large Length   | Length of the large free-list region                  |
| 42     | 4    | Block Size          | Preferred block alignment for allocations             |
| 46     | 4    | Growth Factor       | `float32`, multiplier when a region needs to grow    |
| 50     | 8    | File Size           | `uint64`, total size of the file in bytes             |
| 58     | 4    | CRC32               | CRC32 of bytes 0..57                                  |
| 62     | 66   | Reserved            | Reserved                                              |

The header is little-endian everywhere. Bytes 62..127 are zero-initialized and reserved.

### File Flags

| Bit | Name        | Description                                       |
|-----|-------------|---------------------------------------------------|
| 0   | `CRC`       | Reserved for future file-level CRC verification   |
| 1   | `COMPRESSED`| Reserved; file may be codec-compressed            |

## Superblock

The collections list is a msgpack-encoded array stored at `header.collectionsOffset`:

```ts
[
  { name: string, headerOffset: number }, // collection name + header location
  ...
]
```

Each entry references a collection header sitting at the absolute file offset `headerOffset` (length 64). The superblock itself is rewritten whenever collections are added, removed, or migrated.

## Free Lists

Free regions are tracked in three segregated buckets. Each bucket contains slots within a specific size range:

| Bucket  | Size range            |
|---------|-----------------------|
| Small   | `<= 256` bytes         |
| Medium  | `<= 4096` bytes        |
| Large   | `> 4096` bytes         |

A slot below 8 bytes after a split is dropped (the remainder is too small to be useful).

Each bucket region encodes a list of `(offset, size)` pairs:

```
[count uint32][offset varint][size varint][offset varint][size varint]...
```

where `count` is the number of slots in that bucket. The trailing varints are unsigned LEB128.

When inserting a slot, `coalesce()` merges with adjacent neighbors in the same bucket and migrates the slot to the smallest bucket that fits.

When allocating, the allocator looks for a free slot large enough; if no exact match, the slot is split (with the unused tail returned to the appropriate bucket). If no free slot exists, the allocator appends at the current `fileSize`.

## Collection Header (64 bytes)

| Offset | Size | Name                | Description                                          |
|--------|------|---------------------|------------------------------------------------------|
| 0      | 4    | Record Count        | Total live + dead records in this collection         |
| 4      | 4    | Dead Count          | Records marked `DELETED`                             |
| 8      | 4    | Capacity            | Total bytes reserved for this collection             |
| 12     | 4    | Used                | Bytes used by the header + records                   |
| 16     | 4    | Free Offset         | Byte offset (relative to collection start) for the next record |
| 20     | 4    | Index Offset        | Relative offset of the `_id` index, `0` if absent    |
| 24     | 4    | Index Length        | Length of the index in bytes                         |
| 28     | 1    | Flags               | Collection flags (`INDEXED`, `CRC`, `COMPRESSED`)    |
| 29     | 8    | Last Compaction Ts  | `uint64`, milliseconds since the epoch of the last compaction |
| 37     | 4    | CRC32               | CRC32 of bytes 0..36                                 |
| 41     | 23   | Reserved            | Reserved                                             |

After the collection header, records follow back-to-back starting at relative offset `COLLECTION_HEADER_SIZE = 64`.

### Collection Flags

| Bit | Name        | Description                                       |
|-----|-------------|---------------------------------------------------|
| 0   | `INDEXED`   | The collection maintains a sorted `_id` index    |
| 1   | `CRC`       | Records carry a trailing CRC32 checksum          |
| 2   | `COMPRESSED`| Reserved; records may be codec-compressed        |

### Reserved fields

Bytes 41..63 are zero-initialized and reserved for future expansion (per-collection schema, encryption metadata, etc.).

## Records

Each record is encoded as:

```
[flags u8][len varint][data ...][?crc u32]
```

| Field   | Size              | Description                                     |
|---------|-------------------|-------------------------------------------------|
| `flags` | 1 byte            | Bitmask of record flags                          |
| `len`   | 1-5 bytes (varint)| Unsigned LEB128 length of the encoded `data`    |
| `data`  | `len` bytes       | Codec-specific payload (msgpack by default)     |
| `crc`   | 4 bytes (optional)| Present only when the `CRC` flag is set         |

### Record Flags

| Bit | Name        | Description                                              |
|-----|-------------|----------------------------------------------------------|
| 0   | `DELETED`   | Record is tombstoned; reused on compaction               |
| 1   | `CRC`       | Trailing 4-byte CRC32 covers `flags + len + data`         |
| 2   | `COMPRESSED`| Reserved; `data` is codec-compressed                     |

When reading a deleted record the decoder skips past `len + crc` bytes without deserializing the payload, so deletes are cheap.

### Varint encoding

Lengths use unsigned LEB128 (the standard encoding used in Protocol Buffers, FlatBuffers, etc.):

```
value < 0x80          -> 1 byte
value < 0x4000        -> 2 bytes
value < 0x200000      -> 3 bytes
value < 0x10000000    -> 4 bytes
otherwise             -> 5 bytes (max value 2^35 - 1)
```

This is a major space win for small records: a typical 50-byte msgpack record uses 1 byte for length instead of 4 in the v3 format (which used a fixed `uint32`).

### CRC coverage

When the record `CRC` flag is set, a CRC32 covers `flags + varint length + data`. CRC mismatches raise an error during decode (and silently skip the record when the adapter encounters corruption during a scan).

## `_id` Index

When a collection has the `INDEXED` flag set, an `_id` index is maintained alongside the records.

Each entry is exactly `INDEX_ENTRY_SIZE = 64` bytes:

| Offset | Size | Name           | Description                              |
|--------|------|----------------|------------------------------------------|
| 0      | 56   | ID             | UTF-8 string, padded with zeros          |
| 56     | 1    | ID Length      | Byte length of the ID (max 56)           |
| 57     | 3    | Reserved       | Reserved                                 |
| 60     | 4    | Record Offset  | Absolute file offset of the record       |

The entries are sorted using ValtheraDB's native ID comparison (`compareIds`): first by the timestamp part of the ID (the base-36 prefix before `-`), then lexicographically as a tiebreaker. Binary search is used for `findOne({ _id: ... })` queries. The offset is absolute (file-wide) so reads can jump straight to the record.

### ID length limit

IDs longer than 56 bytes are truncated. For ValtheraDB's default generated IDs this is more than enough; if you use longer keys, hash them (e.g. SHA-256 truncated to 32 hex chars) before storing.

### Maintenance cost

The index uses a two-tier structure: a `base` array and a `delta` array. Inserts go into `delta` (O(log n) search + O(n) splice). When `delta` reaches 64 entries, it is merged into `base` (O(n) merge sort). This amortizes the cost: most inserts are fast, and the full rewrite happens only periodically.

For workloads with millions of indexed records, batch imports should disable indexing temporarily (`mgr.setCollectionIndexed('c', false)`), import, then re-enable and rebuild via `mgr.optimize()`.

## Alignment and Padding

All regions are aligned to `blockSize` (default 512 bytes, configurable via `preferredSize`). This minimizes wasted space on fragmented allocations.

After an allocation, if the requested size does not exactly fit, the allocator pads the request to a block boundary and returns the remainder to the appropriate free-list bucket.

When a collection grows past its current capacity, it is moved to a new region and the old region is returned to the free list.

## CRC32 Coverage

| Region             | CRC present | CRC scope                    |
|--------------------|-------------|------------------------------|
| File header        | Yes         | bytes 0..57                  |
| Collection header  | Yes         | bytes 0..36                  |
| Index entries      | No          | (offset is independently verifiable) |
| Records            | Optional    | `flags + len + data`         |

A `0` CRC value in the file header or collection header is treated as "no CRC computed" (legacy v4 files written before this version). On read, the CRC is verified only when it is non-zero.

## Notes

- The file is **append-mostly**: new records go to the end of their collection. Deleted records are flagged.
- Free regions are coalesced on insert and migrated between buckets when they grow or shrink.
- Auto-compaction triggers when `deadCount / recordCount > 0.25` after a `remove` or `update` operation. Manual compaction is available via `mgr.optimize()`.
- Manual file truncation is unsupported; the file is truncated automatically to `header.fileSize` by `optimize()`.
