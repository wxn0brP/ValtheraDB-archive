# Troubleshooting

Common errors and their fixes.

## "invalid file magic"

The file is not a v4 bin file, or it is corrupted.

Causes:
- The file was created by a different adapter (e.g. v1).
- The first 4 bytes were overwritten by something else.
- The file is empty and was not initialized via `mgr.init()`.

Fix: ensure `await mgr.init()` is called before any operations. If the file is corrupted, delete it and start over (or restore from backup).

## "unsupported file version X"

The file was created by a different version of the adapter.

Cross-version compatibility is intentional - v4 cannot read v2 files.

## "file too small"

The file exists but is smaller than the header. The file is corrupt.

Fix: delete and recreate.

## Crashes during `optimize()` may leave the file larger than necessary

`optimize()` mutates the file in place via region rotation, then truncates. If the process is killed mid-`optimize`, the file may be left slightly larger than necessary but should still be valid.

Run `optimize()` again after restart to reclaim the unused tail.

## "record CRC mismatch"

The record's CRC does not match its payload. The file has been corrupted (bit flip, partial write, etc.).

Causes:
- Process killed during write.
- Filesystem bug or hardware error.
- External modification of the file.

The adapter will throw this error during a scan. The corrupted record cannot be recovered. To continue, you can:
1. Drop the affected collection: `await mgr.removeCollection("corrupted")`.
2. Or restore from a backup.

## "collection header CRC mismatch"

Same root cause as record CRC mismatch, but for the collection header. The collection cannot be loaded; `removeCollection` will throw an error if the collection metadata is unreadable. Restore from a backup or delete the file.

## File grows unexpectedly

Possible causes:

1. **Many small allocations** - each grows the file by `preferredSize`. Lower `preferredSize` to reduce waste.
2. **High `growthFactor`** - collections double in size when they need to grow. Lower to `1.5` for tighter packing.
3. **Dead records not compacted** - if your workload does many updates that don't trigger auto-compact (e.g. <25% dead), call `mgr.optimize()` periodically.
