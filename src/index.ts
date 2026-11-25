import { forgeTypedValthera, ValtheraClass } from "@wxn0brp/db-core";
import { Data } from "@wxn0brp/db-core/types/data";
import { TypedValthera } from "@wxn0brp/db-core/types/typed";
import { DbStorageXlsx, Opts } from "./adapter";

export function createXlsxValthera<T extends Record<string, Data>>(
	opts: Opts,
): TypedValthera<T, ValtheraClass> {
	const xlsxStorage = new DbStorageXlsx(opts);
	const db = new ValtheraClass({
		adapter: xlsxStorage,
	});
	return forgeTypedValthera(db) as any;
}

export const DYNAMIC = {
	def: (opts: Opts) => new DbStorageXlsx(opts),
};
