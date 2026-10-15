import { forgeTypedValthera, ValtheraClass } from "@wxn0brp/db-core";
import { Collection } from "@wxn0brp/db-core/helpers/collection";
import { Data } from "@wxn0brp/db-core/types/data";
import { RNAsyncStorageActions, AsyncStorageLike } from "./async-storage";

export * from "./async-storage";

export async function createRNAsyncStorageValthera<
	T extends Record<string, Data[]>,
>(
	name: string,
	storage: AsyncStorageLike,
	data?: T,
): Promise<ValtheraClass & { [K in keyof T]: Collection<T[K][number]> }> {
	const db = new ValtheraClass({
		adapter: new RNAsyncStorageActions(name, storage),
	});
	if (!data) return forgeTypedValthera(db) as any;

	const adapter = db.adapter as RNAsyncStorageActions;
	await Promise.all(
		Object.keys(data).map(collection =>
			adapter._write(collection, data[collection]),
		),
	);

	return forgeTypedValthera(db) as any;
}
