import { forgeTypedValthera, ValtheraClass } from "@wxn0brp/db-core";
import { Data } from "@wxn0brp/db-core/types/data";
import { TypedValthera } from "@wxn0brp/db-core/types/typed";
import { RNAsyncStorageActions, AsyncStorageLike } from "./async-storage";

export * from "./async-storage";

export async function createRNAsyncStorageValthera<
	T extends Record<string, Data[]>,
>(
	name: string,
	storage: AsyncStorageLike,
	data?: T,
): Promise<TypedValthera<T, ValtheraClass>> {
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
