# wxn0brp/db/conduit

Go client for ValtheraDB Conduit.

## Usage

```bash
go get wxn0brp/db/conduit
```

## Quick Start

```go
package main

import (
    "fmt"
    "wxn0brp/db/conduit"
)

func main() {
    c, _ := conduit.New("./valtheradb-conduit")
    defer c.Shutdown()

    db, _ := c.Init("mydb", "./data", nil)
    users := db.Collection("users")

    users.Add(map[string]interface{}{"name": "Ada"}, true)
    fmt.Println(users.Find(nil, nil, nil, nil))
}
```

## API

- `conduit.New(binary)` — start conduit binary
- `c.Init(name, dir, opts)` — open a database
- `db.C(name)` / `db.Collection(name)` — access a collection
- `collection.Add(data, id_gen)` — insert a document
- `collection.Find(search, dbFindOpts, findOpts, context)` — query documents
- `collection.FindOne(search, findOpts, context)` — query one document
- `collection.UpdateOne(search, updater, context)` — update one document
- `collection.RemoveOne(search, context)` — remove one document

## License

MIT
