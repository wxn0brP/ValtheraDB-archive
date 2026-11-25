# Database Operations API (`/db`)

## Main endpoint

### `POST /:op`

Operation is the URL parameter, database name in the body.

| Field | Type | Required | Description |
|---|---|---|---|
| `db` | `string` | yes | Database name |
| `query` | `object` | yes | Query object |
| `auth` | `string` | no | Authentication token for the database |

Header `Authorization: Bearer <token>` is also supported.

**Example: Insert a document:**

```javascript
fetch('http://localhost:14785/db/add', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    db: 'mainDB',
    auth: 'myToken',
    query: {
      collection: 'users',
      data: { 
        name: 'John Doe',
        age: 30
      }
    }
  })
});
```

## Additional endpoints

- **`POST /`** - operation in `body.op`, database in `body.db`.
- **`POST /:db/:op`** - database and operation in the URL; optional `?c=` for collection.

> **Note:** The legacy `params` field is deprecated and will be removed soon. Use `query` instead.
