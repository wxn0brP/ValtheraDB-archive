import { MongoClient } from "mongodb";
import { MongoDbAdapter } from "../src/index";

const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
const DB_NAME = process.env.MONGO_DB_NAME ?? "vdb-mongo-bridge-test";

async function resetDatabase() {
	const client = new MongoClient(MONGO_URI);
	try {
		await client.connect();
		await client.db(DB_NAME).dropDatabase();
	} finally {
		await client.close();
	}
}

export default async () => {
	await resetDatabase();

	const actions = new MongoDbAdapter(MONGO_URI, DB_NAME);
	actions._inited = false;
	return actions;
};
