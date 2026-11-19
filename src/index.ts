import { MongoClientOptions } from "mongodb";
import { MongoDbAdapter } from "./adapter";
export * from "./adapter";

export const DYNAMIC = {
	def(mongoUri: string, dbName: string, clientOpts?: MongoClientOptions) {
		return new MongoDbAdapter(mongoUri, dbName, clientOpts);
	},
};
