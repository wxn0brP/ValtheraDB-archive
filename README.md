# @wxn0brp/db-lock

File-based locking plugin for ValtheraDB. Ensures thread-safe database operations across multiple processes by using filesystem lock files.

## Installation

```bash
npm i @wxn0brp/db-lock @wxn0brp/db-core
```

## Usage

```typescript
import { ValtheraClass } from "@wxn0brp/db-core";
import { createLockPlugin } from "@wxn0brp/db-lock";

const db = new ValtheraClass(...);
db.plugin(createLockPlugin());

await db.add({ collection: "users", data: { name: "Alice" } });
// Lock is acquired before the operation and released after it completes
```

## Options

| Option      | Type   | Default           | Description |
|-------------|--------|-------------------|-------------|
| `file`      | string | `"valthera.lock"` | Path to the lock file |
| `stale`     | number | `5000`            | Milliseconds after which a lock is considered stale and removed |
| `retryTime` | number | `50`              | Milliseconds between lock acquisition attempts |
| `retryCount`| number | `50`              | Max retry attempts before throwing |

## How It Works

`createLockPlugin()` returns a ValtheraDB plugin that acquires a filesystem lock before every operation and releases it when the operation finishes. If the lock file already exists, the plugin waits and retries. Stale locks (held longer than `stale` ms) are automatically removed.

## License

MIT
