# valtheradb-conduit

Common Lisp client for ValtheraDB Conduit.

## Usage

Load the ASDF system:

```lisp
(ql:quickload :valtheradb-conduit)
```

## Quick Start

```lisp
(let* ((c (valtheradb-conduit:make-conduit "./valtheradb-conduit"))
       (db (valtheradb-conduit:make-db c "mydb"))
       (users (valtheradb-conduit:db-collection db "users")))
  (valtheradb-conduit:db-init db "./data")
  (valtheradb-conduit:collection-add users '((:name . "Ada")))
  (format t "~A" (valtheradb-conduit:collection-find users :search '((:name . "Ada"))))
  (valtheradb-conduit:conduit-shutdown c))
```

## API

- `make-conduit(binary)` — start conduit binary
- `make-db(conduit name)` — create a DB handle
- `db-init(db dir &optional opts)` — open a database
- `db-collection(db name)` — access a collection
- `collection-add(col data &optional id-gen)` — insert a document
- `collection-find(col &key search db-find-opts find-opts context)` — query documents
- `collection-find-one(col &key search find-opts context)` — query one document
- `collection-update-one(col search updater &optional context)` — update one document
- `collection-remove-one(col search &optional context)` — remove one document

## License

MIT
