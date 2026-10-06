# @wxn0brp/db-storage-rocks

RocksDB storage adapter for ValtheraDB.

## Installation

```bash
bun add @wxn0brp/db-storage-rocks
```

## Usage

```ts
import { ValtheraClass } from "@wxn0brp/db-core";
import { RocksValthera } from "@wxn0brp/db-storage-rocks";

const adapter = new RocksValthera("./data.rocks");
const db = new ValtheraClass({ adapter });

try {
    const users = db.c("users");

    const added = await users.add({
        name: "John Doe",
        age: 30,
    });

    const found = await users.find({ age: 30 });

    await users.updateOne(
        { _id: added._id },
        { active: true }
    );

    await users.remove({ name: "John Doe" });
} finally {
    await db.close();
}
```

## Typed Valthera Helper

```ts
import { createRocksValthera } from "@wxn0brp/db-storage-rocks";

const db = createRocksValthera<{
    users: {
        _id: string;
        name: string;
        age: number;
    };
}>("./data.rocks");

const user = await db.users.add({
    name: "John Doe",
    age: 30,
});
```

## Adapter Notes

- When `id_gen: false` is used without an `_id`, the adapter creates an internal storage key but does not add `_id` to the stored document.

## License

MIT
