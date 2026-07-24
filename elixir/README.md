# ValtheraDB.Conduit

Elixir client for ValtheraDB Conduit.

## Usage

Add to your `mix.exs`:

```elixir
defp deps do
  [
    {:valtheradb_conduit, git: "https://github.com/wxn0brP/ValtheraDB-conduit"}
  ]
end
```

## Quick Start

```elixir
{:ok, pid} = ValtheraDB.Conduit.start_link("./valtheradb-conduit")
db = ValtheraDB.Conduit.init_db(pid, "mydb", "./data")
users = ValtheraDB.Conduit.Db.collection(db, "users")

ValtheraDB.Conduit.Collection.add(users, %{"name" => "Ada"})
IO.inspect(ValtheraDB.Conduit.Collection.find(users, %{"name" => "Ada"}))

ValtheraDB.Conduit.shutdown(pid)
```

## API

- `ValtheraDB.Conduit.start_link(binary)` — start conduit binary as a GenServer
- `ValtheraDB.Conduit.init_db(pid, name, dir, opts)` — open a database
- `ValtheraDB.Conduit.Db.collection(db, name)` — access a collection
- `ValtheraDB.Conduit.Collection.add(col, data, id_gen)` — insert a document
- `ValtheraDB.Conduit.Collection.find(col, search, ...)` — query documents
- `ValtheraDB.Conduit.Collection.find_one(col, search, ...)` — query one document
- `ValtheraDB.Conduit.Collection.update_one(col, search, updater, context)` — update one document
- `ValtheraDB.Conduit.Collection.remove_one(col, search, context)` — remove one document

## License

MIT
