import { Id } from "@wxn0brp/db-core";
import {
	AdapterCapabilities,
	ActionsBaseInterface,
} from "@wxn0brp/db-core/types/action";
import { DataInternal } from "@wxn0brp/db-core/types/data";
import { AdapterOpts } from "@wxn0brp/db-core/types/options";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { TransactionHandle } from "@wxn0brp/db-core/types/transaction";
import { BaseRemote } from "./base";

export class RemoteActionsBase
	extends BaseRemote
	implements ActionsBaseInterface
{
	_inited: boolean = false;
	// TODO: client don't send adapterOpts to server
	adapterOpts: AdapterOpts;
	smartExecutor: boolean = true;
	capabilities: AdapterCapabilities = {
		transactions: false,
		indexes: false,
		persistent: true,
	};

	private _capsLoaded = false;

	async init(...args: any[]) {
		if (this._capsLoaded) return;
		this._capsLoaded = true;
		try {
			const caps = await this._request<AdapterCapabilities>("capabilities");
			if (caps) this.capabilities = caps;
		} catch {}
	}

	async close(...args: any[]) {}

	async getCollections() {
		return this._request<string[]>("getCollections");
	}

	async ensureCollection(collection: string, tx?: TransactionHandle) {
		return this._request<boolean>("ensureCollection", {
			collection,
			transaction: tx,
		});
	}

	async issetCollection(collection: string, tx?: TransactionHandle) {
		return this._request<boolean>("issetCollection", {
			collection,
			transaction: tx,
		});
	}

	async removeCollection(collection: string, tx?: TransactionHandle) {
		return this._request<boolean>("removeCollection", {
			collection,
			transaction: tx,
		});
	}

	async add(config: VQueryT.Add) {
		return this._request<DataInternal>("add", config);
	}

	async find(config: VQueryT.Find) {
		return this._find<DataInternal>(config);
	}

	async findOne(config: VQueryT.FindOne) {
		return this._findOne<DataInternal>(config);
	}

	async update(config: VQueryT.Update) {
		return this._request<DataInternal[]>("update", config);
	}

	async updateOne(config: VQueryT.Update) {
		return this._request<DataInternal | null>("updateOne", config);
	}

	async remove(config: VQueryT.Remove) {
		return this._request<DataInternal[]>("remove", config);
	}

	async removeOne(config: VQueryT.Remove) {
		return this._request<DataInternal | null>("removeOne", config);
	}

	async updateOneOrAdd(config: VQueryT.UpdateOneOrAdd) {
		return this._request<VQueryT.UpdateOneOrAddResult<DataInternal>>(
			"updateOneOrAdd",
			config,
		);
	}

	async toggleOne(config: VQueryT.ToggleOne) {
		return this._request<VQueryT.ToggleOneResult<DataInternal>>(
			"toggleOne",
			config,
		);
	}

	async beginTransaction(
		_id: Id,
		collections: string[],
	): Promise<TransactionHandle> {
		return this._request<TransactionHandle>("beginTransaction", {
			collections,
		});
	}

	async commitTransaction(handle: TransactionHandle) {
		await this._request("commitTransaction", {
			transaction: handle,
		});
	}

	async rollbackTransaction(handle: TransactionHandle) {
		await this._request("rollbackTransaction", {
			transaction: handle,
		});
	}

	async createIndex(config: VQueryT.CreateIndex) {}
	async removeIndex(config: VQueryT.RemoveIndex) {}

	async count(config: VQueryT.Count): Promise<number> {
		return this._request<number>("count", config);
	}

	async bulkAdd(config: VQueryT.BulkAdd): Promise<DataInternal[]> {
		return this._request<DataInternal[]>("bulkAdd", config);
	}
}
