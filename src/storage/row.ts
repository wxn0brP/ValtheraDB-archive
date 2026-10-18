import { Data } from "@wxn0brp/db-core/types/data";
import { decodeValue } from "./codec";
import { ColumnInfo } from "./types";

export function rowToData(
	row: Record<string, any>,
	columns: Map<string, ColumnInfo>,
) {
	const data: Data = {};

	for (const column of columns.keys()) {
		if (row[column] !== null && row[column] !== undefined)
			(data as any)[column] = decodeValue(row[column], columns.get(column));
	}

	return data;
}
