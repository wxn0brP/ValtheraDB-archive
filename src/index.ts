import { forgeTypedValthera, ValtheraClass } from "@wxn0brp/db-core";
import { Collection } from "@wxn0brp/db-core/helpers/collection";
import { Data } from "@wxn0brp/db-core/types/data";
import { RNAsyncStorageActions, AsyncStorageLike } from "./async-storage";

export * from "./async-storage";

export function createRNAsyncStorageValthera<
	T extends Record<string, Data[]>,
>(
	name: string,
	storage: AsyncStorageLike,
	data?: T,
): ValtheraClass & { [K in keyof T]: Collection<T[K][number]> } {
	const db = new ValtheraClass({
		adapter: new RNAsyncStorageActions(name, storage),
	});
	if (!data) return forgeTypedValthera(db) as any;

	for (const collection of Object.keys(data)) {
		(db.adapter as RNAsyncStorageActions)._write(collection, data[collection]);
	}

	return forgeTypedValthera(db) as any;
}
