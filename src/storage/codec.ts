import { Data } from "@wxn0brp/db-core/types/data";
import { deserialize, serialize } from "v8";
import type { CompositeEncoding } from "../types";
import { ColumnInfo, SerializedField } from "./types";

const NULL_SENTINEL = "VDB_NULL:null";

export function encodeValue(
	value: any,
	compositeEncoding: CompositeEncoding = "blob",
): {
	value: any;
	sqlType: string;
} {
	if (value === null)
		return {
			value: Buffer.from(NULL_SENTINEL),
			sqlType: "LONGBLOB",
		};

	if (value === undefined)
		return {
			value: null,
			sqlType: "LONGTEXT",
		};

	if (typeof value === "number")
		return {
			value,
			sqlType: "DOUBLE",
		};

	if (typeof value === "boolean")
		return {
			value: value ? 1 : 0,
			sqlType: "TINYINT(1)",
		};

	if (value instanceof Date)
		return {
			value,
			sqlType: "DATETIME(6)",
		};

	if (typeof value === "string")
		return {
			value,
			sqlType: "LONGTEXT",
		};

	if (compositeEncoding === "json" && isJsonSafe(value))
		return {
			value: JSON.stringify(value),
			sqlType: "JSON",
		};

	return {
		value: serialize(value),
		sqlType: "LONGBLOB",
	};
}

export function isJsonSafe(value: any): boolean {
	if (value === null || typeof value !== "object") return false;
	if (
		value instanceof Date ||
		value instanceof RegExp ||
		value instanceof Map ||
		value instanceof Set ||
		value instanceof ArrayBuffer ||
		Buffer.isBuffer(value)
	)
		return false;
	try {
		JSON.stringify(value);
		return true;
	} catch {
		return false;
	}
}

export function decodeValue(
	value: any,
	column?: ColumnInfo,
	compositeEncoding: CompositeEncoding = "blob",
): any {
	if (value === null || value === undefined) return value;

	if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
		const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
		if (buffer.toString("utf8") === NULL_SENTINEL) return null;
		try {
			return deserialize(buffer);
		} catch {
			return buffer;
		}
	}

	const dataType = (column?.dataType || "").toLowerCase();
	const columnType = (column?.columnType || "").toLowerCase();

	if (dataType === "tinyint" && columnType.startsWith("tinyint(1)"))
		return Boolean(value);

	if (
		dataType === "double" ||
		dataType === "float" ||
		dataType === "decimal" ||
		dataType === "numeric" ||
		dataType === "int" ||
		dataType === "integer" ||
		dataType === "bigint" ||
		dataType === "smallint" ||
		dataType === "mediumint"
	)
		return typeof value === "number" ? value : Number(value);

	if (dataType === "datetime" || dataType === "timestamp")
		return value instanceof Date ? value : new Date(value);

	if (typeof value === "string") {
		if (dataType === "json" || compositeEncoding === "json") {
			const trimmed = value.trim();
			if (
				(trimmed.startsWith("{") && trimmed.endsWith("}")) ||
				(trimmed.startsWith("[") && trimmed.endsWith("]"))
			) {
				try {
					return JSON.parse(value);
				} catch {}
			}
		}
	}

	return value;
}

export function isEncodedNull(value: any): boolean {
	if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) return false;
	try {
		return Buffer.from(value).toString("utf8") === NULL_SENTINEL;
	} catch {
		return false;
	}
}

export function serializeData(
	data: Data,
	primaryKey = "_id",
	compositeEncoding: CompositeEncoding = "blob",
): SerializedField[] {
	return Object.keys(data)
		.filter(key => key !== primaryKey)
		.filter(key => (data as any)[key] !== undefined)
		.map(key => ({
			key,
			...encodeValue((data as any)[key], compositeEncoding),
		}));
}

export { NULL_SENTINEL };
