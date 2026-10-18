import { forgeTypedValthera, ValtheraClass } from "@wxn0brp/db-core";
import { Data } from "@wxn0brp/db-core/types/data";
import { SQLiteValthera } from "./actions";
import { SupportedDB } from "./types";

export * from "./actions";

export function createSQLiteValthera<T extends Record<string, Data> = {}>(
	sqlDB: SupportedDB,
) {
	const adapter = new SQLiteValthera(sqlDB);
	const db = new ValtheraClass({
		adapter,
	});
	return forgeTypedValthera<T>(db);
}

export const DYNAMIC = {
	def(file: string, keys: Record<string, string> = {}, opts?: any) {
		if (typeof Bun !== "undefined") return DYNAMIC.bun(file, keys, opts);
		return DYNAMIC.node(file, keys, opts);
	},
	async bun(
		file: string,
		keys: Record<string, string> = {},
		opts: any = undefined,
	) {
		const { Database } = await import("bun:sqlite");
		if (typeof opts === "object" && Object.keys(opts).length === 0)
			opts = undefined;
		return new SQLiteValthera(new Database(file, opts), keys);
	},
	async node(file: string, keys: Record<string, string> = {}, opts?: any) {
		const { DatabaseSync } = await import("node:sqlite");
		if (!opts) opts = {};
		return new SQLiteValthera(new DatabaseSync(file, opts), keys);
	},
	async better(file: string, keys: Record<string, string> = {}, opts?: any) {
		const { default: def } = await import("better-sqlite3");
		if (!opts) opts = {};
		return new SQLiteValthera(new def(file, opts), keys);
	},
};
