# @wxn0brp/db-redis-cache

A Redis caching plugin for ValtheraDB.
Caches read operations (`find`, `findOne`) and automatically invalidates cached results when a collection is mutated.

## Installation

```bash
npm i @wxn0brp/db-redis-cache @wxn0brp/db-core
```

## Usage

```ts
import { ValtheraClass } from "@wxn0brp/db-core";
import { createRedisCachePlugin } from "@wxn0brp/db-redis-cache";
import { Redis } from "ioredis";
// import { redis, RedisClient } from "bun:redis";

const client = new Redis("redis://localhost:6379");

const db = new ValtheraClass(...);
db.plugin(createRedisCachePlugin({ client }));

const users = await db.users.find({ name: "John" }); // cached
const users2 = await db.users.find({ name: "John" }); // served from cache

await db.users.add({ name: "Alice" }); // cache for "users" is invalidated
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `client` | `RedisLikeClient` | required | Redis client instance (ioredis or bun:redis) |
| `ttl` | number | `60` | Cache TTL in seconds |
| `prefix` | string | `"valthera"` | Key prefix |
| `exclude` | string[] | `[]` | Collections excluded from caching |
| `include` | string[] \| null | `null` | If set, only these collections are cached |
| `maxKeyLength` | number | `200` | Max key length before hashing |

## License

MIT
