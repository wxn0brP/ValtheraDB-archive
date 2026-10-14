# @wxn0brp/db-e2e

E2E compliance test suite for ValtheraDB adapters. CLI tool that runs a centralized test suite against any adapter implementing the `ActionsBase` interface.

## Overview

This package is a **specification runner**, not a test framework. All tests are predefined and centrally maintained. It loads an adapter module, executes the full test suite, and reports results with proper exit codes.

## Usage

```bash
# Run against default adapter path (./valthera-e2e/index.ts)
valthera-e2e

# Run against a specific adapter
valthera-e2e ./path/to/adapter.ts

# Run only selected test domains
valthera-e2e -d crud-add,crud-read ./adapter.ts

# Show help
valthera-e2e -h
```

### CLI Options

| Option | Short | Description |
|--------|-------|-------------|
| `--help` | `-h` | Show help message |
| `--domain <d>` | `-d <d>` | Run only specified domains (comma-separated) |

### Test Domains

| Domain | Description |
|--------|-------------|
| `init` | Adapter instantiation and basic interface check |
| `collection-management` | `getCollections`, `ensureCollection`, `issetCollection`, `removeCollection` |
| `crud-add` | Document creation with auto-ID, manual ID, and `id_gen: false` |
| `crud-read` | `find`, `findOne` with various search scenarios |
| `crud-update` | `update`, `updateOne` with match/no-match cases |
| `crud-remove` | `remove`, `removeOne` with match/no-match cases |
| `search-operators` | `$gt`, `$lt`, `$in`, `$exists`, `$and`, function-based search |
| `update-operators` | `$inc`, `$unset`, `$push`, `$merge`, function-based updates |
| `find-options` | `limit`, `sortBy`, `select`, `exclude` |
| `composite-operations` | `updateOneOrAdd`, `toggleOne` |
| `edge-cases` | Empty search, special characters, nested objects |
| `events` | Event emission on operations |
| `collection-api` | `Collection` helper API (`db.c()`) |
| `transaction` | Transaction commit/rollback (runs only when `capabilities.transactions` is `true`) |
| `capabilities` | `db.capabilities()` shape, consistency, and capability/behavior agreement |
| `errors` | Unified `ValtheraError` codes surfaced by the public API |

## Adapter Contract

The adapter module must have a **default export** that is an async function returning an `ActionsBase` instance:

```ts
// ./valthera-e2e/index.ts
import { createFileActions } from "@wxn0brp/db-storage-dir";

export default async () => {
    const actions = createFileActions("/tmp/test-db", { format: "json" });
    await actions.init();
    return actions;
};
```

The runner wraps the adapter with `new ValtheraClass({ dbAction: adapter })` before passing it to tests. Each test receives a fresh, initialized `ValtheraClass` instance.

## Configuration

Place `valthera-e2e/config.json` next to your adapter file to skip domains or tests:

```json
{
    "skip": {
        "domains": ["events"],
        "tests": ["search-via-function"]
    }
}
```

Skipped tests are reported as `skipped` (not passed, not failed) and do not affect the exit code.

## Exit Codes

| Code | Meaning |
|------|--------|
| `0` | All executed tests passed (skipped tests are allowed) |
| `1` | At least one test failed, or a runtime error occurred |

## License

MIT
