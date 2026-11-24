import { genId, ValtheraClass } from "@wxn0brp/db-core";
import { AdapterBase } from "@wxn0brp/db-core/base/adapter";
import { AdapterInitError } from "@wxn0brp/db-core/errors";
import { addId } from "@wxn0brp/db-core/helpers/addId";
import { Data } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { execFile } from "node:child_process";
import fs from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import odbc from "odbc";
import { find } from "./find";
import { remove } from "./remove";
import { SupportedDB } from "./types";
import { update } from "./update";
import {
	isSafeIdent,
	normalizeCreateTable,
	SPILL,
	sqlIdent,
	sqlString,
	VID,
} from "./utils";

const execFileAsync = promisify(execFile);

const ACCESS_DRIVER = "{Microsoft Access Driver (*.mdb, *.accdb)}";

interface ConnectionState {
	file: string;
	schemaVersion: number;
}

let keeperConnection: odbc.Connection | null = null;

async function keepDriverAlive() {
	if (keeperConnection) return;

	const file = path.join(
		os.tmpdir(),
		`valthera-accdb-keeper-${process.pid}.accdb`,
	);

	if (!fs.existsSync(file)) await createDatabase(file);

	keeperConnection = await odbc.connect(`Driver=${ACCESS_DRIVER};DBQ=${file}`);
}

export async function createDatabase(file: string): Promise<string> {
	const target = path.resolve(file);

	if (!fs.existsSync(target))
		await mkdir(path.dirname(target), {
			recursive: true,
		});

	const script =
		`New-Object -ComObject ADOX.Catalog | ForEach-Object { ` +
		`$_.Create('Provider=Microsoft.ACE.OLEDB.12.0;Data Source=${target}') }`;

	try {
		await execFileAsync("powershell", [
			"-NoProfile",
			"-NonInteractive",
			"-Command",
			script,
		]);
	} catch (err: any) {
		throw new AdapterInitError(
			`Failed to create Access database "${target}". ` +
				`Microsoft Access Database Engine (ACE) is required.\n${err?.message ?? err}`,
		);
	}

	const size = (await stat(target)).size;
	if (!size)
		throw new AdapterInitError(`Failed to create Access database "${target}"`);

	return target;
}

async function createTable(conn: odbc.Connection, sql: string) {
	const normalized = normalizeCreateTable(sql);

	if (!normalized || normalized === sql) return await conn.query(sql);

	try {
		return await conn.query(normalized);
	} catch (err) {
		// keep the original error when the hand written statement is the problem
		try {
			return await conn.query(sql);
		} catch {
			throw err;
		}
	}
}

function wrapConnection(conn: odbc.Connection, file: string): SupportedDB {
	const state: ConnectionState = {
		file,
		schemaVersion: 0,
	};

	const proxy = new Proxy(conn, {
		get(target, prop) {
			const value = Reflect.get(target, prop, target);
			if (typeof value !== "function") return value;

			return (...args: any[]) => {
				if (prop === "query" && typeof args[0] === "string") {
					const sql = args[0];

					if (/^\s*create\s+table\s/i.test(sql))
						return createTable(target as any, sql);

					if (/^\s*(alter|drop)\s/i.test(sql)) state.schemaVersion++;
				}
				return value.apply(target, args);
			};
		},
	}) as SupportedDB;

	(proxy as any).__state = state;
	(proxy as any).__file = file;

	return proxy;
}

export async function makeConnect(file: string): Promise<SupportedDB> {
	const resolved = path.resolve(file);
	const missing = !fs.existsSync(resolved);
	const empty = !missing && (await stat(resolved)).size === 0;

	if (missing || empty) await createDatabase(resolved);
	await keepDriverAlive();

	const conn = await odbc.connect(`Driver=${ACCESS_DRIVER};DBQ=${resolved}`);
	return wrapConnection(conn, resolved);
}

export class AccDBValthera extends AdapterBase {
	_inited = false;
	primaryKey: Record<string, string>;
	file: string | null = null;

	private _columns = new Map<
		string,
		{
			version: number;
			map: Map<string, string>;
		}
	>();

	private _ensured = new Set<string>();

	constructor(
		public db: SupportedDB,
		primaryKey: Record<string, string> = {},
	) {
		super();
		this.primaryKey = primaryKey;
		this.file = (db as any)?.__file ?? null;
	}

	async init() {
		if (!this.db) {
			if (!this.file)
				throw new AdapterInitError(
					"AccDBValthera: connection is closed and no database file is known",
				);
			this.db = await makeConnect(this.file);
		}
		this._inited = true;
	}

	async close() {
		const db = this.db;
		this.db = null as unknown as SupportedDB;
		if (db) await db.close().catch(() => {});
		this._inited = false;
		this._columns.clear();
		this._ensured.clear();
	}

	async getCollections(): Promise<string[]> {
		const tables = await this.listTables();

		const collections: string[] = [];
		for (const name of this._ensured) {
			const table = tables.find(t => t.toLowerCase() === name);
			if (table) collections.push(table);
		}
		return collections;
	}

	async listTables(): Promise<string[]> {
		await this.init();

		const result = (await this.db.tables(null, null, null, "TABLE")) as any[];
		if (!Array.isArray(result)) return [];

		const names: string[] = [];
		for (const row of result) {
			const name = row.TABLE_NAME ?? row.table_name ?? row.tableName;
			if (!name || String(name).startsWith("MSys")) continue;
			names.push(String(name));
		}
		return names;
	}

	async issetCollection(collection: string): Promise<boolean> {
		const tables = await this.listTables();
		return tables.some(name => name.toLowerCase() === collection.toLowerCase());
	}

	async ensureCollection(collection: string): Promise<boolean> {
		await this.init();

		if (await this.issetCollection(collection)) {
			this._ensured.add(collection.toLowerCase());
			return false;
		}

		await this.db.query(
			`CREATE TABLE ${sqlIdent(collection)} (${sqlIdent(VID)} MEMO)`,
		);
		this._columns.delete(collection);
		this._ensured.add(collection.toLowerCase());
		return true;
	}

	async removeCollection(collection: string): Promise<boolean> {
		await this.init();

		if (!(await this.issetCollection(collection))) return false;

		await this.db.query(`DROP TABLE ${sqlIdent(collection)}`);
		this._ensured.delete(collection.toLowerCase());
		this._columns.delete(collection);
		return true;
	}

	async add(config: VQueryT.Add): Promise<Data> {
		const { data, collection } = config;

		await addId(config, this);

		const doc: Record<string, any> = data ?? {};

		const created = await this.ensureTable(collection);
		if (created) this._ensured.add(collection.toLowerCase());

		const columns: string[] = [
			VID,
		];
		const values: string[] = [
			sqlString(genId()),
		];
		const spill: Record<string, any> = {};

		for (const [field, value] of Object.entries(doc)) {
			if (value === undefined) continue;

			const column = await this._ensureColumn(collection, field);
			if (column) {
				columns.push(column);
				values.push(sqlString(value));
			} else spill[field] = value;
		}

		if (Object.keys(spill).length) {
			const column = await this._ensureColumn(collection, SPILL);
			if (column) {
				columns.push(column);
				values.push(sqlString(spill));
			}
		}

		await this.db.query(
			`INSERT INTO ${sqlIdent(collection)} ` +
				`(${columns.map(sqlIdent).join(", ")}) VALUES (${values.join(", ")})`,
		);

		return doc as Data;
	}

	find(config: VQueryT.Find) {
		return find(this, config);
	}

	async findOne(config: VQueryT.Find) {
		config.dbFindOpts = {
			limit: 1,
		};
		const result = await this.find(config);
		return result.length ? result[0] : null;
	}

	update(config: VQueryT.Update) {
		return update(this, config, false);
	}

	async updateOne(config: VQueryT.Update) {
		const res = await update(this, config, true);
		return res[0] || null;
	}

	remove(config: VQueryT.Remove) {
		return remove(this, config, false);
	}

	async removeOne(config: VQueryT.Remove) {
		const res = await remove(this, config, true);
		return res[0] || null;
	}

	async _ensureColumn(
		collection: string,
		field: string,
	): Promise<string | null> {
		await this.ensureTable(collection);

		const columns = await this.loadColumns(collection);
		const existing = columns.map.get(field.toLowerCase());
		if (existing) return existing;

		if (!isSafeIdent(field)) return null;

		await this.db.query(
			`ALTER TABLE ${sqlIdent(collection)} ADD ${sqlIdent(field)} MEMO`,
		);
		return field;
	}

	private async ensureTable(collection: string) {
		await this.init();

		if (!(await this.issetCollection(collection))) {
			await this.db.query(
				`CREATE TABLE ${sqlIdent(collection)} (${sqlIdent(VID)} MEMO)`,
			);
			this._columns.delete(collection);
			return true;
		}

		const columns = await this.loadColumns(collection);
		if (!columns.map.has(VID.toLowerCase()))
			await this.db.query(
				`ALTER TABLE ${sqlIdent(collection)} ADD ${sqlIdent(VID)} MEMO`,
			);

		return false;
	}

	private async loadColumns(collection: string) {
		const version = (this.db as any)?.__state?.schemaVersion ?? 0;
		const cached = this._columns.get(collection);
		if (cached && cached.version === version) return cached;

		const result = (await this.db.columns(
			null,
			null,
			collection,
			null,
		)) as any[];

		const map = new Map<string, string>();
		for (const row of Array.isArray(result) ? result : []) {
			const name = row.COLUMN_NAME ?? row.column_name;
			if (!name) continue;
			map.set(String(name).toLowerCase(), String(name));
		}

		const entry = {
			version,
			map,
		};
		this._columns.set(collection, entry);
		return entry;
	}
}

export function createAccDBValthera(
	db: SupportedDB,
	primaryKey: Record<string, string> = {},
) {
	const adapter = new AccDBValthera(db, primaryKey);
	return new ValtheraClass({
		adapter,
	});
}

export const DYNAMIC = {
	async def(file: string, keys: Record<string, string> = {}) {
		return createAccDBValthera(await makeConnect(file), keys);
	},
};
