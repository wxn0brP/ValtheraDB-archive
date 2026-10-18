export interface ColumnInfo {
	name: string;
	dataType: string;
	udtName: string;
}

export interface SerializedField {
	key: string;
	value: any;
	sqlType: string;
}
