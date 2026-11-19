# ValtheraDB-storage-mongodb

A ValtheraDB compatible storage adapter that uses MongoDB as a backend.

This allows you to use the ValtheraDB API and its relational engine with a powerful and scalable MongoDB database.

## Installation

```bash
bun i @wxn0brp/db-storage-mongodb
```

## Usage

```typescript
import { ValtheraClass } from "@wxn0brp/db-core";
import { MongoDbAdapter } from "@wxn0brp/db-storage-mongodb";

const MONGO_URI = "mongodb://localhost:27017";
const DB_NAME = "my-app-db";

const actions = new MongoDbAdapter(MONGO_URI, DB_NAME);
const db = new ValtheraClass({ dbAction: actions });

try {
    const newUser = await db.c("users").add({ name: "John Doe", age: 30 });
    console.log(newUser);
} finally {
    await db.close();
}
```

## License

MIT
