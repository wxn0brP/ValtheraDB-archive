# ValtheraDB Server PHP

ValtheraDB adapter for MariaDB/MySQL. Probably provides a ValtheraDB-compatible API for SQL databases.

Compatible with core
0.12.14

## Installation

```bash
git clone https://github.com/wxn0brP/ValtheraDB-server-php.git
```

## Configuration

Copy `config.php.example` to `config.php` and configure:

```php
$auth = [
    // 'dbs' => null grants access to every configured database,
    // an explicit array limits the token to those $databases keys,
    // a missing/empty list denies all database access.
    'admin' => ['token' => 'your-token', 'dbs' => null],
];

$default = [
    'host' => 'localhost',
    'port' => 3306,
    'database' => 'database_name',
    'username' => 'username',
    'password' => 'password',
    'charset' => 'utf8mb4',

];
```

## Endpoints

Routes mirror [ValtheraDB Server](https://github.com/wxn0brP/ValtheraDB-server):

- `POST /db/:type` - operation in the URL, database in `body.db`.
- `POST /db/:db/:type` - database and operation in the URL, optional `?c=<collection>`.
- `POST /` - operation in `body.op`, database in `body.db`.

Request body: `{ db, auth, query, keys }`. Response wire matches db-core:

- success: `{ "err": false, "result": ... }`
- error: `{ "err": true, "msg", "code"?, "suggestion"?, "context"? }` where `code` is a `db-core` `ErrorCodes` value and `context` carries `adapter` and `version`.

Operations: `getCollections`, `ensureCollection`, `issetCollection`,
`removeCollection`, `add`, `bulkAdd`, `find`, `findOne`, `update`, `updateOne`,
`remove`, `removeOne`, `updateOneOrAdd`, `toggleOne`, `count`, `capabilities`,
`createIndex`, `removeIndex`.

`capabilities` returns `transactions: false` (the server keeps no state between
requests), `indexes: true`, `persistent: true` and the adapter `version`.

## Query notes

- `$regex` accepts a string pattern (deprecated in core) or `{ "source": "...", "flags": "i" }`,
  because JSON cannot carry a `RegExp`. Matching is case-sensitive like JS `RegExp`
  unless the `i` flag is set. Any other shape is rejected instead of matching every row.
- `__proto__`, `constructor` and `prototype` keys are dropped from search, data,
  updater and output, mirroring db-core.
- Collection names are validated: empty, longer than 64 characters, control
  characters, `/`, `\` and `.` are rejected with `QUERY_INVALID`.

## Server Configuration

**Important:** Endpoints should be called without the `.php` extension (e.g., `/db/find`, not `/db/find.php`).

An `.htaccess` file is included for Apache; it strips `.php` and maps `/db/:db/:type`.

For nginx/caddy/lighttpd, configure equivalent rewriting:

```nginx
# POST /db/:db/:type -> db/:type.php?db=:db
rewrite ^/db/([^/]+)/([^/]+)$ /db/$2.php?db=$1 last;

# POST /db/:type -> db/:type.php
try_files $uri $uri.php =404;
```

## Compatibility

API is probably compatible with [ValtheraDB Server](https://github.com/wxn0brP/ValtheraDB-server).

## License

MIT

## Contributing

Contributions are welcome!
