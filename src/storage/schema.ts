import { serialize } from "v8";
import type { MariaDBValthera } from "../actions";
import { decodeValue, isEncodedNull } from "./codec";
import { columnForField, quoteIdentifier } from "./identifiers";
import { ColumnInfo, SerializedField } from "./types";

const BLOB_TYPES = new Set([
	"blob",
	"tinyblob",
	"mediumblob",
	"longblob",
	"binary",
	"varbinary",
]);

const TEXT_TYPES = new Set([
	"char",
	"varchar",
	"tinytext",
	"text",
	"mediumtext",
	"longtext",
]);

const NUMBER_TYPES = new Set([
	"double",
	"float",
	"decimal",
	"numeric",
	"real",
]);

const INT_TYPES = new Set([
	"tinyint",
	"smallint",
	"mediumint",
	"int",
	"integer",
	"bigint",
]);

export function isBlobColumn(column?: ColumnInfo) {
	if (!column) return false;
	return BLOB_TYPES.has(column.dataType.toLowerCase());
}

export function isBooleanColumn(column?: ColumnInfo) {
	if (!column) return false;
	return (
		column.dataType.toLowerCase() === "tinyint" &&
		column.columnType.toLowerCase().startsWith("tinyint(1)")
	);
}

export function columnInfoForSqlType(
	name: string,
	sqlType: string,
): ColumnInfo {
	const normalized = sqlType.toLowerCase();
	if (normalized === "tinyint(1)")
		return {
			name,
			dataType: "tinyint",
			columnType: "tinyint(1)",
		};
	return {
		name,
		dataType: normalized.split("(")[0],
		columnType: normalized,
	};
}

export function compatibleType(
	existing: ColumnInfo | undefined,
	sqlType: string,
) {
	if (!existing) return true;

	const dataType = existing.dataType.toLowerCase();

	switch (sqlType) {
		case "LONGBLOB":
			return BLOB_TYPES.has(dataType);
		case "LONGTEXT":
			return TEXT_TYPES.has(dataType);
		case "DOUBLE":
			return (
				NUMBER_TYPES.has(dataType) ||
				(INT_TYPES.has(dataType) && !isBooleanColumn(existing))
			);
		case "TINYINT(1)":
			return isBooleanColumn(existing);
		case "DATETIME(6)":
			return dataType === "datetime" || dataType === "timestamp";
		case "JSON":
			return dataType === "json" || dataType === "longtext";
		default:
			return false;
	}
}

export async function getColumns(
	mv: MariaDBValthera,
	collection: string,
): Promise<Map<string, ColumnInfo>> {
	const cached = mv._columnsCache.get(collection);
	const now = Date.now();
	if (cached && now - cached.timestamp < mv._columnsCacheTTL)
		return cached.columns;

	const database = await mv.databaseName();
	const rows = await mv.query<{
		COLUMN_NAME: string;
		DATA_TYPE: string;
		COLUMN_TYPE: string;
	}>(
		`SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE
         FROM information_schema.columns
         WHERE table_schema = ? AND table_name = ?`,
		[
			database,
			mv.metadataTable(collection),
		],
	);

	const columns = new Map<string, ColumnInfo>();
	for (const row of rows) {
		const name = row.COLUMN_NAME ?? (row as any).column_name;
		const dataType = row.DATA_TYPE ?? (row as any).data_type;
		const columnType = row.COLUMN_TYPE ?? (row as any).column_type;
		columns.set(name, {
			name,
			dataType,
			columnType,
		});
	}

	mv._columnsCache.set(collection, {
		columns,
		timestamp: now,
	});
	return columns;
}

export function invalidateColumnsCache(
	mv: MariaDBValthera,
	collection: string,
) {
	mv._columnsCache.delete(collection);
}

async function alignColumn(
	mv: MariaDBValthera,
	collection: string,
	column: string,
	existing: ColumnInfo,
	targetSqlType: string,
): Promise<ColumnInfo> {
	const table = mv.table(collection);
	const nonNull = await mv.query<{
		count: number | string;
	}>(
		`SELECT COUNT(*) AS count FROM ${table} WHERE ${quoteIdentifier(column)} IS NOT NULL`,
	);

	if (Number(nonNull[0]?.count ?? 0) === 0) {
		await mv.query(
			`ALTER TABLE ${table} MODIFY COLUMN ${quoteIdentifier(column)} ${targetSqlType}`,
		);
		return columnInfoForSqlType(column, targetSqlType);
	}

	const primaryKey = mv.primaryKey(collection);
	const existingRows = await mv.query<Record<string, any>>(
		`SELECT ${quoteIdentifier(primaryKey)} AS __pk, ${quoteIdentifier(column)} AS __val
         FROM ${table}
         WHERE ${quoteIdentifier(column)} IS NOT NULL`,
	);

	await mv.query(`UPDATE ${table} SET ${quoteIdentifier(column)} = NULL`);
	await mv.query(
		`ALTER TABLE ${table} MODIFY COLUMN ${quoteIdentifier(column)} LONGBLOB`,
	);

	for (const row of existingRows) {
		const decoded = decodeValue(row.__val, existing, mv.compositeEncoding);
		await mv.query(
			`UPDATE ${table} SET ${quoteIdentifier(column)} = ? WHERE ${quoteIdentifier(primaryKey)} = ?`,
			[
				serialize(decoded),
				row.__pk,
			],
		);
	}

	return columnInfoForSqlType(column, "LONGBLOB");
}

export async function ensureColumns(
	mv: MariaDBValthera,
	collection: string,
	fields: SerializedField[],
	columns?: Map<string, ColumnInfo>,
) {
	const cols = columns ?? (await getColumns(mv, collection));
	let changed = false;

	for (const field of fields) {
		const column = columnForField(field.key);
		const existing = cols.get(column);

		if (existing && isEncodedNull(field.value)) {
			field.value = null;
			continue;
		}

		if (!existing && mv.mode === "strict")
			throw new Error(
				`MariaDB column ${quoteIdentifier(column)} for field "${field.key}" does not exist in table ${mv.table(collection)}`,
			);

		if (existing && !compatibleType(existing, field.sqlType)) {
			if (isBlobColumn(existing)) {
				field.value = serialize(field.value);
				field.sqlType = "LONGBLOB";
				continue;
			}

			const info = await alignColumn(
				mv,
				collection,
				column,
				existing,
				field.sqlType,
			);
			cols.set(column, info);
			changed = true;

			if (isBlobColumn(info) && field.sqlType !== "LONGBLOB") {
				field.value = serialize(field.value);
				field.sqlType = "LONGBLOB";
			}
			continue;
		}

		if (!existing) {
			await mv.query(
				`ALTER TABLE ${mv.table(collection)} ADD COLUMN ${quoteIdentifier(column)} ${field.sqlType}`,
			);
			cols.set(column, columnInfoForSqlType(column, field.sqlType));
			changed = true;
		}
	}

	if (changed) invalidateColumnsCache(mv, collection);
}
