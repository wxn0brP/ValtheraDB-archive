# ValtheraDB CLI 

ValtheraDB CLI is a command-line tool for managing Valthera databases.
It supports various database operations, starting a server, and dynamic commands.
Powered by @wxn0brp/db (ValtheraDB)

## Installation

Install globally using Bun:

```bash
bun add -g github:wxn0brP/ValtheraDB-cli
```

After installation, the `vdb` command will be available.

## Usage

### Basic Commands

View help:

```bash
vdb --help
```

Check version:

```bash
vdb --version
```

Specify database directory (default: current directory):

```bash
vdb -d <path_to_directory>
```

### Start Server

Start the server on a specific port (or default):

```bash
vdb server [port]
```

> ### `Warning`: The server started by `vdb` is a development server and does `not include authentication`. It is not recommended to use it in a production environment.

### Run Operations

Execute database operations:
```bash
vdb <operation_name> [arguments]
```

Example:

```bash
vdb updateOne user "{id:123}" "{name: 'John'}"
```

### Available Operations

| Command | Description |
|---|---|
| `add <collection> <data> [id_gen]` | Add a document to a collection |
| `bulkAdd <collection> <data> [id_gen]` | Add multiple documents to a collection |
| `count <collection> [search]` | Count documents in a collection |
| `find <collection> <search> [options] [findOpts] [context]` | Find documents in a collection |
| `findOne <collection> <search> [findOpts] [context]` | Find one document in a collection |
| `update <collection> <search> <updater> [context]` | Update documents in a collection |
| `updateOne <collection> <search> <updater> [context]` | Update one document in a collection |
| `updateOneOrAdd <collection> <search> <updater> [add_arg]` | Update one document or add it if missing |
| `remove <collection> <search> [context]` | Remove documents in a collection |
| `removeOne <collection> <search> [context]` | Remove one document in a collection |
| `toggleOne <collection> <data>` | Remove one document or add it if missing |
| `createIndex <collection> <fields> [opts]` | Create an index on a collection |
| `removeIndex <collection> <fields>` | Remove an index from a collection |
| `getCollections` | Get all collections |
| `capabilities` | Describe what the underlying adapter supports |
| `ensureCollection <collection>` | Ensure a collection exists |
| `issetCollection <collection>` | Check if a collection exists |
| `removeCollection <collection>` | Remove a collection |

Errors reported by the database are printed with their error code, suggestion and
context. Pass `--json` to get the raw (JSON) result or error payload.

## License

MIT License
