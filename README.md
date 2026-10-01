# @wxn0brp/db-storage-rn

React Native AsyncStorage adapter for ValtheraDB.

## Installation

```bash
bun add @wxn0brp/db-storage-rn @react-native-async-storage/async-storage
```

## Usage

```typescript
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createRNAsyncStorageValthera } from "@wxn0brp/db-storage-rn";

const db = createRNAsyncStorageValthera("myapp", AsyncStorage);

await db.users.add({ name: "John", age: 30 });
const users = await db.users.find({ $gt: { age: 25 } });
```

## License

MIT
