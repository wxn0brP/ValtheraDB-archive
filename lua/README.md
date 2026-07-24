# conduit

Lua (LuaJIT) client for ValtheraDB Conduit.

## Requirements

- [LuaJIT](https://luajit.org/) (FFI API)
- POSIX system (pipe/fork/exec)

## Usage

Copy `conduit.lua` into your project and require it:

```lua
local conduit = require("conduit")
```

## Quick Start

```lua
local conduit = require("conduit")

local c = conduit.Conduit.new("./valtheradb-conduit")
local db = c:init("mydb", "./data", { numberId = false })
local users = db:collection("users")

users:add({ name = "Ada" }, true)
print(users:find({ name = "Ada" }))
c:shutdown()
```

## API

- `conduit.Conduit.new(binary)` — start conduit binary
- `c:init(name, dir, opts)` — open a database
- `db:c(name)` / `db:collection(name)` — access a collection
- `collection:add(data, id_gen)` — insert a document
- `collection:find(search, db_find_opts, find_opts, context)` — query documents
- `collection:find_one(search, find_opts, context)` — query one document
- `collection:update_one(search, updater, context)` — update one document
- `collection:remove_one(search, context)` — remove one document

## License

MIT
