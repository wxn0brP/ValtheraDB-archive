import { Id } from "@wxn0brp/db-core";
import { ActionsBase } from "@wxn0brp/db-core/base/actions";
import {
	AdapterCloseError,
	AdapterError,
	AdapterInitError,
	ErrorCodes,
	TransactionError,
} from "@wxn0brp/db-core/errors";
import { DataInternal } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { TransactionHandle } from "@wxn0brp/db-core/types/transaction";
import { updateFindObject } from "@wxn0brp/db-core/utils/updateFindObject";
import {
	ClientSession,
	Collection,
	Db,
	MongoClient,
	MongoClientOptions,
} from "mongodb";
import { add, bulkAdd } from "./add";
import { find, findOne } from "./find";
import { remove, removeOne } from "./remove";
import { update, updateOne } from "./update";
import { needsJsFallback, translateQuery } from "./utils";
import { version } from "./version";

export class MongoDbAction extends ActionsBase {
	_client: MongoClient;
	_db: Db;
	_session: ClientSession | null = null;
	version = version;
	capabilities = {
		transactions: true,
		indexes: true,
		persistent: true,
	};

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
		try {
			await this._client.connect();
		} catch (err) {
			throw new AdapterInitError(err, {
				db: this._db.databaseName,
			});
		}
	}

	async close() {
		try {
			await this._client.close();
		} catch (err) {
			throw new AdapterCloseError(err, {
				db: this._db.databaseName,
			});
		}
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

	add(query: VQueryT.Add) {
		return add(this, query);
	}

	bulkAdd(query: VQueryT.BulkAdd) {
		return bulkAdd(this, query);
	}

	find(query: VQueryT.Find) {
		return find(this, query);
	}

	findOne(query: VQueryT.FindOne) {
		return findOne(this, query);
	}

	update(config: VQueryT.Update) {
		return update(this, config);
	}

	updateOne(config: VQueryT.Update) {
		return updateOne(this, config);
	}

	remove(config: VQueryT.Remove) {
		return remove(this, config);
	}

	removeOne(config: VQueryT.Remove) {
		return removeOne(this, config);
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
			throw new AdapterError(error, {
				op: "ensureCollection",
				collection,
			});
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
			throw new AdapterError(error, {
				op: "removeCollection",
				collection,
			});
		}
	}

	async beginTransaction(id: Id): Promise<TransactionHandle> {
		if (this._session)
			throw new TransactionError("transaction already active", {
				code: ErrorCodes.TRANSACTION_FAILED,
				context: {
					op: "beginTransaction",
					handle: id,
				},
			});

		this._session = this._client.startSession();
		this._session.startTransaction();
		return {
			id,
			_adapterData: this._session,
		};
	}

	async commitTransaction(handle: TransactionHandle) {
		const session = handle._adapterData as ClientSession;
		try {
			await session.commitTransaction();
			await session.endSession();
		} catch (err) {
			this._session = null;
			throw new TransactionError("Transaction commit failed", {
				cause: err,
				context: {
					op: "commitTransaction",
					handle: handle.id,
				},
			});
		}
		this._session = null;
	}

	async rollbackTransaction(handle: TransactionHandle) {
		const session = handle._adapterData as ClientSession;
		try {
			await session.abortTransaction();
			await session.endSession();
		} catch (err) {
			this._session = null;
			throw new TransactionError("Transaction rollback failed", {
				cause: err,
				context: {
					op: "rollbackTransaction",
					handle: handle.id,
				},
			});
		}
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

	async removeIndex(config: VQueryT.RemoveIndex) {
		const { collection, index } = config;
		const { fields, opts } = index;
		const coll = this._getCollection(collection);
		const indexName = opts?.name || `idx_${collection}_${fields.join("_")}`;
		await coll.dropIndex(indexName);
	}

	async count(config: VQueryT.Count): Promise<number> {
		const { collection, search } = config;
		const coll = this._getCollection(collection);
		const opts = this._session
			? {
					session: this._session,
				}
			: {};

		if (typeof search === "function" || needsJsFallback(search)) {
			return (await this.find(config as VQueryT.Find)).length;
		}

		const mongoQuery = translateQuery(search);
		return await coll.countDocuments(mongoQuery, opts);
	}
}
