import { forgeTypedValthera, ValtheraClass } from "@wxn0brp/db-core";
import { Data } from "@wxn0brp/db-core/types/data";
import { PostgreSQLValthera } from "./actions";
import { PostgreSQLValtheraOptions, SupportedPostgreSQL } from "./types";

export function createPostgreSQLValthera<T extends Record<string, Data> = {}>(
	pgDB: SupportedPostgreSQL,
	opts: PostgreSQLValtheraOptions = {},
) {
	const adapter = new PostgreSQLValthera(pgDB, opts);
	const db = new ValtheraClass({
		adapter,
	});
	return forgeTypedValthera<T>(db);
}

export const DYNAMIC = {
	async def(connectionString: string, opts: PostgreSQLValtheraOptions = {}) {
		const { Pool } = await import("pg");
		return new PostgreSQLValthera(
			new Pool({
				connectionString,
			}),
			opts,
		);
	},
};
