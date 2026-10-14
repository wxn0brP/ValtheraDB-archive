import { MongoClientOptions } from "mongodb";
import { MongoDbAction } from "./actions";
export * from "./actions";

export const DYNAMIC = {
	def(mongoUri: string, dbName: string, clientOpts?: MongoClientOptions) {
		return new MongoDbAction(mongoUri, dbName, clientOpts);
	},
	mongodb(mongoUri: string, dbName: string, clientOpts?: MongoClientOptions) {
		return new MongoDbAction(mongoUri, dbName, clientOpts);
	},
};
