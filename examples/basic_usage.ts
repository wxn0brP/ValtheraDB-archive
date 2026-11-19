import { ValtheraClass } from "@wxn0brp/db-core";
import { MongoDbAdapter } from "../src";

const MONGO_URI = "mongodb://localhost:27017";
const DB_NAME = "vdb-mongo-bridge-test";

const actions = new MongoDbAdapter(MONGO_URI, DB_NAME);
const db = new ValtheraClass({ adapter: actions });

try {
    console.log(`Checking if "new_collection" exists...`);
    const existsBefore = await db.issetCollection(`new_collection`);
    console.log(`Collection "new_collection" exists: ${existsBefore}`);

    console.log(`\nEnsuring "new_collection" exists...`);
    const ensured = await db.ensureCollection(`new_collection`);
    console.log(`Collection ensured: ${ensured}`);

    console.log(`\nChecking again if "new_collection" exists...`);
    const existsAfter = await db.issetCollection(`new_collection`);
    console.log(`Collection "new_collection" exists: ${existsAfter}`);

    console.log(`\nEnsuring the same collection again (should succeed)...`);
    const ensuredAgain = await db.ensureCollection(`new_collection`);
    console.log(`Collection ensured again: ${ensuredAgain}`);

    console.log(`\nAdding a new user...`);
    const newUser = await db.c('users').add({ name: 'John Doe', age: 30 });
    console.log(newUser);

    console.log(`\nUpdating the user...`);
    const updatedUser = await db.c('users').updateOne({ _id: newUser._id }, { age: 31 });
    console.log(updatedUser);

} catch (error) {
    console.error(`An error occurred:`, error);
} finally {
    await db.removeCollection(`new_collection`);
    await db.close();
}
