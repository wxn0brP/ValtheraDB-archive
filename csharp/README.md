# ValtheraDB.Conduit

C# client for ValtheraDB Conduit.

## Usage

Add the project reference:

```bash
dotnet add reference ValtheraDB.Conduit.csproj
```

Or copy the files into your project.

## Quick Start

```csharp
using ValtheraDB.Conduit;

using var conduit = new Conduit("./valtheradb-conduit");
var db = conduit.Init("mydb", "./data");
var users = db.Collection("users");

users.Add(new { name = "Ada" });
Console.WriteLine(users.Find(new { name = "Ada" }));
```

## API

- `new Conduit(binary)` — start conduit binary
- `conduit.Init(name, dir, opts)` — open a database
- `db.C(name)` / `db.Collection(name)` — access a collection
- `collection.Add(data, idGen)` — insert a document
- `collection.Find(search, dbFindOpts, findOpts, context)` — query documents
- `collection.FindOne(search, findOpts, context)` — query one document
- `collection.UpdateOne(search, updater, context)` — update one document
- `collection.RemoveOne(search, context)` — remove one document

## License

MIT
