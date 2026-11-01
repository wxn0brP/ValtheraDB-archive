import { Valthera } from "@wxn0brp/db/valthera";

export interface Opts {
	dropIfExist: boolean;
	createIfNotExist: boolean;
	enterAfterValue: boolean;
}

function sqlEscapeString(raw: string): string {
	return (
		`'` +
		raw
			.replace(/\\/g, "\\\\") // backslash
			.replace(/\0/g, "\\0") // null
			.replace(/\n/g, "\\n") // newline
			.replace(/\r/g, "\\r") // carriage return
			.replace(/\t/g, "\\t") // tab
			// biome-ignore lint/suspicious/noControlCharactersInRegex: yes
			.replace(/\x1a/g, "\\Z") // Ctrl+Z
			.replace(/'/g, "''") + // single quote
		`'`
	);
}

function mapJsTypeToSqlType(value: any) {
	const type = typeof value;
	switch (type) {
		case "number": {
			const val = value || 0;
			if (val % 1 === 0) return "INTEGER";
			return "REAL";
		}
		case "string":
			return "TEXT";
		case "boolean":
			return "BOOLEAN";
		case "object":
			return "JSON";
		default:
			return "TEXT";
	}
}

function getCollectionStruct(data: any[]) {
	const keys = new Map<string, string>();
	for (const item of data) {
		for (const key of Object.keys(item)) {
			if (item[key] == null) continue;
			const type = mapJsTypeToSqlType(item[key]);
			const previous = keys.get(key);
			keys.set(
				key,
				previous && previous !== type
					? (previous === "REAL" && type === "INTEGER") ||
						(previous === "INTEGER" && type === "REAL")
						? "REAL"
						: "TEXT"
					: type,
			);
		}
	}
	for (const item of data)
		for (const key of Object.keys(item))
			if (!keys.has(key)) keys.set(key, "TEXT");
	return keys;
}

function sqlIdentifier(value: string) {
	return `"${value.replace(/"/g, '""')}"`;
}

function processDataToOrder(data: any, order: string[]) {
	const arr = [];
	for (const key of order) {
		const val = data[key];
		if (val === null || val === undefined) {
			arr.push("NULL");
			continue;
		}
		switch (typeof val) {
			case "string":
				arr.push(sqlEscapeString(val));
				break;
			case "object":
				arr.push(sqlEscapeString(JSON.stringify(val)));
				break;
			default:
				arr.push(
					typeof val === "number" && !Number.isFinite(val)
						? "NULL"
						: String(val),
				);
		}
	}
	return arr.join(", ");
}

export class SQLFileCreator {
	opts: Opts;

	constructor(
		private db: Valthera,
		opts?: Partial<Opts>,
	) {
		this.opts = {
			dropIfExist: true,
			createIfNotExist: true,
			enterAfterValue: true,
			...(opts || {}),
		};
	}

	async create(collections?: string[]) {
		let sql = "";
		if (!collections || collections.length === 0)
			collections = await this.db.getCollections();

		if (this.opts.dropIfExist) {
			for (const collection of collections) {
				sql += "DROP TABLE IF EXISTS " + sqlIdentifier(collection) + ";\n";
			}
			sql += "\n";
		}

		const createIfNotExist = [];
		const insert = [];

		for (const collection of collections) {
			const { createIfNotExist: c, insert: i } =
				await this.processCollection(collection);
			if (c) createIfNotExist.push(c);
			if (i) insert.push(i);
		}

		if (createIfNotExist.length !== 0) {
			sql += createIfNotExist.join("\n");
			sql += "\n\n";
		}
		sql += insert.join("\n");
		return sql;
	}

	async processCollection(collection: string) {
		const data = await this.db.find({
			collection,
		});
		const keys = getCollectionStruct(data);

		let createIfNotExist = null;
		if (this.opts.createIfNotExist) {
			const construct = Array.from(keys)
				.map(([k, v]) => `${sqlIdentifier(k)} ${v}`)
				.join(", ");
			if (construct.trim().length > 0) {
				createIfNotExist = `CREATE TABLE IF NOT EXISTS ${sqlIdentifier(collection)} (${construct});`;
			}
		}

		const enter = this.opts.enterAfterValue ? "\n" : "";
		const order = Array.from(keys).map(([k]) => k);
		let insert = null;

		if (data.length > 0) {
			insert = `INSERT INTO ${sqlIdentifier(collection)} (${order.map(sqlIdentifier).join(", ")}) VALUES `;
			insert += enter;
			insert += data
				.map(d => "(" + processDataToOrder(d, order) + ")")
				.join(", " + enter);
			insert += `;` + enter;
		}

		return {
			createIfNotExist,
			insert,
		};
	}
}
