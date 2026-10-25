export interface ColumnInfo {
	name: string;
	dataType: string;
	columnType: string;
}

export interface SerializedField {
	key: string;
	value: any;
	sqlType: string;
}

export type LogicalType =
	| "null"
	| "text"
	| "number"
	| "boolean"
	| "date"
	| "blob"
	| "json";
