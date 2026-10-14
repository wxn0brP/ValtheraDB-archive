# @wxn0brp/db-storage-ged

A **GEDCOM (.ged) storage adapter** for the ValtheraDB database library.
This package lets you use a genealogy file as a backend while leveraging the **full power of ValtheraDB**.

> **Note:** The whole file is parsed into memory on first access and every write serializes all collections back to disk. This adapter fits small to medium family trees, not bulk imports.

```bash
bun add @wxn0brp/db-storage-ged @wxn0brp/db-core
```

## Usage

```ts
import { createGedValthera } from "@wxn0brp/db-storage-ged";

const db = createGedValthera<"INDI" | "FAM">("./tree.ged");

console.log(await db.adapter.getCollections()); // ["HEAD", "INDI", "FAM", ...]

await db.INDI.add({
	_id: "@I1@",
	NAME: { _value: "John /Smith/", GIVN: "John", SURN: "Smith" },
	SEX: "M",
	BIRT: { DATE: "1 JAN 1900", PLAC: "New York, USA" },
});

const males = await db.INDI.find({ SEX: "M" }, { limit: 5 });
const one = await db.INDI.findOne({ _id: "@I1@" });

await db.INDI.updateOne({ _id: "@I1@" }, { OCCU: "Carpenter" });

await db.INDI.removeOne({ _id: "@I1@" });
```

## How GEDCOM maps to documents

| GEDCOM | ValtheraDB |
|---|---|
| level-0 record tag (`INDI`, `FAM`, `HEAD`, ...) | collection name |
| one level-0 record | one document |
| xref (`@I1@`) | `_id` (HEAD gets `_id: "HEAD"`) |
| node value | `_value` |
| child tag | object key |
| repeated child tag | array of values |
| `CONT` / `CONC` | appended to `_value` |
| `TRLR` | skipped |

Given:

    0 @I1@ INDI
    1 NAME John /Smith/
    2 GIVN John
    1 SEX M
    1 BIRT
    2 DATE 1 JAN 1900

the `INDI` collection contains:

```ts
{
	_id: "@I1@",
	NAME: { _value: "John /Smith/", GIVN: "John" },
	SEX: "M",
	BIRT: { DATE: "1 JAN 1900" },
}
```

## License

MIT
