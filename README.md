# ValtheraDB Bin Adapter

> **Warning:** This adapter is experimental and NOT intended for production use. It may undergo frequent breaking changes.

The purpose of this experiment is to create a storage layer that allows ValtheraDB, which normally operates on a directory/file structure, to instead use a single binary file for data storage.

## Installation

```bash
bun add @wxn0brp/db-storage-bin
```

## Quick start

```typescript
import { createBinValthera } from "@wxn0brp/db-storage-bin";

const { db, mgr } = await createBinValthera("test.val", {
    preferredSize: 4096,
    growthFactor: 2,
    defaultIndexed: false,
    recordCrc: false,
});

const users = db.c("user");

await users.add({ name: "Alice", age: 30 });
await users.add({ name: "Bob", age: 25 });

const all = await users.find();
const alice = await users.findOne({ name: "Alice" });

await users.update({ name: "Alice" }, { age: 31 });
await users.remove({ name: "Bob" });

await db.close();
```

## Documentation

- [Options](./docs/options.md) - full option reference
- [Data Structure](./docs/data-structure.md) - on-disk format reference
- [Troubleshooting](./docs/troubleshooting.md) - common errors and fixes
- [ValtheraDB-Core](https://github.com/wxn0brP/ValtheraDB-core)

## License

MIT
