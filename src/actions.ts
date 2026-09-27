import { Id } from "@wxn0brp/db-core";
import { ActionsBase } from "@wxn0brp/db-core/base/actions";
import { addId } from "@wxn0brp/db-core/helpers/addId";
import { DataInternal } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { TransactionHandle } from "@wxn0brp/db-core/types/transaction";
import { findUtil } from "@wxn0brp/db-core/utils/action";
import { hasFieldsAdvanced } from "@wxn0brp/db-core/utils/hasFieldsAdvanced";
import { updateFindObject } from "@wxn0brp/db-core/utils/updateFindObject";
import {
	ClientSession,
	Collection,
	Db,
	MongoClient,
	MongoClientOptions,
} from "mongodb";
import { cleanDocs, needsJsFallback, translateQuery } from "./utils";
import { nativeAggregate } from "./utils/aggregate";
import { isEmptyUpdate, resolveSearch, translateUpdater } from "./utils/update";
import { version } from "./version";

export class MongoDbAction extends ActionsBase {
	_client: MongoClient;
	_db: Db;
	_session: ClientSession | null = null;
	version = version;

	constructor(
		mongoUri: string,
		dbName: string,
		clientOpts?: MongoClientOptions,
	) {
		super();
		this._client = new MongoClient(mongoUri, clientOpts);
		this._db = this._client.db(dbName);
	}

	async init() {
		await this._client.connect();
	}

	async close() {
		await this._client.close();
	}

	_getCollection(name: string): Collection {
		return this._db.collection(name);
	}

	_applyFindOpts<T extends DataInternal | DataInternal[] | null | undefined>(
		data: T,
		findOpts: VQueryT.Find["findOpts"],
	): T {
		if (!findOpts || Object.keys(findOpts).length === 0) return data;

		if (Array.isArray(data))
			return data.map(doc =>
				updateFindObject(
					{
						...doc,
					},
					findOpts,
				),
			) as T;

		if (data && typeof data === "object")
			return updateFindObject(
				{
					...data,
				},
				findOpts,
			) as T;

		return data;
	}

	async add(query: VQueryT.Add) {
		const { collection, data } = query;
		const coll = this._getCollection(collection);
		const opts = this._session
			? {
					session: this._session,
				}
			: {};

		if (query.id_gen === false && !data._id) {
			const dataToInsert = {
				...data,
				_vdb_no_id: true,
			};
			await coll.insertOne(dataToInsert, opts);
			return data;
		}

		await addId(query, this);

		await coll.insertOne(data, opts);
		return data;
	}

	async find(query: VQueryT.Find) {
		const { collection, search, dbFindOpts = {}, findOpts, context } = query;
		const coll = this._getCollection(collection);
		const opts = this._session
			? {
					session: this._session,
				}
			: {};

		const {
			reverse = false,
			offset = 0,
			limit = -1,
			sortBy,
			sortAsc = true,
			min,
			max,
			avg,
			groupBy,
			count,
			sum,
			distinct,
		} = dbFindOpts;

		const needsAggregation =
			min || max || avg || groupBy || count || sum || distinct;
		const searchIsFunc = typeof search === "function";
		const needsNativeFallback = !searchIsFunc && !needsJsFallback(search);
		const canUseNative =
			needsNativeFallback &&
			!needsAggregation &&
			sortBy !== "random()" &&
			!(reverse && !sortBy);

		if (canUseNative) {
			const mongoQuery = translateQuery(search);
			let cursor = coll.find(mongoQuery, opts);
			if (sortBy) {
				if (Array.isArray(sortBy)) {
					const sortObj: Record<string, 1 | -1> = {};
					for (const s of sortBy) {
						sortObj[s.field as string] = s.asc === false ? -1 : 1;
					}
					cursor = cursor.sort(sortObj);
				} else {
					cursor = cursor.sort({
						[sortBy]: sortAsc ? 1 : -1,
					});
				}
			}
			if (offset > 0) cursor = cursor.skip(offset);
			if (limit === 0) return [];
			if (limit !== -1) cursor = cursor.limit(limit);
			const results = await cursor.toArray();
			return this._applyFindOpts(cleanDocs(results), findOpts);
		}

		if (needsAggregation && needsNativeFallback) {
			const mongoQuery = translateQuery(search);
			const results = await nativeAggregate(coll, mongoQuery, dbFindOpts, opts);
			return this._applyFindOpts(results, findOpts);
		}

		if (searchIsFunc) {
			const all = await coll.find({}, opts).toArray();
			const filtered = cleanDocs(all).filter((d: any) => search(d, context));
			const results = await findUtil(query, filtered, [
				"",
			]);
			return this._applyFindOpts(results, findOpts);
		}

		if (needsJsFallback(search)) {
			const all = await coll.find({}, opts).toArray();
			const allData = cleanDocs(all).filter((d: any) =>
				hasFieldsAdvanced(d, search),
			);
			const results = await findUtil(query, allData, [
				"",
			]);
			return this._applyFindOpts(results, findOpts);
		}

		const mongoQuery = translateQuery(search);
		const results = await coll.find(mongoQuery, opts).toArray();
		const clean = cleanDocs(results);
		const found = await findUtil(query, clean, [
			"",
		]);
		return this._applyFindOpts(found, findOpts);
	}

	async findOne(query: VQueryT.FindOne) {
		const { collection, search, findOpts, context } = query;
		const coll = this._getCollection(collection);
		const opts = this._session
			? {
					session: this._session,
				}
			: {};

		if (typeof search === "function") {
			const all = await coll.find({}, opts).toArray();
			const found = cleanDocs(all).find((d: any) => search(d, context));
			return this._applyFindOpts(found ?? null, findOpts);
		}

		if (needsJsFallback(search)) {
			const all = await coll.find({}, opts).toArray();
			const found = cleanDocs(all).find((d: any) =>
				hasFieldsAdvanced(d, search),
			);
			return this._applyFindOpts(found ?? null, findOpts);
		}

		const mongoQuery = translateQuery(search);
		const result = await coll.findOne(mongoQuery, opts);
		return this._applyFindOpts(cleanDocs(result), findOpts);
	}

	async update(query: VQueryT.Update) {
		const { collection, search, updater, context } = query;
		const coll = this._getCollection(collection);
		const opts = this._session
			? {
					session: this._session,
				}
			: {};

		if (typeof updater === "function") {
			const { filter, allData } = await resolveSearch(
				search,
				coll,
				context,
				opts,
			);
			const toUpdate = allData ?? (await coll.find(filter, opts).toArray());
			const updated = [];
			for (const doc of cleanDocs(toUpdate)) {
				const mod = updater(doc, context);
				if (mod) {
					await coll.updateOne(
						{
							_id: doc._id,
						},
						{
							$set: mod,
						},
						opts,
					);
					Object.assign(doc, mod);
				}
				updated.push(doc);
			}
			return updated;
		}

		const { filter, allData } = await resolveSearch(
			search,
			coll,
			context,
			opts,
		);
		if (allData !== null) {
			const mongoUpdate = translateUpdater(updater);
			if (!isEmptyUpdate(mongoUpdate)) {
				for (const doc of allData) {
					await coll.updateOne(
						{
							_id: doc._id,
						},
						mongoUpdate,
						opts,
					);
				}
			}
			return allData;
		}

		const mongoUpdate = translateUpdater(updater);
		if (!isEmptyUpdate(mongoUpdate)) {
			await coll.updateMany(filter!, mongoUpdate, opts);
			const result = await coll.find(filter, opts).toArray();
			return cleanDocs(result);
		}
		const emptyResult = await coll.find(filter, opts).toArray();
		return cleanDocs(emptyResult);
	}

	async updateOne(query: VQueryT.Update) {
		const { collection, search, updater, context } = query;
		const coll = this._getCollection(collection);
		const opts = this._session
			? {
					session: this._session,
				}
			: {};

		if (typeof updater === "function") {
			const { filter, allData } = await resolveSearch(
				search,
				coll,
				context,
				opts,
			);

			let doc: any;
			if (allData !== null) {
				doc = allData[0] ?? null;
			} else {
				doc = await coll.findOne(filter, opts);
			}

			if (!doc) return null;
			const mod = updater(doc, context);
			if (mod) {
				await coll.updateOne(
					{
						_id: doc._id,
					},
					{
						$set: mod,
					},
					opts,
				);
				Object.assign(doc, mod);
			}
			return cleanDocs(doc) as DataInternal | null;
		}

		const { filter, allData } = await resolveSearch(
			search,
			coll,
			context,
			opts,
		);

		if (allData !== null) {
			const doc = allData[0] ?? null;
			if (!doc) return null;
			const mongoUpdate = translateUpdater(updater);
			if (!isEmptyUpdate(mongoUpdate)) {
				await coll.updateOne(
					{
						_id: doc._id,
					},
					mongoUpdate,
					opts,
				);
			}
			return doc;
		}

		const mongoUpdate = translateUpdater(updater);
		const result = await coll.findOne(filter, opts);
		if (!result) return null;
		if (!isEmptyUpdate(mongoUpdate)) {
			await coll.updateOne(filter, mongoUpdate, opts);
			const updated = await coll.findOne(filter, opts);
			return cleanDocs(updated) as DataInternal | null;
		}
		return cleanDocs(result) as DataInternal | null;
	}

	async remove(query: VQueryT.Remove) {
		const { collection, search, context } = query;
		const coll = this._getCollection(collection);
		const opts = this._session
			? {
					session: this._session,
				}
			: {};

		const { filter, allData } = await resolveSearch(
			search,
			coll,
			context,
			opts,
		);

		if (allData !== null) {
			for (const doc of allData) {
				await coll.deleteOne(
					{
						_id: doc._id,
					},
					opts,
				);
			}
			return allData;
		}

		const result = await coll.find(filter, opts).toArray();
		await coll.deleteMany(filter, opts);
		return cleanDocs(result) as DataInternal[];
	}

	async removeOne(query: VQueryT.Remove) {
		const { collection, search, context } = query;
		const coll = this._getCollection(collection);
		const opts = this._session
			? {
					session: this._session,
				}
			: {};

		const { filter, allData } = await resolveSearch(
			search,
			coll,
			context,
			opts,
		);

		if (allData !== null) {
			const doc = allData[0] ?? null;
			if (doc)
				await coll.deleteOne(
					{
						_id: doc._id,
					},
					opts,
				);
			return doc;
		}

		const result = await coll.findOne(filter, opts);
		if (result) await coll.deleteOne(filter, opts);
		return cleanDocs(result) as DataInternal | null;
	}

	async getCollections() {
		const collections = await this._db.listCollections().toArray();
		return collections.map(c => c.name);
	}

	async ensureCollection(collection: string) {
		if (await this.issetCollection(collection)) return false;

		try {
			await this._db.createCollection(collection);
			return true;
		} catch (error: any) {
			if (error.codeName === "NamespaceExists") return false;
			throw error;
		}
	}

	async issetCollection(collection: string) {
		const collections = await this.getCollections();
		return collections.includes(collection);
	}

	async removeCollection(collection: string) {
		try {
			await this._db.dropCollection(collection);
			return true;
		} catch (error: any) {
			if (error.codeName === "NamespaceNotFound") return true;
			throw error;
		}
	}

	async beginTransaction(id: Id): Promise<TransactionHandle> {
		this._session = this._client.startSession();
		this._session.startTransaction();
		return {
			id,
			_adapterData: this._session,
		};
	}

	async commitTransaction(handle: TransactionHandle) {
		const session = handle._adapterData as ClientSession;
		await session.commitTransaction();
		await session.endSession();
		this._session = null;
	}

	async rollbackTransaction(handle: TransactionHandle) {
		const session = handle._adapterData as ClientSession;
		await session.abortTransaction();
		await session.endSession();
		this._session = null;
	}

	async createIndex(config: VQueryT.CreateIndex) {
		const { collection, index } = config;
		const { fields, opts } = index;
		const coll = this._getCollection(collection);
		const keys: Record<string, 1> = {};
		for (const field of fields) {
			keys[field] = 1;
		}
		await coll.createIndex(keys, {
			unique: opts?.unique,
			name: opts?.name,
		});
	}
}
