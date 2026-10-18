# @wxn0brp/db-storage-postgresql

A PostgreSQL storage adapter for the ValtheraDB database library.

## Installation

```bash
npm i @wxn0brp/db-storage-postgresql @wxn0brp/db-core pg
```

## Usage

```ts
import { Pool } from "pg";
import { createPostgreSQLValthera } from "@wxn0brp/db-storage-postgresql";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const db = createPostgreSQLValthera<{
  users: {
    _id: string;
    name: string;
    email: string;
  }
}>(pool);

await pool.query(`
  CREATE TABLE users (
    _id TEXT PRIMARY KEY
  )
`);

const added = await db.users.add({
  name: "John Doe",
  email: "john@example.com"
});

const users = await db.users.find({ name: "John Doe" });

await db.users.update(
  { _id: added._id },
  { email: "newemail@example.com" }
);

await db.users.remove({ _id: added._id });

await db.close();
```

For Valthera-style lazy collection setup, opt in explicitly:

```ts
const db = createPostgreSQLValthera(pool, { mode: "lazy" });
```

The default primary key column is `_id`. To use another primary key for one or more tables:

```ts
const db = createPostgreSQLValthera(pool, {
  mode: "lazy",
  primaryKey: {
    users: "user_id"
  }
});
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VALTHERA_POSTGRES_BATCH_SIZE` | `500` | Maximum number of ids sent in one remove batch. |

## License

MIT
