# Squirrel

ValtheraDB-Squirrel is an AP routing layer over low unreliable storage nodes, with no consistency or durability guarantees.

## How it works

### Routing

Fully compatible with the ValtheraDB server API. Squirrel sits between the client and storage nodes, resolving the target server for each request and responding with a `307` redirect to the correct node.

```
client -> Squirrel (hash _id -> server) -> 307 redirect -> ValtheraDB node
```

### Epochs

Timestamped snapshots of the cluster's server list. Documents are routed based on which epoch was active when their `_id` was generated. New epochs are created on first start or when the server list changes.

### AP over CA

When the primary server is down, writes are queued on a catchup node in `__squirrel_catchup` with the operation type and timestamp. The original server retrieves and replays them via `POST /squirrel/welcome-back`, which replays each operation using the stored `op` type, then cleans up the catchup entries.

### Full Scan

When no `_id` is present and `SQUIRREL_ALLOW_FULL_SCAN=true`, Squirrel broadcasts the operation to all servers.

### Collection Operations

Collection operations (`getCollections`, `ensureCollection`, `removeCollection`, `issetCollection`) are special cases that operate on collections rather than documents. They never have an `_id` and always require full scan.

| Operation | Behavior |
|-----------|----------|
| `getCollections` | Aggregates collection names from all servers, returns deduplicated list |
| `ensureCollection` | Creates the collection on all servers |
| `removeCollection` | Removes the collection from all servers |
| `issetCollection` | Returns `true` if the collection exists on any server |

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SQUIRREL_DB` | Yes | - | Database name |
| `SQUIRREL_AUTH` | Yes | - | Auth token |
| `SQUIRREL_SEEDS` / `SQUIRREL_SEED_<N>` | Yes | - | Space-separated seed URLs |
| `SQUIRREL_ALLOW_FULL_SCAN` | No | `false` | Query without `_id`, broadcast to all servers |
| `SQUIRREL_ALLOW_CATCHUP_SERVER` | No | `false` | Queue writes on catchup when primary is down |

## Usage

1. `cp .env.example .env`

2. Edit .env

3. With Node
    ```bash
    npm install
    npm run build
    npm start
    ```

3. With Bun
    ```bash
    bun install
    bun run src/index.ts
    ```

## License

MIT
