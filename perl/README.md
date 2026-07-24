# ValtheraDB::Conduit

Perl client for ValtheraDB Conduit.

## Usage

Copy `lib/ValtheraDB/Conduit.pm` into your Perl library path or use `-Ilib`:

```bash
perl -Ilib -MValtheraDB::Conduit -e '...'
```

## Quick Start

```perl
use ValtheraDB::Conduit;

my $c = ValtheraDB::Conduit->new(binary_path => "./valtheradb-conduit");
my $db = $c->init("mydb", "./data", { numberId => 0 });
my $users = $db->collection("users");

$users->add({ name => "Ada" });
print $users->find(search => { name => "Ada" });
$c->shutdown;
```

## API

- `ValtheraDB::Conduit->new(binary_path => $path)` — start conduit binary
- `$c->init($name, $dir, $opts)` — open a database
- `$db->c($name)` / `$db->collection($name)` — access a collection
- `$collection->add($data, $id_gen)` — insert a document
- `$collection->find(%opts)` — query documents
- `$collection->find_one(%opts)` — query one document
- `$collection->update_one(%opts)` — update one document
- `$collection->remove_one(%opts)` — remove one document

## License

MIT
