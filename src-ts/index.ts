import { setDataForUpdateOneOrAdd } from "@wxn0brp/db-core/helpers/queryData";
import { DataInternal } from "@wxn0brp/db-core/types/data";
import { FileCpu } from "@wxn0brp/db-core/types/fileCpu";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { findUtil } from "@wxn0brp/db-core/utils/findUtil";
import { vFileCpu } from "@wxn0brp/db-storage-dir";
import { FileAdapter } from "@wxn0brp/db-storage-dir/adapter";
import { DbDirOpts } from "@wxn0brp/db-storage-dir/types";
import { find, findPaged, remove, update } from "./native";

const nativeSearchOps = new Set([
	"$and",
	"$or",
	"$not",
	"$subset",
	"$gt",
	"$lt",
	"$gte",
	"$lte",
	"$in",
	"$nin",
	"$exists",
	"$type",
	"$regex",
	"$size",
	"$startswith",
	"$endswith",
	"$between",
	"$arrinc",
	"$arrincall",
	"$idgt",
	"$idlt",
	"$idgte",
	"$idlte",
]);

const nativeArraySearchOps = new Set([
	"$and",
	"$or",
]);
const nativeArrayLeafSearchOps = new Set([
	"$in",
	"$nin",
	"$arrinc",
	"$arrincall",
]);
const nativeStringLeafSearchOps = new Set([
	"$type",
	"$startswith",
	"$endswith",
]);

function isPlainSearch(search: unknown) {
	if (search === undefined || search === null) return true;
	if (typeof search !== "object" || Array.isArray(search)) return false;

	const proto = Object.getPrototypeOf(search);
	return proto === Object.prototype || proto === null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;

	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

function isJsonSerializable(value: unknown) {
	if (
		value === undefined ||
		typeof value === "function" ||
		typeof value === "symbol" ||
		typeof value === "bigint"
	)
		return false;

	if (Array.isArray(value)) return value.every(isJsonSerializable);

	if (value && typeof value === "object")
		return Object.values(value).every(isJsonSerializable);

	return true;
}

function isValidBetweenLeaf(leaf: unknown) {
	return (
		Array.isArray(leaf) &&
		leaf.length === 2 &&
		typeof leaf[0] === "number" &&
		typeof leaf[1] === "number"
	);
}

function canUseNativeSearch(value: unknown) {
	if (value instanceof RegExp) return false;
	if (value && typeof value === "object") {
		return Object.entries(value).every(([key, item]) => {
			if (!key.startsWith("$")) return canUseNativeSearch(item);
			const op = key.toLowerCase();
			if (!nativeSearchOps.has(op)) return false;
			if (nativeArraySearchOps.has(op))
				return (
					Array.isArray(item) &&
					item.every(el => isPlainObject(el) && canUseNativeSearch(el))
				);
			if (op === "$not" || op === "$subset")
				return isPlainObject(item) && canUseNativeSearch(item);
			if (!isPlainObject(item)) return false;
			if (nativeArrayLeafSearchOps.has(op))
				return leavesMatch(item, leaf => Array.isArray(leaf));
			if (op === "$between") return leavesMatch(item, isValidBetweenLeaf);
			if (nativeStringLeafSearchOps.has(op))
				return leavesMatch(item, leaf => typeof leaf === "string");
			return canUseNativeSearch(item);
		});
	}
	return true;
}

function leavesMatch(value: unknown, check: (leaf: unknown) => boolean) {
	if (isPlainObject(value))
		return Object.values(value).every(item => leavesMatch(item, check));
	return check(value);
}

function canUseNativeUpdater(updater: VQueryT.Update["updater"]) {
	if (!isPlainObject(updater) || !isJsonSerializable(updater)) return false;

	for (const [key, value] of Object.entries(updater)) {
		if (!key.startsWith("$")) continue;

		const op = key.toLowerCase();
		if (
			![
				"$set",
				"$unset",
				"$inc",
				"$dec",
			].includes(op)
		)
			return false;

		if (!isPlainObject(value)) return false;

		if (
			(op === "$inc" || op === "$dec") &&
			!leavesMatch(value, item => typeof item === "number")
		)
			return false;
	}

	return true;
}

function hasOptions(value: unknown) {
	return !!value && typeof value === "object" && Object.keys(value).length > 0;
}

function canPageNatively(dbFindOpts: VQueryT.Find["dbFindOpts"]) {
	if (!dbFindOpts) return false;

	const { reverse, sortBy, min, max, avg, groupBy, count } = dbFindOpts;

	return !reverse && !sortBy && !min && !max && !avg && !groupBy && !count;
}

function hasPaging(dbFindOpts: VQueryT.Find["dbFindOpts"]) {
	if (!dbFindOpts) return false;
	return dbFindOpts.offset !== undefined || dbFindOpts.limit !== undefined;
}

export class NativeActions extends FileAdapter {
	constructor(folder: string, options: DbDirOpts, fileCpu: FileCpu) {
		super(folder, options, fileCpu);
	}

	version = "0.120.2-native";

	_canUseNative(query: VQueryT.Find | VQueryT.FindOne | VQueryT.Remove) {
		const format = this.options.format;
		if (format !== "json") return false;
		if (this.activeTx || query.transaction) return false;
		if (this.options.delimiter && this.options.delimiter !== "\n") return false;
		if (this.options.stringifyArgs?.length) return false;
		return (
			isPlainSearch(query.search) &&
			isJsonSerializable(query.search ?? {}) &&
			canUseNativeSearch(query.search)
		);
	}

	_canUseNativeUpdate(query: VQueryT.Update | VQueryT.UpdateOneOrAdd) {
		return this._canUseNative(query) && canUseNativeUpdater(query.updater);
	}

	async _updateOneNative(query: VQueryT.Update | VQueryT.UpdateOneOrAdd) {
		await this.ensureCollection(query.collection);
		this._ensureQueryFormat(query);

		const cPath = this._getCollectionPath(query.collection);
		const data = update(cPath, query.search, query.updater, true);
		return data[0] ?? null;
	}

	async find(query: VQueryT.Find) {
		if (!this._canUseNative(query) || hasOptions(query.findOpts))
			return super.find(query);

		await this.ensureCollection(query.collection);
		this._ensureQueryFormat(query);

		const cPath = this._getCollectionPath(query.collection);

		if (hasPaging(query.dbFindOpts) && canPageNatively(query.dbFindOpts)) {
			const { offset = 0, limit = -1 } = query.dbFindOpts!;
			return findPaged(cPath, query.search, offset, limit);
		}

		const data = find(cPath, query.search, false);
		const res = await findUtil(query, data, [
			"",
		]);
		return res || [];
	}

	async findOne(query: VQueryT.FindOne) {
		if (!this._canUseNative(query) || hasOptions(query.findOpts))
			return super.findOne(query);

		await this.ensureCollection(query.collection);
		this._ensureQueryFormat(query);

		const cPath = this._getCollectionPath(query.collection);
		const data = find(cPath, query.search, true);
		return data || null;
	}

	async remove(query: VQueryT.Remove) {
		if (!this._canUseNative(query)) return super.remove(query);

		await this.ensureCollection(query.collection);
		this._ensureQueryFormat(query);

		const cPath = this._getCollectionPath(query.collection);
		return remove(cPath, query.search, false);
	}

	async removeOne(query: VQueryT.Remove) {
		if (!this._canUseNative(query)) return super.removeOne(query);

		await this.ensureCollection(query.collection);
		this._ensureQueryFormat(query);

		const cPath = this._getCollectionPath(query.collection);
		const data = remove(cPath, query.search, true);
		return data[0] ?? null;
	}

	async update(query: VQueryT.Update) {
		if (!this._canUseNativeUpdate(query)) return super.update(query);

		await this.ensureCollection(query.collection);
		this._ensureQueryFormat(query);

		const cPath = this._getCollectionPath(query.collection);
		return update(cPath, query.search, query.updater, false);
	}

	async updateOne(query: VQueryT.Update) {
		if (!this._canUseNativeUpdate(query)) return super.updateOne(query);

		return this._updateOneNative(query);
	}

	async updateOneOrAdd(
		query: VQueryT.UpdateOneOrAdd,
	): Promise<VQueryT.UpdateOneOrAddResult<DataInternal>> {
		if (!this._canUseNativeUpdate(query)) return super.updateOneOrAdd(query);

		const res = await this._updateOneNative(query);
		if (res)
			return {
				data: res,
				type: "updated",
			};

		setDataForUpdateOneOrAdd(query);

		return {
			data: await this.add(query as any),
			type: "added",
		};
	}
}

export const DYNAMIC = {
	def: (folder: string, options: DbDirOpts = {}) =>
		new NativeActions(folder, options, vFileCpu),
};
