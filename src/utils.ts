export function escapeValue(val: any): string {
	if (val === null || val === undefined) return "NULL";
	if (typeof val === "number") return val.toString();
	if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
	if (typeof val === "string") return `'${val.replace(/'/g, "''")}'`;
	if (typeof val === "object")
		return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
	return `'${String(val).replace(/'/g, "''")}'`;
}
