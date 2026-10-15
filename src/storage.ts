import { CustomFileCpu } from "@wxn0brp/db-core";
import { CustomActionsBase } from "@wxn0brp/db-core/base/custom";
import { addIdBulk } from "@wxn0brp/db-core/helpers/addId";
import { DataInternal } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { hasFieldsAdvanced } from "@wxn0brp/db-core/utils/hasFieldsAdvanced";
import { version } from "./version";

export class WebStorageActions extends CustomActionsBase {
	version = version;
	capabilities = {
		transactions: false,
		indexes: false,
		persistent: true,
	};

	constructor(
		public name: string,
		public _storage: Storage = localStorage,
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

	_read(collection: string) {
		const data = this._storage.getItem(this._getPath(collection));
		return data ? JSON.parse(data) : [];
	}

	_write(collection: string, data: object[]) {
		this._storage.setItem(this._getPath(collection), JSON.stringify(data));
	}

	async ensureCollection(collection: string): Promise<boolean> {
		const key = this._getPath(collection);
		if (!this._storage.getItem(key))
			this._storage.setItem(key, JSON.stringify([]));
		return true;
	}

	async issetCollection(collection: string): Promise<boolean> {
		return !!this._storage.getItem(this._getPath(collection));
	}

	async getCollections(): Promise<string[]> {
		const keys = [];
		const prefix = "vdb_" + this.name + "_";
		for (let i = 0; i < this._storage.length; i++) {
			const key = this._storage.key(i);
			if (key.startsWith(prefix)) keys.push(key.replace(prefix, ""));
		}
		return keys;
	}

	async removeCollection(collection: string): Promise<boolean> {
		this._storage.removeItem(this._getPath(collection));
		return true;
	}

	async bulkAdd(query: VQueryT.BulkAdd): Promise<DataInternal[]> {
		await this.ensureCollection(query.collection);
		await addIdBulk(query, this);

		const data = this._read(query.collection);
		data.push(...query.datas);
		this._write(query.collection, data);

		return query.datas as DataInternal[];
	}

	async count(config: VQueryT.Count): Promise<number> {
		const data = this._read(config.collection);
		if (data.length === 0) return 0;

		const { search } = config;
		if (
			!search ||
			(typeof search === "object" && Object.keys(search).length === 0)
		) {
			return data.length;
		}

		let count = 0;
		for (const item of data) if (hasFieldsAdvanced(item, search)) count++;
		return count;
	}
}
