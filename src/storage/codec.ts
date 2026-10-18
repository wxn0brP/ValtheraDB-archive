import { Data } from "@wxn0brp/db-core/types/data";
import { deserialize, serialize } from "v8";
import { ColumnInfo, SerializedField } from "./types";

const BLOB_PREFIX = "VDB_NULL:";

export function encodeValue(value: any): {
	value: any;
	sqlType: string;
} {
	if (value === null)
		return {
			value: Buffer.from(BLOB_PREFIX + "null"),
			sqlType: "BYTEA",
		};

	if (value === undefined)
		return {
			value: null,
			sqlType: "TEXT",
		};

	if (typeof value === "number")
		return {
			value,
			sqlType: "DOUBLE PRECISION",
		};

	if (typeof value === "boolean")
		return {
			value,
			sqlType: "BOOLEAN",
		};

	if (value instanceof Date)
		return {
			value,
			sqlType: "TIMESTAMPTZ",
		};

	if (typeof value === "string")
		return {
			value,
			sqlType: "TEXT",
		};

	return {
		value: serialize(value),
		sqlType: "BYTEA",
	};
}

export function decodeValue(value: any, column?: ColumnInfo) {
	if (value === null || value === undefined) return value;

	if (column?.udtName === "bytea") {
		const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
		const str = buffer.toString("utf8");
		if (str === BLOB_PREFIX + "null") return null;
		return deserialize(buffer);
	}

	return value;
}

export function isEncodedNull(value: any): boolean {
	if (!Buffer.isBuffer(value)) return false;
	try {
		return value.toString("utf8") === BLOB_PREFIX + "null";
	} catch {
		return false;
	}
}

export function serializeData(
	data: Data,
	primaryKey = "_id",
): SerializedField[] {
	return Object.keys(data)
		.filter(key => key !== primaryKey)
		.filter(key => (data as any)[key] !== undefined)
		.map(key => {
			const encoded = encodeValue((data as any)[key]);
			return {
				key,
				...encoded,
			};
		});
}
