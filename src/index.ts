import { forgeTypedValthera, ValtheraClass } from "@wxn0brp/db-core";
import { Data } from "@wxn0brp/db-core/types/data";
import { TypedValthera } from "@wxn0brp/db-core/types/typed";
import { IndexedDBActions } from "./indexed";
import { WebStorageActions } from "./storage";

export * from "./indexed";
export * from "./storage";

export function createWebStorageValthera<T extends Record<string, Data[]>>(
	name: string,
	data?: T,
	storage: Storage = localStorage,
): TypedValthera<T, ValtheraClass> {
	const db = new ValtheraClass({
		adapter: new WebStorageActions(name, storage),
	});
	if (!data) return forgeTypedValthera(db) as any;

	for (const collection of Object.keys(data)) {
		(db.adapter as WebStorageActions)._write(collection, data[collection]);
	}

	return forgeTypedValthera(db) as any;
}

export function createIndexedDBValthera<T extends Record<string, Data[]>>(
	name: string,
): TypedValthera<T, ValtheraClass> {
	const db = new ValtheraClass({
		adapter: new IndexedDBActions(name),
	});

	return forgeTypedValthera(db) as any;
}
