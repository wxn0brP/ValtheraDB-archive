import {
	MariaDBConnection,
	MariaDBDriver,
	QueryableBunSQL,
	QueryableMariaDB,
} from "./types";

export async function createPool(
	connectionString: string,
	driver: MariaDBDriver,
): Promise<MariaDBConnection> {
	if (driver === "mysql2") {
		const { createPool: create } = await import("mysql2/promise");
		return create(connectionString) as unknown as QueryableMariaDB;
	}
	if (driver === "bun") {
		const { SQL } = await import("bun");
		return new SQL(connectionString) as unknown as QueryableBunSQL;
	}
	const { createPool: create } = await import("mariadb");
	return create(connectionString) as unknown as QueryableMariaDB;
}
