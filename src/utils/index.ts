import { QueryValidationError } from "@wxn0brp/db-core/errors";
import { isUnsafeKey } from "@wxn0brp/db-core/utils/security";

const JS_FALLBACK_OPS = new Set([
	"$idgt",
	"$idlt",
	"$idgte",
	"$idlte",
	"$subset",
]);
const UNSUPPORTED_TYPE_VALUES = new Set([
	"undefined",
	"symbol",
	"function",
]);

const TYPE_MAP: Record<string, string> = {
	string: "string",
	number: "number",
	boolean: "bool",
	object: "object",
	bigint: "long",
};

export function translateQuery(query: any, fieldLevel = false): any {
	if (!query || typeof query !== "object") return query;

	if (!fieldLevel && Object.hasOwn(query, "$and")) {
		if (!Array.isArray(query.$and))
			throw new QueryValidationError("$and must be an array", {
				op: "search",
				key: "$and",
			});
		if (query.$and.length === 0) return {};
		return {
			$and: query.$and.map((q: any) => translateQuery(q)),
		};
	}
	if (!fieldLevel && Object.hasOwn(query, "$or")) {
		if (!Array.isArray(query.$or))
			throw new QueryValidationError("$or must be an array", {
				op: "search",
				key: "$or",
			});
		if (query.$or.length === 0)
			return {
				_id: null,
			};
		return {
			$or: query.$or.map((q: any) => translateQuery(q)),
		};
	}

	const $fields: Record<string, any> = {};
	const exactFields: Record<string, any> = {};

	for (const key in query) {
		if (!Object.hasOwn(query, key) || isUnsafeKey(key)) continue;
		if (key.startsWith("$")) {
			if (fieldLevel) continue;
			$fields[key.toLowerCase()] = query[key];
		} else {
			exactFields[key] = query[key];
		}
	}

	const mongoQuery: Record<string, any> = {};

	for (const key in exactFields) {
		const val = exactFields[key];
		if (val === null) {
			mongoQuery[key] = {
				$type: "null",
			};
		} else if (typeof val === "object" && !Array.isArray(val)) {
			const nested = translateQuery(val, true);
			if (
				nested &&
				typeof nested === "object" &&
				!Array.isArray(nested) &&
				!nested.$and &&
				!nested.$or &&
				!nested.$not &&
				Object.keys(nested).length > 0
			) {
				for (const nk in nested) {
					mongoQuery[`${key}.${nk}`] = nested[nk];
				}
			} else {
				mongoQuery[key] = val;
			}
		} else {
			mongoQuery[key] = val;
		}
	}

	const fieldOps: Record<string, Record<string, any>> = {};
	for (const op in $fields) {
		if (JS_FALLBACK_OPS.has(op) || op === "$not") continue;
		const val = $fields[op];
		if (val === null || typeof val !== "object" || Array.isArray(val))
			throw new QueryValidationError(
				`Operator "${op}" requires an object value`,
				{
					op: "search",
					key: op,
				},
			);
		for (const field in val) {
			if (!Object.hasOwn(val, field) || isUnsafeKey(field)) continue;
			fieldOps[field] ??= {};
			translateOperator(op, val[field], fieldOps[field]);
		}
	}

	if (Object.hasOwn($fields, "$not")) {
		const notSub = $fields.$not;
		if (typeof notSub !== "object" || notSub === null)
			throw new QueryValidationError("Fields must be an object", {
				op: "search",
				key: "$not",
			});
		const translated = translateQuery(notSub);
		for (const f in translated) {
			if (f === "$and" || f === "$or") {
				mongoQuery.$and ??= [];
				mongoQuery.$and.push({
					$nor: [
						translated,
					],
				});
			} else if (
				typeof translated[f] === "object" &&
				!Array.isArray(translated[f]) &&
				translated[f] !== null
			) {
				fieldOps[f] ??= {};
				fieldOps[f].$not = translated[f];
			} else {
				fieldOps[f] ??= {};
				fieldOps[f].$ne = translated[f];
			}
		}
	}
	for (const field in fieldOps) {
		if (mongoQuery[field] !== undefined) {
			mongoQuery.$and ??= [];
			mongoQuery.$and.push(
				{
					[field]: mongoQuery[field],
				},
				{
					[field]: fieldOps[field],
				},
			);
			delete mongoQuery[field];
		} else {
			mongoQuery[field] = fieldOps[field];
		}
	}

	return mongoQuery;
}

function translateOperator(
	op: string,
	value: any,
	target: Record<string, any>,
) {
	switch (op) {
		case "$gt":
		case "$lt":
		case "$gte":
		case "$lte":
		case "$ne":
		case "$size":
			target[op] = value;
			break;
		case "$in":
		case "$nin":
			if (!Array.isArray(value))
				throw new QueryValidationError(`Operator "${op}" requires an array`, {
					op: "search",
					key: op,
				});
			target[op] = value;
			break;
		case "$exists":
			target.$exists = value;
			break;
		case "$regex":
			if (value instanceof RegExp) {
				target.$regex = value.source;
				if (value.flags) target.$options = value.flags;
			} else {
				target.$regex = value;
			}
			break;
		case "$startswith":
			target.$regex = `^${escapeRegex(value)}`;
			break;
		case "$istartswith":
			target.$regex = `^${escapeRegex(value)}`;
			target.$options = "i";
			break;
		case "$endswith":
			target.$regex = `${escapeRegex(value)}$`;
			break;
		case "$iendswith":
			target.$regex = `${escapeRegex(value)}$`;
			target.$options = "i";
			break;
		case "$between": {
			if (
				!Array.isArray(value) ||
				value.length !== 2 ||
				typeof value[0] !== "number" ||
				typeof value[1] !== "number"
			)
				throw new QueryValidationError("$between requires [min, max]", {
					op: "search",
					key: "between",
				});
			target.$gte = value[0];
			target.$lte = value[1];
			break;
		}
		case "$type":
			target.$type = TYPE_MAP[value] ?? value;
			break;
		case "$arrinc":
			if (!Array.isArray(value))
				throw new QueryValidationError(`Operator "${op}" requires an array`, {
					op: "search",
					key: "arrinc",
				});
			target.$in = value;
			break;
		case "$arrincall":
			if (!Array.isArray(value))
				throw new QueryValidationError(`Operator "${op}" requires an array`, {
					op: "search",
					key: "arrincall",
				});
			target.$all = value;
			break;
	}
}

export function needsJsFallback(query: any): boolean {
	if (!query || typeof query !== "object") return false;
	if (Array.isArray(query.$and))
		return query.$and.some((q: any) => needsJsFallback(q));
	if (Array.isArray(query.$or))
		return query.$or.some((q: any) => needsJsFallback(q));
	if (query.$not) return needsJsFallback(query.$not);
	for (const key in query) {
		if (key.startsWith("$") && JS_FALLBACK_OPS.has(key.toLowerCase()))
			return true;
		if (key.toLowerCase() === "$type") {
			const val = query[key];
			if (typeof val === "object" && val !== null) {
				for (const field in val) {
					if (UNSUPPORTED_TYPE_VALUES.has(val[field])) return true;
				}
			}
		}
		if (typeof query[key] === "object" && query[key] !== null) {
			if (needsJsFallback(query[key])) return true;
		}
	}
	return false;
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function cleanDocs<T>(doc: T): T {
	if (!doc) return doc;
	if (Array.isArray(doc)) {
		return doc.map(cleanDocs) as T;
	}
	const d = doc as any;
	if (d._vdb_no_id) {
		delete d._id;
		delete d._vdb_no_id;
	}
	return d;
}
