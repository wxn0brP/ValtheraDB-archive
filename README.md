# @wxn0brp/db-server-git

Lightweight ValtheraDB server with git-backed storage.
Database files live in a Git repository, every flush creates a commit and pushes it to the configured branch.

Based on [ValtheraDB](https://github.com/wxn0brP/ValtheraDB) and the [git storage adapter](https://github.com/wxn0brP/ValtheraDB-storage-git).

## Features

- Git-backed storage via `@wxn0brp/db-storage-git` (auto-flush, commit + push with configurable delay).
- Fully compatible with the ValtheraDB server API (`POST /db/:type`), works with `@wxn0brp/db-client`.
- Token authentication with timing-safe comparison (`WOLF_TOKEN`).
- Rate limiting with `429` responses.
- Optional HTTPS (`SSL_CERT` / `SSL_KEY`, optional `SSL_CA`).
- Simple configuration with a `.env` file.
- Docker image published to GHCR.

## Installation

### Docker (recommended)

```bash
cp .env.example .env
# edit .env
docker compose up -d --build
```

Prebuilt image:

```bash
docker pull ghcr.io/wxn0brp/valtheradb-server-git:latest
```

### Manual Installation

```bash
git clone https://github.com/wxn0brP/ValtheraDB-server-git.git
cd ValtheraDB-server-git
bun install
cp .env.example .env
bun run src/index.ts
```

Git must be installed and available as `git` on the system path.

Build output (`tsc && tsc-alias`):

```bash
bun run build
```

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `14785` | HTTP port |
| `WOLF_TOKEN` | Yes | - | Auth token, required to start |
| `GIT_URL` | Yes | - | Git repository URL, required to start |
| `GIT_BRANCH` | No | `main` | Branch to sync with |
| `GIT_TOKEN` | No | - | Token used to push to the repository |
| `GIT_DIR` | No | `./data` | Local worktree directory |
| `FLUSH_DELAY` | No | `10000` | Auto-flush delay (ms) |
| `SSL_CERT` | No | - | Path to TLS certificate, enables HTTPS |
| `SSL_KEY` | No | - | Path to TLS private key, enables HTTPS |
| `SSL_CA` | No | - | Path to CA certificate |
| `SSL_PORT` | No | `PORT + 1` | HTTPS port |
| `RATE_LIMIT_MAX` | No | `100` | Max requests per window |
| `RATE_LIMIT_WINDOW` | No | `60000` | Rate limit window (ms) |

## Usage

### Endpoints

All requests and responses are JSON. All endpoints require authentication.

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/db/:type` | `{ auth, query }` | Run a database operation |
| `POST` | `/db/:db/:type?c=<collection>` | `{ auth, query }` | Same, collection taken from `?c=` |
| `POST` | `/` | `{ auth, op, query }` | Same, operation taken from `op` |
| `GET` | `/` | - | Health check, returns `Server is running.` |

### Authentication

Send the token in the `Authorization` header (`Bearer <token>` or the raw token) or in the `auth` body field.
The `_wolf_` prefix is stripped before comparison.

```bash
curl -X POST http://localhost:14785/db/add \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token-here" \
  -d '{"query": {"collection": "users", "data": {"name": "Ada"}}}'
```

Response:

```json
{ "err": false, "result": { "_id": "1", "name": "Ada" } }
```

Errors use the same shape:

```json
{ "err": true, "msg": "Invalid token." }
```

### Client

```ts
import { ValtheraRemote } from "@wxn0brp/db-client";

const db = new ValtheraRemote("http://your-secret-token-here@localhost:14785");

await db.add({ collection: "users", data: { name: "Ada" } });
```

The token placed in the URL userinfo is sent in the `auth` body field, so it works without headers.

## Synchronization behavior

On start the adapter initializes the local worktree, clones the configured branch if needed and pulls the latest commit.
Database events mark the flusher as pending. A flush stages changes, creates a commit and pushes it to the configured branch.
If a normal push fails, the adapter retries with a force push. Use a dedicated branch and repository when other writers may update the same branch.

## License

MIT
