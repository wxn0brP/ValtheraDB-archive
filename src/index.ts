import { ValtheraClass } from "@wxn0brp/db-core";
import { DbStorageLength, Opts } from "./adapter";

export function createLengthValthera(opts: Opts) {
	return new ValtheraClass({
		adapter: new DbStorageLength(opts),
	});
}

export const DYNAMIC = {
	def: (opts: Opts) => new DbStorageLength(opts),
};
