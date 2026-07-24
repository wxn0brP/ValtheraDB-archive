# valtheradb-conduit

Rust client for ValtheraDB Conduit.

## Usage

Add to your `Cargo.toml`:

```toml
[dependencies]
valtheradb-conduit = { git = "https://github.com/wxn0brP/ValtheraDB-conduit" }
serde_json = "1"
```

## Quick Start

```rust
use valtheradb_conduit::Conduit;
use serde_json::json;

fn main() {
    let mut conduit = Conduit::new("./valtheradb-conduit").unwrap();

    let db = conduit.init("mydb", "./data", None).unwrap();
    let users = db.c("users");

    users.add(json!({"name": "Ada"}), true).unwrap();
    println!("{:?}", users.find(None, None, None, None));
}
```

## API

- `Conduit::new(binary)` — start conduit binary
- `conduit.init(name, dir, opts)` — open a database
- `db.c(name)` / `db.collection(name)` — access a collection
- `collection.add(data, id_gen)` — insert a document
- `collection.find(search, db_find_opts, find_opts, context)` — query documents
- `collection.find_one(search, find_opts, context)` — query one document
- `collection.update_one(search, updater, context)` — update one document
- `collection.remove_one(search, context)` — remove one document

## License

MIT
