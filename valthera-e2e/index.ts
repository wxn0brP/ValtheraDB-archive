import { Pool } from "pg";
import { PostgreSQLValthera } from "../src/actions";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL)
	throw new Error("Please set the DATABASE_URL environment variable");
let counter = 0;

export default async () => {
	const prefix = `vdb_pg_e2e_${process.pid}_${counter++}_`;
	const pool = new Pool({
		connectionString: DATABASE_URL,
	});
	const actions = new PostgreSQLValthera(pool, {
		mode: "lazy",
	});

	const originalTable = actions.table.bind(actions);
	actions.table = (collection: string) =>
		originalTable(`${prefix}${collection}`);
	actions.metadataTable = (collection: string) => `${prefix}${collection}`;
	actions.issetCollection = async (collection: string) => {
		return PostgreSQLValthera.prototype.issetCollection.call(
			actions,
			collection,
		);
	};
	actions.removeCollection = async (collection: string) => {
		return PostgreSQLValthera.prototype.removeCollection.call(
			actions,
			collection,
		);
	};
	actions.getCollections = async () => {
		const all = await PostgreSQLValthera.prototype.getCollections.call(actions);
		return all
			.filter(collection => collection.startsWith(prefix))
			.map(collection => collection.slice(prefix.length));
	};

	actions._inited = true;
	return actions;
};
