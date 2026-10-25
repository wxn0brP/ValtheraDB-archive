import { MariaDBValthera } from "../src/actions";
import { MariaDBConnection, MariaDBDriver } from "../src/types";

const MARIADB_URL =
	process.env.MARIADB_URL ?? "mariadb://root@localhost:3306/valthera_test";
const DRIVER = (process.env.MARIADB_DRIVER ?? "mariadb") as MariaDBDriver;
let counter = 0;

async function createConnection(): Promise<MariaDBConnection> {
	if (DRIVER === "bun")
		return new (await import("bun")).SQL(MARIADB_URL) as any;
	if (DRIVER === "mysql2") {
		const { createPool } = await import("mysql2/promise");
		return createPool(MARIADB_URL) as any;
	}
	const { createPool } = await import("mariadb");
	return createPool(MARIADB_URL) as any;
}

export default async () => {
	const prefix = `vdb_mariadb_e2e_${process.pid}_${counter++}_`;
	const pool = await createConnection();
	const actions = new MariaDBValthera(pool, {
		mode: "lazy",
		connectionString: MARIADB_URL,
		driver: DRIVER,
	});

	const originalTable = actions.table.bind(actions);
	actions.table = (collection: string) =>
		originalTable(`${prefix}${collection}`);
	actions.metadataTable = (collection: string) => `${prefix}${collection}`;
	actions.issetCollection = async (collection: string) => {
		return MariaDBValthera.prototype.issetCollection.call(actions, collection);
	};
	actions.removeCollection = async (collection: string) => {
		return MariaDBValthera.prototype.removeCollection.call(actions, collection);
	};
	actions.getCollections = async () => {
		const all = await MariaDBValthera.prototype.getCollections.call(actions);
		return all
			.filter(collection => collection.startsWith(prefix))
			.map(collection => collection.slice(prefix.length));
	};

	actions._inited = true;
	return actions;
};
