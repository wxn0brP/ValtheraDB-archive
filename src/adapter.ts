import { AdapterBase } from "@wxn0brp/db-core/base/adapter";
import {
	AdapterCloseError,
	AdapterError,
	AdapterInitError,
	isValtheraError,
} from "@wxn0brp/db-core/errors";
import { addId } from "@wxn0brp/db-core/helpers/addId";
import { DataInternal } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { findUtil } from "@wxn0brp/db-core/utils/findUtil";
import { add } from "./bin/add";
import { ensureCollection, removeCollection } from "./bin/collection";
import { find, findOne } from "./bin/find";
import { BinManager, Options } from "./bin/index";
import { optimize } from "./bin/optimize";
import { remove } from "./bin/remove";
import { COLLECTION_HEADER_SIZE } from "./bin/static";
import { update } from "./bin/update";
import { version } from "./version";

export class BinAdapter extends AdapterBase {
	public readonly manager: BinManager;
	_inited = false;
	version = version;
	capabilities: AdapterBase["capabilities"] = {
		transactions: false,
		indexes: false,
		persistent: true,
	};

	constructor(path: string, options?: Partial<Options>) {
		super();
		this.manager = new BinManager(path, options);
	}

	async init() {
		try {
			return await this.manager.init();
		} catch (err) {
			if (isValtheraError(err)) throw err;
			throw new AdapterInitError(err, {
				version: this.version,
			});
		}
	}

	async close() {
		try {
			return await this.manager.close();
		} catch (err) {
			if (isValtheraError(err)) throw err;
			throw new AdapterCloseError(err, {
				version: this.version,
			});
		}
	}

	[Symbol.asyncDispose]() {
		return this.manager.close();
	}

	async getCollections() {
		return this.manager.meta.collections.map(c => c.name);
	}

	async issetCollection(collection: string) {
		return this.manager.meta.collectionByName.has(collection);
	}

	async ensureCollection(collection: string) {
		if (!this.manager.fd)
			throw new AdapterError("File not open", {
				op: "ensureCollection",
			});
		if (this.manager.meta.collectionByName.has(collection)) return false;
		await ensureCollection(this.manager, collection, COLLECTION_HEADER_SIZE);
		return true;
	}

	async optimize() {
		if (!this.manager.fd)
			throw new AdapterError("File not open", {
				op: "optimize",
			});
		await optimize(this.manager);
	}

	async removeCollection(collection: string) {
		if (!this.manager.fd)
			throw new AdapterError("File not open", {
				op: "removeCollection",
			});
		if (!this.manager.meta.collectionByName.has(collection)) return false;
		await removeCollection(this.manager, collection);
		return true;
	}

	async add(config: VQueryT.Add): Promise<DataInternal> {
		await this.ensureCollection(config.collection);
		await addId(config, this, true);
		await add(this.manager, config);
		return config.data;
	}

	async find(config: VQueryT.Find): Promise<DataInternal[]> {
		await this.ensureCollection(config.collection);
		const data = await find(this.manager, config);
		return findUtil(config, data, [
			"",
		]);
	}

	async findOne(config: VQueryT.FindOne): Promise<DataInternal | null> {
		await this.ensureCollection(config.collection);
		return await findOne(this.manager, config);
	}

	async update(config: VQueryT.Update): Promise<DataInternal[]> {
		await this.ensureCollection(config.collection);
		return await update(this.manager, config, false);
	}

	async updateOne(config: VQueryT.Update): Promise<DataInternal | null> {
		await this.ensureCollection(config.collection);
		const data = await update(this.manager, config, true);
		return data[0] ?? null;
	}

	async remove(config: VQueryT.Remove): Promise<DataInternal[]> {
		await this.ensureCollection(config.collection);
		return await remove(this.manager, config, false);
	}

	async removeOne(config: VQueryT.Remove): Promise<DataInternal | null> {
		await this.ensureCollection(config.collection);
		const data = await remove(this.manager, config, true);
		return data[0] ?? null;
	}
}
