import { Data } from "@wxn0brp/db-core/types/data";
import type { CompositeEncoding } from "../types";
import { decodeValue } from "./codec";
import { ColumnInfo } from "./types";

export function rowToData(
	row: Record<string, any>,
	columns: Map<string, ColumnInfo>,
	compositeEncoding: CompositeEncoding = "blob",
) {
	const data: Data = {};

	for (const column of columns.keys()) {
		const value = row[column];
		if (value !== null && value !== undefined)
			(data as any)[column] = decodeValue(
				value,
				columns.get(column),
				compositeEncoding,
			);
	}

	return data;
}
