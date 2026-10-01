import { CustomFileCpu } from "@wxn0brp/db-core";
import { CustomActionsBase } from "@wxn0brp/db-core/base/custom";
import { version } from "./version";

export interface AsyncStorageLike {
	getItem(key: string): Promise<string | null>;
	setItem(key: string, value: string): Promise<void>;
	removeItem(key: string): Promise<void>;
	getAllKeys(): Promise<readonly string[]>;
}

export class RNAsyncStorageActions extends CustomActionsBase {
	version = version;

	constructor(
		public name: string,
		public _storage: AsyncStorageLike,
	) {
		super();
		this.fileCpu = new CustomFileCpu(
			this._read.bind(this),
			this._write.bind(this),
		);
	}

	_getPath(collection: string) {
		return "vdb_" + this.name + "_" + collection;
	}

	async _read(collection: string) {
		const data = await this._storage.getItem(this._getPath(collection));
		return data ? JSON.parse(data) : [];
	}

	async _write(collection: string, data: object[]) {
		await this._storage.setItem(
			this._getPath(collection),
			JSON.stringify(data),
		);
	}

	async ensureCollection(collection: string) {
		const key = this._getPath(collection);
		const existing = await this._storage.getItem(key);
		if (existing === null) {
			await this._storage.setItem(key, JSON.stringify([]));
		}
		return true;
	}

	async issetCollection(collection: string) {
		const data = await this._storage.getItem(this._getPath(collection));
		return data !== null;
	}

	async getCollections() {
		const keys = await this._storage.getAllKeys();
		const prefix = "vdb_" + this.name + "_";
		return keys
			.filter(key => key.startsWith(prefix))
			.map(key => key.replace(prefix, ""));
	}

	async removeCollection(collection: string) {
		await this._storage.removeItem(this._getPath(collection));
		return true;
	}
}
