# @wxn0brp/db-storage-mariadb

A MariaDB storage adapter for the ValtheraDB database library.

## Installation

```bash
npm i @wxn0brp/db-storage-mariadb @wxn0brp/db-core mariadb
```

## Usage

```ts
import { createPool } from "mariadb";
import { createMariaDBValthera } from "@wxn0brp/db-storage-mariadb";

const pool = createPool({
  host: "localhost",
  user: "root",
  password: process.env.MARIADB_PASSWORD,
  database: "valthera_test",
});

const db = createMariaDBValthera<{
  users: {
    _id: string;
    name: string;
    email: string;
  };
}>(pool);

await pool.query(`
  CREATE TABLE users (
    _id VARCHAR(191) NOT NULL PRIMARY KEY
  )
`);

const added = await db.users.add({
  name: "John Doe",
  email: "john@example.com",
});

const users = await db.users.find({ name: "John Doe" });
await db.users.update({ _id: added._id }, { email: "newemail@example.com" });
await db.close();
```

`mysql2` works the same way through the universal interface:

```ts
import { createPool } from "mysql2/promise";

const pool = createPool({
  uri: process.env.MARIADB_URL,
});

const db = createMariaDBValthera(pool, { mode: "lazy" });
```

Bun's native SQL client is supported directly, no extra driver package needed.

```ts
import { SQL } from "bun";

const sql = new SQL("mariadb://user:pass@localhost:3306/db");

const db = createMariaDBValthera(sql, {
  mode: "lazy",
  driver: "bun",
});
```

The `DYNAMIC` helper can build the adapter from a connection string:

```ts
const db = await DYNAMIC.bun(process.env.MARIADB_URL);
```

## Modes

The adapter mirrors PostgreSQL-like semantics:

- `strict` (default): tables and columns must already exist.
- `lazy`: missing tables and columns are created on write.

```ts
const adapter = new MariaDBValthera(pool, {
  mode: "lazy",
  primaryKey: {
    users: "user_id",
  },
});
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VALTHERA_MARIADB_BATCH_SIZE` | `500` | Maximum number of ids sent in one remove batch. |

## License

MIT
