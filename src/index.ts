import { forgeTypedValthera, ValtheraClass } from "@wxn0brp/db-core";
import { ActionsBase } from "@wxn0brp/db-core/base/actions";
import { addId } from "@wxn0brp/db-core/helpers/addId";
import { Data, DataInternal } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { findUtil } from "@wxn0brp/db-core/utils/action";
import { matchObj, updateObj } from "@wxn0brp/db-core/utils/process";
import { updateFindObject } from "@wxn0brp/db-core/utils/updateFindObject";
import rocksdb from "rocksdb";
import {
	COLLECTION_PREFIX,
	collectionKey,
	dataKey,
	dataPrefix,
	decodePart,
} from "./keys";
import {
	batch,
	closeDb,
	delValue,
	entriesByPrefix,
	getValue,
	openDb,
	putValue,
} from "./storage";
import { RocksBatchOp, RocksDb, RocksEntry, RocksOpenOptions } from "./types";
import { randomKey, valueToString } from "./utils";
import { version } from "./version";

export * from "./types";

export class RocksValthera extends ActionsBase {
	_inited = false;
	db: RocksDb;
	version = version;

	constructor(
		public location: string,
		public opts?: RocksOpenOptions,
	) {
		super();
		this.db = rocksdb(location);
	}

	async init() {
		await openDb(this.db, this.opts);
		this._inited = true;
	}

	async close() {
		await closeDb(this.db);
		this._inited = false;
	}

	async getCollections() {
		const raw = await entriesByPrefix(this.db, COLLECTION_PREFIX);
		return raw.map(([key]) => decodePart(key.slice(COLLECTION_PREFIX.length)));
	}

	async ensureCollection(collection: string) {
		if (await this.issetCollection(collection)) return false;
		await putValue(this.db, collectionKey(collection), "1");
		return true;
	}

	async issetCollection(collection: string) {
		return (await getValue(this.db, collectionKey(collection))) !== undefined;
	}

	async _collectionEntries(collection: string): Promise<RocksEntry[]> {
		const raw = await entriesByPrefix(this.db, dataPrefix(collection));
		return raw.map(([key, value]) => ({
			key,
			data: JSON.parse(valueToString(value)) as DataInternal,
		}));
	}

	async add(query: VQueryT.Add) {
		const { collection, data } = query;
		await this.ensureCollection(collection);

		if (query.id_gen !== false) await addId(query, this);

		const keyId = (data as Data)._id ?? randomKey();
		await putValue(this.db, dataKey(collection, keyId), JSON.stringify(data));
		return data as DataInternal;
	}

	async find(query: VQueryT.Find) {
		await this.ensureCollection(query.collection);

		const matched = (await this._collectionEntries(query.collection))
			.map(entry =>
				matchObj(query, entry.data)
					? updateFindObject(
							{
								...entry.data,
							},
							query.findOpts || {},
						)
					: null,
			)
			.filter(Boolean) as DataInternal[];

		return findUtil(query, matched, []);
	}

	async findOne(query: VQueryT.FindOne) {
		await this.ensureCollection(query.collection);

		for (const entry of await this._collectionEntries(query.collection)) {
			if (matchObj(query, entry.data))
				return updateFindObject(
					{
						...entry.data,
					},
					query.findOpts || {},
				) as DataInternal;
		}

		return null;
	}

	async update(query: VQueryT.Update) {
		await this.ensureCollection(query.collection);
		const results: DataInternal[] = [];
		const ops: RocksBatchOp[] = [];

		for (const entry of await this._collectionEntries(query.collection)) {
			if (!matchObj(query, entry.data)) continue;

			const next = updateObj(query, {
				...entry.data,
			}) as DataInternal;
			if (entry.data._id !== undefined) next._id = entry.data._id;

			ops.push({
				type: "put",
				key: entry.key,
				value: JSON.stringify(next),
			});
			results.push(next);
		}

		await batch(this.db, ops);
		return results;
	}

	async updateOne(query: VQueryT.Update) {
		await this.ensureCollection(query.collection);

		for (const entry of await this._collectionEntries(query.collection)) {
			if (!matchObj(query, entry.data)) continue;

			const next = updateObj(query, {
				...entry.data,
			}) as DataInternal;
			if (entry.data._id !== undefined) next._id = entry.data._id;

			await putValue(this.db, entry.key, JSON.stringify(next));
			return next;
		}

		return null;
	}

	async remove(query: VQueryT.Remove) {
		await this.ensureCollection(query.collection);
		const removed: DataInternal[] = [];
		const ops: RocksBatchOp[] = [];

		for (const entry of await this._collectionEntries(query.collection)) {
			if (!matchObj(query, entry.data)) continue;
			ops.push({
				type: "del",
				key: entry.key,
			});
			removed.push(entry.data);
		}

		await batch(this.db, ops);
		return removed;
	}

	async removeOne(query: VQueryT.Remove) {
		await this.ensureCollection(query.collection);

		for (const entry of await this._collectionEntries(query.collection)) {
			if (!matchObj(query, entry.data)) continue;
			await delValue(this.db, entry.key);
			return entry.data;
		}

		return null;
	}

	async removeCollection(collection: string) {
		const ops: RocksBatchOp[] = [
			{
				type: "del",
				key: collectionKey(collection),
			},
			...(await entriesByPrefix(this.db, dataPrefix(collection))).map(
				([key]) => ({
					type: "del" as const,
					key,
				}),
			),
		];

		await batch(this.db, ops);
		return true;
	}
}

export function createRocksValthera<T extends Record<string, Data> = {}>(
	location: string,
	opts?: RocksOpenOptions,
) {
	const adapter = new RocksValthera(location, opts);
	const db = new ValtheraClass({
		adapter,
	});
	return forgeTypedValthera<T>(db);
}

export const DYNAMIC = {
	rocks(location: string, opts?: RocksOpenOptions) {
		return new RocksValthera(location, opts);
	},
};
