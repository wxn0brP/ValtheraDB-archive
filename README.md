# Resolver

A dynamic database adapter resolver for the ValtheraDB ecosystem. Automatically selects and instantiates the appropriate database storage adapter based on configuration, environment variables, or fallback defaults.

## Installation

```bash
npm i @wxn0brp/db-resolver @wxn0brp/db-core
```

## VDB API

```typescript
import { VDB } from "@wxn0brp/db-resolver";

const db = VDB().dir("./data");
```

The `VDB(name?)` factory returns a Proxy-based builder. Access any adapter type as a property, then call it with its options.

### Basic Usage

```typescript
// Named database (affects env var lookup: VALTHERA_CUSTOM_...)
const db = VDB("custom").dir("./data");

// With typed collections
const db = VDB<{
    users: { id: number; name: string };
    posts: { title: string; body: string };
}>().dir("./data");

await db.users.add({ id: 1, name: "Ala" });
await db.posts.add({ title: "Hello", body: "World" });
```

### Adapter Variants

Some adapters offer multiple implementations via sub-properties:

```typescript
// SQLite with Bun, Node.js, or better-sqlite3 variant
VDB().sqlite.bun("db.sqlite");
VDB().sqlite.node("db.sqlite");
VDB().sqlite.better("db.sqlite");
```

### Available Adapters

| Adapter | Call Signature |
|---------|---------------|
| `dir` | `VDB().dir(folder, opts?)` |
| `bin` | `VDB().bin(path, opts?)` |
| `sqlite` | `VDB().sqlite(file, keys?, opts?)` |
| `mongodb` | `VDB().mongodb(uri, dbName, opts?)` |
| `rocks` | `VDB().rocks(location, opts?)` |
| `crypt` | `VDB().crypt(folder, opts?)` |
| `client` | `VDB().client(url)` |
| `accdb` | `VDB().accdb(file, keys?)` |
| `length` | `VDB().length(opts)` |

## Traditional API (createAdapter)

```typescript
import { createAdapter } from "@wxn0brp/db-resolver";
import { ValtheraClass } from "@wxn0brp/db-core";

const adapter = await createAdapter({ name: "master" });
const db = new ValtheraClass({ dbAction: adapter });
```

### More Examples

```typescript
// Force a specific adapter
await createAdapter({ force: "bin" });
// same as
await createAdapter({ force: "bin:bin" });

// Use environment variables
process.env.VALTHERA_MASTER = "sqlite";
await createAdapter({ name: "master" });

// Use default fallback
await createAdapter({ name: "master", def: "dir" });
```

## Configuration

The resolver determines which database adapter to use based on the following priority:

1. **`force` option** - Explicitly specify the storage package and variant
2. **Environment variables** - Set `VALTHERA_<NAME>` and optionally `VALTHERA_<NAME>_OPTS`
3. **`def` option** - Define a default fallback
4. **Default behavior** - Falls back to `./vdb-data/<name>` directory storage

### Options

| Option | Type | Description |
|--------|------|-------------|
| `name` | `string` | Identifier used for environment variable lookup (`VALTHERA_<NAME>`) |
| `opts` | `any[]` | Options passed to the database adapter constructor |
| `def` | `string` | Default adapter in format `"package"` or `"package:variant"` |
| `force` | `string` | Force a specific adapter in format `"package"` or `"package:variant"` |

### Environment Variables

- `VALTHERA_<NAME>` - Adapter identifier in format `"package"` or `"package:variant"` (e.g., `VALTHERA_MASTER=dir:dir`)
- `VALTHERA_<NAME>_OPTS` - JSON array of constructor options for the adapter
- `VALTHERA_RESOLVER_MAX_DEPTH` - Maximum depth to search for adapters

This allows installation and use of adapters from different sources, not just the official `@wxn0brp/db-storage-*` packages.

### Dynamic install

If the adapter is not installed and `process.env.NODE_ENV !== "production"`, it will be installed automatically.

## License

MIT
