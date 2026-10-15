import { ActionsBase } from "@wxn0brp/db-core/base/actions";
import {
	AdapterCloseError,
	AdapterError,
	AdapterInitError,
} from "@wxn0brp/db-core/errors";
import { addId, addIdBulk } from "@wxn0brp/db-core/helpers/addId";
import { DataInternal } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { findObj, matchObj, updateObj } from "@wxn0brp/db-core/utils/process";
import { version } from "./version";

export class IndexedDBActions extends ActionsBase {
	db: IDBDatabase = null;
	_version = 1;
	_inited = false;
	version = version;
	capabilities = {
		transactions: false,
		indexes: false,
		persistent: true,
	};

	constructor(public name: string) {
		super();
	}

	_getDBName() {
		return "vdb_" + this.name;
	}

	_dbContext() {
		return {
			adapter: "IndexedDB",
			db: this._getDBName(),
		};
	}

	_requireDb(): IDBDatabase {
		if (!this.db)
			throw new AdapterError("Database not initialized", this._dbContext());
		return this.db;
	}

	async init() {
		if (this.db) return;

		try {
			await new Promise<void>((resolve, reject) => {
				const request = indexedDB.open(this._getDBName());

				request.onerror = () => reject(request.error);
				request.onsuccess = () => {
					this.db = request.result;
					this._version = this.db.version;
					this._loadVersion()
						.then(() => resolve())
						.catch(reject);
				};
				request.onupgradeneeded = event => {
					const db = request.result;
					this._version = db.version;
					if (!db.objectStoreNames.contains("_meta")) {
						db.createObjectStore("_meta");
					}
				};
			});
		} catch (err) {
			throw new AdapterInitError(err, this._dbContext());
		}
	}

	async _loadVersion() {
		if (!this.db) return;

		return new Promise<void>((resolve, reject) => {
			const tx = this.db.transaction("_meta", "readonly");
			const store = tx.objectStore("_meta");
			const request = store.get("version");

			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				this._version = request.result || 1;
				resolve();
			};
		});
	}

	async _saveVersion() {
		if (!this.db) return;

		return new Promise<void>((resolve, reject) => {
			const tx = this.db.transaction("_meta", "readwrite");
			const store = tx.objectStore("_meta");
			const request = store.put(this._version, "version");

			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
		});
	}

	async close() {
		if (!this.db) return;

		try {
			this.db.close();
			this.db = null;
		} catch (err) {
			throw new AdapterCloseError(err, this._dbContext());
		}
	}

	async _changeSchema(upgradeFn: (db: IDBDatabase) => void): Promise<void> {
		this._requireDb();

		const newVersion = this.db.version + 1;
		this.db.close();
		this.db = null;

		return new Promise<void>((resolve, reject) => {
			const request = indexedDB.open(this._getDBName(), newVersion);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				this.db = request.result;
				this._version = this.db.version;
				this._saveVersion()
					.then(() => resolve())
					.catch(reject);
			};
			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains("_meta")) {
					db.createObjectStore("_meta");
				}
				upgradeFn(db);
			};
		});
	}

	async _getStore(
		collection: string,
		mode: IDBTransactionMode,
	): Promise<IDBObjectStore> {
		this._requireDb();
		const tx = this.db.transaction(collection, mode);
		return tx.objectStore(collection);
	}

	async _getAllEntries(collection: string): Promise<DataInternal[]> {
		const store = await this._getStore(collection, "readonly");
		return new Promise((resolve, reject) => {
			const request = store.getAll();
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result || []);
		});
	}

	async ensureCollection(collection: string): Promise<boolean> {
		this._requireDb();
		if (this.db.objectStoreNames.contains(collection)) return false;

		await this._changeSchema(db => {
			if (!db.objectStoreNames.contains(collection)) {
				db.createObjectStore(collection, {
					keyPath: "_id",
				});
			}
		});
		return true;
	}

	async issetCollection(collection: string): Promise<boolean> {
		this._requireDb();
		return this.db.objectStoreNames.contains(collection);
	}

	async getCollections(): Promise<string[]> {
		this._requireDb();

		const collections: string[] = [];
		for (let i = 0; i < this.db.objectStoreNames.length; i++) {
			const name = this.db.objectStoreNames.item(i);
			if (name && name !== "_meta") {
				collections.push(name);
			}
		}
		return collections;
	}

	async removeCollection(collection: string): Promise<boolean> {
		this._requireDb();
		if (!this.db.objectStoreNames.contains(collection)) return false;

		await this._changeSchema(db => {
			if (db.objectStoreNames.contains(collection)) {
				db.deleteObjectStore(collection);
			}
		});
		return true;
	}

	async add(query: VQueryT.Add): Promise<DataInternal> {
		this._requireDb();

		await this.ensureCollection(query.collection);
		await addId(query, this);

		const { collection, data } = query;
		const store = await this._getStore(collection, "readwrite");

		return new Promise((resolve, reject) => {
			const request = store.put(data);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(data);
		});
	}

	async bulkAdd(query: VQueryT.BulkAdd): Promise<DataInternal[]> {
		this._requireDb();

		await this.ensureCollection(query.collection);
		await addIdBulk(query, this);

		const store = await this._getStore(query.collection, "readwrite");
		const tx = store.transaction;

		return new Promise<DataInternal[]>((resolve, reject) => {
			const results: DataInternal[] = [];

			tx.onerror = () => reject(new AdapterError(tx.error, this._dbContext()));
			tx.onabort = () =>
				reject(
					new AdapterError(
						tx.error ?? new Error("Transaction aborted"),
						this._dbContext(),
					),
				);
			tx.oncomplete = () => resolve(results);

			for (const data of query.datas) {
				const request = store.put(data);
				request.onerror = () =>
					reject(new AdapterError(request.error, this._dbContext()));
				request.onsuccess = () => results.push(data as DataInternal);
			}
		});
	}

	async find(query: VQueryT.Find): Promise<DataInternal[]> {
		this._requireDb();
		await this.ensureCollection(query.collection);

		const entries = await this._getAllEntries(query.collection);
		return entries.map(entry => findObj(query, entry)).filter(Boolean);
	}

	async findOne(query: VQueryT.FindOne): Promise<DataInternal | null> {
		this._requireDb();
		await this.ensureCollection(query.collection);

		const entries = await this._getAllEntries(query.collection);
		for (const entry of entries) {
			const result = findObj(query, entry);
			if (result) return result;
		}
		return null;
	}

	async update(query: VQueryT.Update): Promise<DataInternal[]> {
		this._requireDb();
		await this.ensureCollection(query.collection);

		const store = await this._getStore(query.collection, "readwrite");
		const entries = await new Promise<DataInternal[]>((resolve, reject) => {
			const request = store.getAll();
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result || []);
		});

		const updated: DataInternal[] = [];
		for (const entry of entries) {
			if (matchObj(query, entry)) {
				const updatedEntry = updateObj(query, entry);
				updated.push(updatedEntry);
				await new Promise<void>((resolve, reject) => {
					const putRequest = store.put(updatedEntry);
					putRequest.onerror = () => reject(putRequest.error);
					putRequest.onsuccess = () => resolve();
				});
			}
		}
		return updated;
	}

	async updateOne(query: VQueryT.Update): Promise<DataInternal | null> {
		this._requireDb();
		await this.ensureCollection(query.collection);

		const store = await this._getStore(query.collection, "readwrite");
		const entries = await new Promise<DataInternal[]>((resolve, reject) => {
			const request = store.getAll();
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result || []);
		});

		for (const entry of entries) {
			if (matchObj(query, entry)) {
				const updatedEntry = updateObj(query, entry);
				await new Promise<void>((resolve, reject) => {
					const putRequest = store.put(updatedEntry);
					putRequest.onerror = () => reject(putRequest.error);
					putRequest.onsuccess = () => resolve();
				});
				return updatedEntry;
			}
		}
		return null;
	}

	async remove(query: VQueryT.Remove): Promise<DataInternal[]> {
		this._requireDb();
		await this.ensureCollection(query.collection);

		const store = await this._getStore(query.collection, "readwrite");
		const entries = await new Promise<DataInternal[]>((resolve, reject) => {
			const request = store.getAll();
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result || []);
		});

		const removed: DataInternal[] = [];
		for (const entry of entries) {
			if (matchObj(query, entry)) {
				removed.push(entry);
				await new Promise<void>((resolve, reject) => {
					const deleteRequest = store.delete(entry._id as IDBValidKey);
					deleteRequest.onerror = () => reject(deleteRequest.error);
					deleteRequest.onsuccess = () => resolve();
				});
			}
		}
		return removed;
	}

	async removeOne(query: VQueryT.Remove): Promise<DataInternal | null> {
		this._requireDb();
		await this.ensureCollection(query.collection);

		const store = await this._getStore(query.collection, "readwrite");
		const entries = await new Promise<DataInternal[]>((resolve, reject) => {
			const request = store.getAll();
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result || []);
		});

		for (const entry of entries) {
			if (matchObj(query, entry)) {
				await new Promise<void>((resolve, reject) => {
					const deleteRequest = store.delete(entry._id as IDBValidKey);
					deleteRequest.onerror = () => reject(deleteRequest.error);
					deleteRequest.onsuccess = () => resolve();
				});
				return entry;
			}
		}
		return null;
	}

	async count(query: VQueryT.Count): Promise<number> {
		this._requireDb();
		await this.ensureCollection(query.collection);

		const entries = await this._getAllEntries(query.collection);
		if (entries.length === 0) return 0;

		const { search } = query;
		if (
			!search ||
			(typeof search === "object" && Object.keys(search).length === 0)
		) {
			return entries.length;
		}

		let count = 0;
		for (const entry of entries) {
			if (
				matchObj(
					{
						search,
						collection: query.collection,
					},
					entry,
				)
			) {
				count++;
			}
		}
		return count;
	}
}
