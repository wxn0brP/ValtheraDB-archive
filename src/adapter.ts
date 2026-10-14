import { ActionsBase } from "@wxn0brp/db-core/base/actions";
import { addId, addIdBulk } from "@wxn0brp/db-core/helpers/addId";
import { DataInternal } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { findUtil } from "@wxn0brp/db-core/utils/action";
import { findObj, matchObj, updateObj } from "@wxn0brp/db-core/utils/process";
import { FLAG_ALIVE, FLAG_DELETED } from "./const";
import { SegmentManager } from "./segment";
import { AnyRecord } from "./types";
import { version } from "./version";

function normalizeLogDoc(data: any) {
	return {
		_id: String(data._id ?? ""),
		l: String(data.l ?? ""),
	};
}

function resolveRecords(records: AnyRecord[]) {
	const alive = new Map<
		string,
		{
			_id: string;
			l: string;
		}
	>();

	for (const rec of records) {
		if (rec.flag === FLAG_DELETED) {
			alive.delete(rec._id);
		} else if (rec.flag === FLAG_ALIVE) {
			alive.set(rec._id, {
				_id: rec._id,
				l: rec.l,
			});
		}
	}

	return Array.from(alive.values());
}

export class LogAdapter extends ActionsBase {
	private _segments: SegmentManager;
	_inited = false;
	version = version;

	constructor(rootDir: string) {
		super();
		this._segments = new SegmentManager(rootDir);
	}

	async init() {
		await this._segments.ensureCollection("__vdb_id");
		this._inited = true;
	}

	async close() {
		await this._segments.close();
	}

	[Symbol.asyncDispose]() {
		return this.close();
	}

	async getCollections() {
		const all = await this._segments.getCollections();
		return all.filter(c => c !== "__vdb_id");
	}

	async issetCollection(collection: string) {
		if (collection === "__vdb_id") return false;
		return await this._segments.issetCollection(collection);
	}

	async ensureCollection(collection: string) {
		if (collection === "__vdb_id") return false;
		const exists = await this._segments.issetCollection(collection);
		if (exists) return false;
		await this._segments.ensureCollection(collection);
		return true;
	}

	async removeCollection(collection: string) {
		if (collection === "__vdb_id") return false;
		await this._segments.removeCollection(collection);
		return true;
	}

	async add(config: VQueryT.Add) {
		await this.ensureCollection(config.collection);
		await addId(config, this, true);

		const normalized = normalizeLogDoc(config.data);
		config.data = normalized;

		await this._segments.appendDataRecord(
			config.collection,
			normalized._id,
			normalized.l,
		);
		return normalized;
	}

	async bulkAdd(config: VQueryT.BulkAdd) {
		await this.ensureCollection(config.collection);
		await addIdBulk(config, this, true);

		const normalized = config.datas.map(d => normalizeLogDoc(d));
		config.datas = normalized;

		await this._segments.appendDataRecords(config.collection, normalized);
		return normalized;
	}

	async find(config: VQueryT.Find) {
		await this.ensureCollection(config.collection);
		const records = await this._segments.scanCollection(config.collection);
		const alive = resolveRecords(records);

		const projected = alive
			.map(doc => findObj(config, doc))
			.filter((d): d is NonNullable<typeof d> => d !== null);

		return findUtil(config, projected, []);
	}

	async findOne(config: VQueryT.FindOne) {
		await this.ensureCollection(config.collection);
		const records = await this._segments.scanCollection(config.collection);
		const alive = resolveRecords(records);

		for (const doc of alive) {
			const result = findObj(config, doc);
			if (result) return result;
		}

		return null;
	}

	async update(config: VQueryT.Update) {
		await this.ensureCollection(config.collection);
		const records = await this._segments.scanCollection(config.collection);
		const alive = resolveRecords(records);

		const matched = alive.filter(doc => matchObj(config, doc));
		if (matched.length === 0) return [];

		const results: DataInternal[] = [];

		for (const doc of matched) {
			const updated = updateObj(config, {
				...doc,
			});
			const normalized = normalizeLogDoc(updated);

			await this._segments.appendTombstone(config.collection, doc._id);
			await this._segments.appendDataRecord(
				config.collection,
				normalized._id,
				normalized.l,
			);

			results.push(normalized);
		}

		return results;
	}

	async updateOne(config: VQueryT.Update) {
		await this.ensureCollection(config.collection);
		const records = await this._segments.scanCollection(config.collection);
		const alive = resolveRecords(records);

		for (const doc of alive) {
			const result = findObj(config, doc);
			if (result) {
				const updated = updateObj(config, {
					...doc,
				});
				const normalized = normalizeLogDoc(updated);

				await this._segments.appendTombstone(config.collection, doc._id);
				await this._segments.appendDataRecord(
					config.collection,
					normalized._id,
					normalized.l,
				);

				return normalized;
			}
		}

		return null;
	}

	async remove(config: VQueryT.Remove) {
		await this.ensureCollection(config.collection);
		const records = await this._segments.scanCollection(config.collection);
		const alive = resolveRecords(records);

		const matched = alive.filter(doc => matchObj(config, doc));
		if (matched.length === 0) return [];

		for (const doc of matched) {
			await this._segments.appendTombstone(config.collection, doc._id);
		}

		return matched;
	}

	async removeOne(config: VQueryT.Remove) {
		await this.ensureCollection(config.collection);
		const records = await this._segments.scanCollection(config.collection);
		const alive = resolveRecords(records);

		for (const doc of alive) {
			const result = findObj(config, doc);
			if (result) {
				await this._segments.appendTombstone(config.collection, doc._id);
				return result;
			}
		}

		return null;
	}

	async count(config: VQueryT.Count) {
		await this.ensureCollection(config.collection);
		const records = await this._segments.scanCollection(config.collection);
		const alive = resolveRecords(records);

		const matched = alive.filter(doc => matchObj(config, doc));
		return matched.length;
	}
}
