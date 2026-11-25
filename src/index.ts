import { ValtheraClass } from "@wxn0brp/db-core";
import { DbStorageCsv, Opts } from "./adapter";

export function createCsvValthera(opts: Opts) {
	const csvStorage = new DbStorageCsv(opts);
	return new ValtheraClass({
		adapter: csvStorage,
	});
}
