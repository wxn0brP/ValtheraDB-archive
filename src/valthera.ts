import {
	Collection,
	resolveCollection,
} from "@wxn0brp/db-core/helpers/collection";
import { AdapterCapabilities } from "@wxn0brp/db-core/types/action";
import { Data } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { ValtheraCompatible } from "@wxn0brp/db-core/types/valthera";
import { BaseRemote } from "./base";

/**
 * Represents a database management class for performing CRUD operations.
 * Uses a remote database.
 */
export class ValtheraRemote extends BaseRemote implements ValtheraCompatible {
	/**
	 * Create a new instance of a CollectionManager class.
	 */
	c<T = Data>(collection: string) {
		return new Collection<T>(this, collection);
	}

	/**
	 * Get the names of all available databases.
	 */
	getCollections() {
		return this._request<string[]>("getCollections");
	}

	/**
	 * Check and create the specified collection if it doesn't exist.
	 */
	ensureCollection(target: string | VQueryT.Collection) {
		return this._request<boolean>("ensureCollection", {
			collection: resolveCollection(target),
		});
	}

	/**
	 * Check if a collection exists.
	 */
	issetCollection(target: string | VQueryT.Collection) {
		return this._request<boolean>("issetCollection", {
			collection: resolveCollection(target),
		});
	}

	/**
	 * Add data to a database.
	 */
	add<T = Data>(query: VQueryT.Add<T>) {
		return this._request<T>("add", query);
	}

	/**
	 * Find data in a database.
	 */
	find<T = Data>(query: VQueryT.Find<T>) {
		return this._find<T>(query);
	}

	/**
	 * Find one data entry in a database.
	 */
	findOne<T = Data>(query: VQueryT.FindOne<T>) {
		return this._findOne<T>(query);
	}

	/**
	 * Update data in a database.
	 */
	update<T = Data>(query: VQueryT.Update<T>) {
		return this._request<T[]>("update", query);
	}

	/**
	 * Update one data entry in a database.
	 */
	updateOne<T = Data>(query: VQueryT.Update<T>) {
		return this._request<T | null>("updateOne", query);
	}

	/**
	 * Remove data from a database.
	 */
	remove<T = Data>(query: VQueryT.Remove<T>) {
		return this._request<T[]>("remove", query);
	}

	/**
	 * Remove one data entry from a database.
	 */
	removeOne<T = Data>(query: VQueryT.Remove<T>) {
		return this._request<T | null>("removeOne", query);
	}

	/**
	 * Asynchronously updates one entry in a database or adds a new one if it doesn't exist.
	 */
	updateOneOrAdd<T = Data>(query: VQueryT.UpdateOneOrAdd<T>) {
		return this._request<VQueryT.UpdateOneOrAddResult<T>>(
			"updateOneOrAdd",
			query,
		);
	}

	/**
	 * Asynchronously removes one entry in a database or adds a new one if it doesn't exist. Usage e.g. for toggling a flag.
	 */
	toggleOne<T = Data>(query: VQueryT.ToggleOne<T>) {
		return this._request<VQueryT.ToggleOneResult<T>>("toggleOne", query);
	}

	/**
	 * Removes a database collection from the file system.
	 */
	removeCollection(target: string | VQueryT.Collection) {
		return this._request<boolean>("removeCollection", {
			collection: resolveCollection(target),
		});
	}

	async createIndex() {}
	async removeIndex() {}

	count(query: VQueryT.Count) {
		return this._request<number>("count", query);
	}

	bulkAdd<T = Data>(query: VQueryT.BulkAdd<T>) {
		return this._request<T[]>("bulkAdd", query);
	}

	capabilities() {
		return this._request<AdapterCapabilities>("capabilities");
	}
}
