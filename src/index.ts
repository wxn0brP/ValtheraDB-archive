import { ValtheraClass, forgeTypedValthera } from "@wxn0brp/db-core";
import { Data } from "@wxn0brp/db-core/types/data";
import { MariaDBValthera } from "./actions";
import { createPool } from "./pool";
import {
	MariaDBConnection,
	MariaDBDriver,
	MariaDBValtheraOptions,
} from "./types";

export function createMariaDBValthera<T extends Record<string, Data> = {}>(
	mariadbDB: MariaDBConnection,
	opts: MariaDBValtheraOptions = {},
) {
	const adapter = new MariaDBValthera(mariadbDB, opts);
	const db = new ValtheraClass({
		adapter,
	});
	return forgeTypedValthera<T>(db);
}

async function createWithDriver(
	connectionString: string,
	driver: MariaDBDriver,
	opts: MariaDBValtheraOptions,
) {
	const pool = await createPool(connectionString, driver);
	return new MariaDBValthera(pool, {
		connectionString,
		driver,
		...opts,
	});
}

export const DYNAMIC = {
	async mariadb(connectionString: string, opts: MariaDBValtheraOptions = {}) {
		return createWithDriver(connectionString, "mariadb", opts);
	},
	async mysql2(connectionString: string, opts: MariaDBValtheraOptions = {}) {
		return createWithDriver(connectionString, "mysql2", opts);
	},
	async bun(connectionString: string, opts: MariaDBValtheraOptions = {}) {
		return createWithDriver(connectionString, "bun", opts);
	},
	async def(connectionString: string, opts: MariaDBValtheraOptions = {}) {
		const drivers: MariaDBDriver[] = opts.driver
			? [
					opts.driver,
				]
			: [
					"mariadb",
					"mysql2",
					"bun",
				];
		let lastError: unknown;

		for (const driver of drivers) {
			try {
				return await createWithDriver(connectionString, driver, opts);
			} catch (error) {
				lastError = error;
			}
		}

		throw lastError ?? new Error("No MariaDB driver available");
	},
};
