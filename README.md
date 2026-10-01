# @wxn0brp/db-storage-crypt

An encrypted storage adapter for ValtheraDB.
Each collection is stored as a separate `.edb` file using AES-256-GCM authenticated encryption.

## Installation

```bash
npm install @wxn0brp/db-storage-crypt
```

## Usage

```typescript
import { KeyStore, EncryptedAction } from "@wxn0brp/db-storage-crypt";
import { ValtheraClass } from "@wxn0brp/db-core";

const keyStore = new KeyStore({ folder: "./secure" });
if (!keyStore.exists()) {
    keyStore.init("your-password");
}
const masterKey = keyStore.unlock("your-password");

const adapter = new EncryptedAction("./db-data", {
    encryptionKey: masterKey.toString("hex"),
    salt: "unique-salt",
});

const db = new ValtheraClass({ adapter });
```

## License

MIT
