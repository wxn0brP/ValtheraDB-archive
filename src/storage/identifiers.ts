export function quoteIdentifier(identifier: string) {
	if (!identifier) throw new Error("MariaDB identifier cannot be empty");
	return `\`${identifier.replace(/`/g, "``")}\``;
}

export function columnForField(field: string) {
	return field;
}

export function sqlColumnForField(field: string) {
	return quoteIdentifier(columnForField(field));
}

export function tableName(collection: string, database?: string) {
	const table = quoteIdentifier(collection);
	return database ? `${quoteIdentifier(database)}.${table}` : table;
}
