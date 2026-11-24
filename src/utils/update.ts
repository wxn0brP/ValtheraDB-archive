import { QueryValidationError } from "@wxn0brp/db-core/errors";
import { hasFieldsAdvanced } from "@wxn0brp/db-core/utils/hasFieldsAdvanced";
import { isUnsafeKey } from "@wxn0brp/db-core/utils/security";
import { updateObjectAdvanced } from "@wxn0brp/db-core/utils/updateOperators";
import { Collection } from "mongodb";
import { cleanDocs, needsJsFallback, translateQuery } from ".";

const KNOWN_UPDATE_OPS = new Set([
	"$inc",
	"$dec",
	"$push",
	"$pushset",
	"$pull",
	"$pushall",
	"$pullall",
	"$unset",
	"$rename",
	"$set",
	"$merge",
	"$deepmerge",
]);

const JS_UPDATE_OPS = new Set([
	"$merge",
	"$deepmerge",
]);

export function needsJsUpdater(updater: any): boolean {
	if (!updater || typeof updater !== "object") return false;
	return Object.keys(updater).some(key => JS_UPDATE_OPS.has(key.toLowerCase()));
}

export function applyJsUpdater(doc: Record<string, any>, updater: any) {
	updateObjectAdvanced(doc, updater);
	return doc;
}

function assignSafe(target: Record<string, any>, source: Record<string, any>) {
	for (const key in source) {
		if (!Object.hasOwn(source, key) || isUnsafeKey(key)) continue;
		target[key] = source[key];
	}
}

export function translateUpdater(updater: any): Record<string, any> {
	if (!updater || typeof updater !== "object")
		return {
			$set: updater,
		};

	const mongoUpdate: Record<string, any> = {};
	const directSet: Record<string, any> = {};

	for (const key in updater) {
		if (!Object.hasOwn(updater, key) || isUnsafeKey(key)) continue;
		if (!key.startsWith("$")) {
			if (updater[key] === undefined) {
				mongoUpdate.$unset ??= {};
				mongoUpdate.$unset[key] = "";
			} else {
				directSet[key] = updater[key];
			}
			continue;
		}
		const op = key.toLowerCase();
		const val = updater[key];
		if (!KNOWN_UPDATE_OPS.has(op))
			throw new QueryValidationError(`Unknown operator "${key}"`, {
				op: "update",
				key,
			});
		if (val === null || typeof val !== "object" || Array.isArray(val))
			throw new QueryValidationError(
				`Operator "${key}" requires an object value`,
				{
					op: "update",
					key: op,
				},
			);
		switch (op) {
			case "$inc":
				mongoUpdate.$inc ??= {};
				assignSafe(mongoUpdate.$inc, val);
				break;
			case "$dec":
				mongoUpdate.$inc ??= {};
				for (const f in val) {
					if (!Object.hasOwn(val, f) || isUnsafeKey(f)) continue;
					mongoUpdate.$inc[f] = -val[f];
				}
				break;
			case "$push":
				mongoUpdate.$push ??= {};
				assignSafe(mongoUpdate.$push, val);
				break;
			case "$pushset":
				mongoUpdate.$addToSet ??= {};
				assignSafe(mongoUpdate.$addToSet, val);
				break;
			case "$pull":
				mongoUpdate.$pull ??= {};
				assignSafe(mongoUpdate.$pull, val);
				break;
			case "$pushall":
				mongoUpdate.$push ??= {};
				for (const f in val) {
					if (!Object.hasOwn(val, f) || isUnsafeKey(f)) continue;
					if (!Array.isArray(val[f]))
						throw new QueryValidationError(
							"Cannot push all values: the updater is not an array",
							{
								op: "update",
								key: f,
							},
						);
					mongoUpdate.$push[f] = {
						$each: val[f],
					};
				}
				break;
			case "$pullall":
				mongoUpdate.$pull ??= {};
				for (const f in val) {
					if (!Object.hasOwn(val, f) || isUnsafeKey(f)) continue;
					if (!Array.isArray(val[f]))
						throw new QueryValidationError(
							"Cannot pull all values: the updater is not an array",
							{
								op: "update",
								key: f,
							},
						);
					mongoUpdate.$pull[f] = {
						$in: val[f],
					};
				}
				break;
			case "$unset":
				mongoUpdate.$unset ??= {};
				for (const f in val) {
					if (!Object.hasOwn(val, f) || isUnsafeKey(f)) continue;
					mongoUpdate.$unset[f] = "";
				}
				break;
			case "$rename":
				mongoUpdate.$rename ??= {};
				for (const f in val) {
					if (!Object.hasOwn(val, f) || isUnsafeKey(f)) continue;
					if (typeof val[f] !== "string")
						throw new QueryValidationError(
							"Cannot rename to a non-string key",
							{
								op: "update",
								key: f,
							},
						);
					if (isUnsafeKey(val[f])) continue;
					mongoUpdate.$rename[f] = val[f];
				}
				break;
			case "$set":
				mongoUpdate.$set ??= {};
				assignSafe(mongoUpdate.$set, val);
				break;
			case "$merge":
				mongoUpdate.$set ??= {};
				for (const f in val) {
					if (!Object.hasOwn(val, f) || isUnsafeKey(f)) continue;
					if (
						typeof val[f] === "object" &&
						val[f] !== null &&
						!Array.isArray(val[f])
					) {
						for (const sf in val[f]) {
							if (!Object.hasOwn(val[f], sf) || isUnsafeKey(sf)) continue;
							mongoUpdate.$set[`${f}.${sf}`] = val[f][sf];
						}
					} else {
						mongoUpdate.$set[f] = val[f];
					}
				}
				break;
			case "$deepmerge":
				mongoUpdate.$set ??= {};
				flattenDeep(val, "", mongoUpdate.$set);
				break;
		}
	}

	if (Object.keys(directSet).length) {
		mongoUpdate.$set ??= {};
		assignSafe(mongoUpdate.$set, directSet);
	}

	return mongoUpdate;
}

export function needsNumericCheck(updater: any) {
	if (!updater || typeof updater !== "object") return false;
	return Object.keys(updater).some(key => {
		const op = key.toLowerCase();
		return op === "$inc" || op === "$dec";
	});
}

export function assertNumericOps(docs: any[], updater: any) {
	if (!updater || typeof updater !== "object") return;
	for (const key in updater) {
		if (!Object.hasOwn(updater, key)) continue;
		const op = key.toLowerCase();
		if (op !== "$inc" && op !== "$dec") continue;
		const fields = updater[key];
		if (fields === null || typeof fields !== "object") continue;
		const verb = op === "$inc" ? "increment" : "decrement";
		for (const field in fields) {
			if (!Object.hasOwn(fields, field) || isUnsafeKey(field)) continue;
			const amount = fields[field];
			// nested form is validated leaf-wise by core
			if (amount !== null && typeof amount === "object") continue;
			for (const doc of docs) {
				if (!Object.hasOwn(doc, field)) continue;
				if (typeof doc[field] !== "number" || typeof amount !== "number")
					throw new QueryValidationError(
						`Cannot ${verb} non-numeric value at key: ${field}`,
						{
							op: "update",
							key: field,
						},
					);
			}
		}
	}
}

function flattenDeep(obj: any, prefix: string, target: Record<string, any>) {
	for (const key in obj) {
		if (!Object.hasOwn(obj, key) || isUnsafeKey(key)) continue;
		const path = prefix ? `${prefix}.${key}` : key;
		const val = obj[key];
		if (typeof val === "object" && val !== null && !Array.isArray(val)) {
			flattenDeep(val, path, target);
		} else {
			target[path] = val;
		}
	}
}

export function isEmptyUpdate(mu: any): boolean {
	if (!mu || Object.keys(mu).length === 0) return true;
	for (const op in mu) {
		if (
			typeof mu[op] === "object" &&
			mu[op] !== null &&
			Object.keys(mu[op]).length > 0
		) {
			return false;
		}
	}
	return true;
}

export async function resolveSearch(
	search: any,
	coll: Collection,
	opts: any = {},
) {
	const mongoQuery = translateQuery(search);

	if (needsJsFallback(search)) {
		const all = await coll.find({}, opts).toArray();
		const allData = cleanDocs(all).filter((d: any) =>
			hasFieldsAdvanced(d, search),
		);
		return {
			filter: null,
			allData,
		};
	}

	return {
		filter: mongoQuery,
		allData: null,
	};
}
