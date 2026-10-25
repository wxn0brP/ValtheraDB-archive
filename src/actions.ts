import { Id } from "@wxn0brp/db-core";
import { ActionsBase } from "@wxn0brp/db-core/base/actions";
import { addId } from "@wxn0brp/db-core/helpers/addId";
import { genId } from "@wxn0brp/db-core/helpers/gen";
import { DataInternal } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { TransactionHandle } from "@wxn0brp/db-core/types/transaction";
import { find } from "./find";
import { remove } from "./remove";
import { serializeData } from "./storage/codec";
import {
	columnForField,
	quoteIdentifier,
	tableName,
} from "./storage/identifiers";
import { ensureColumns } from "./storage/schema";
import { ColumnInfo } from "./storage/types";
import { buildWhere } from "./storage/where";
import {
	CompositeEncoding,
	MariaDBConnection,
	MariaDBDriver,
	MariaDBMode,
	MariaDBValtheraOptions,
} from "./types";
import { update } from "./update";
import { createPool } from "./pool";

const DDL_RE = /^\s*(CREATE|ALTER|DROP|TRUNCATE|RENAME)\b/i;

function extractRows<T>(result: any): T[] {
	if (!result) return [];
	if (Array.isArray(result)) {
		if (result.length > 0 && Array.isArray(result[0])) return result[0] as T[];
		return result as T[];
	}
	if (Array.isArray(result.rows)) return result.rows as T[];
	return [];
}

async function runQuery<T>(
	connection: MariaDBConnection,
	sql: string,
	values: any[] = [],
): Promise<T[]> {
	const target = connection as any;

	if (typeof target.query === "function")
		return extractRows<T>(await target.query(sql, values));

	if (typeof target.unsafe === "function")
		return extractRows<T>(await target.unsafe(sql, values));

	throw new Error(
		"Unsupported MariaDB connection: expected query() or unsafe() method",
	);
}

export class MariaDBValthera extends ActionsBase {
	_inited = true;
	capabilities = {
		transactions: true,
		indexes: true,
		persistent: true,
	};
	mode: MariaDBMode;
	compositeEncoding: CompositeEncoding;
	primaryKeyOption: string | Record<string, string>;
	database?: string;
	connectionString?: string;
	driver: MariaDBDriver;
	_closed = false;

	_columnsCache = new Map<
		string,
		{
			columns: Map<string, ColumnInfo>;
			timestamp: number;
		}
	>();
	_columnsCacheTTL = 5000;
	_knownCollections = new Set<string>();
	_database?: string;
	_txActive = false;
	_txConn: MariaDBConnection | null = null;
	_txWaiters: Array<() => void> = [];

	constructor(
		public db: MariaDBConnection,
		opts: MariaDBValtheraOptions = {},
	) {
		super();
		this.database = opts.database;
		this.mode = opts.mode ?? "strict";
		this.compositeEncoding = opts.compositeEncoding ?? "blob";
		this.primaryKeyOption = opts.primaryKey ?? "_id";
		this.connectionString = opts.connectionString;
		this.driver = opts.driver ?? "mariadb";
	}

	async init() {
		if (!this._closed || !this.connectionString) return;
		this.db = await createPool(this.connectionString, this.driver);
		this._closed = false;
		await this.databaseName();
	}

	async close() {
		this._columnsCache.clear();
		this._knownCollections.clear();
		this._database = undefined;
		const txConn = this._txConn as any;
		if (txConn && typeof txConn.release === "function") txConn.release();
		this._txConn = null;
		this._txActive = false;

		const db = this.db as any;
		if (typeof db.end === "function") await Promise.resolve(db.end());
		else if (typeof db.close === "function") await Promise.resolve(db.close());
		else if (typeof db.destroy === "function")
			await Promise.resolve(db.destroy());
		this._closed = true;
	}

	async query<T = Record<string, any>>(
		sql: string,
		values: any[] = [],
	): Promise<T[]> {
		const target = this._txConn ?? this.db;
		const rows = await runQuery<T>(target, sql, values);

		if (this._txActive && DDL_RE.test(sql)) await runQuery(target, "BEGIN");

		return rows;
	}

	async _waitForTx() {
		if (!this._txActive) return;
		return await new Promise<void>(resolve => {
			this._txWaiters.push(resolve);
		});
	}

	_releaseTx() {
		this._txActive = false;
		const conn = this._txConn as any;
		this._txConn = null;
		if (conn && typeof conn.release === "function") conn.release();
		const waiters = this._txWaiters;
		this._txWaiters = [];
		for (const waiter of waiters) waiter();
	}

	table(collection: string) {
		return tableName(collection, this.database);
	}

	metadataTable(collection: string) {
		return collection;
	}

	primaryKey(collection: string) {
		return typeof this.primaryKeyOption === "string"
			? this.primaryKeyOption
			: (this.primaryKeyOption[collection] ?? "_id");
	}

	async databaseName() {
		if (this.database) return this.database;
		if (this._database) return this._database;
		const rows = await this.query<{
			db: string;
		}>("SELECT DATABASE() AS db");
		this._database = rows[0]?.db ?? "";
		return this._database;
	}

	async getCollections(): Promise<string[]> {
		const database = await this.databaseName();
		const rows = await this.query<{
			name: string;
		}>(
			`SELECT table_name AS name
             FROM information_schema.tables
             WHERE table_schema = ? AND table_type = 'BASE TABLE'
             ORDER BY table_name`,
			[
				database,
			],
		);
		return rows.map(row => (row as any).name ?? (row as any).TABLE_NAME);
	}

	async issetCollection(collection: string): Promise<boolean> {
		if (this._knownCollections.has(collection)) return true;

		const database = await this.databaseName();
		const rows = await this.query(
			`SELECT 1 FROM information_schema.tables
             WHERE table_schema = ? AND table_name = ? AND table_type = 'BASE TABLE'
             LIMIT 1`,
			[
				database,
				this.metadataTable(collection),
			],
		);
		const exists = rows.length > 0;
		if (exists) this._knownCollections.add(collection);
		return exists;
	}

	async ensureCollection(collection: string): Promise<boolean> {
		const exists = await this.issetCollection(collection);

		if (!exists && this.mode === "strict")
			throw new Error(`MariaDB table ${this.table(collection)} does not exist`);

		if (!exists) {
			const primaryKey = this.primaryKey(collection);
			await this.query(
				`CREATE TABLE ${this.table(collection)} (
                    ${quoteIdentifier(primaryKey)} VARCHAR(191) NOT NULL PRIMARY KEY
                )`,
			);
			this._knownCollections.add(collection);
			return true;
		}

		return false;
	}

	async removeCollection(collection: string): Promise<boolean> {
		await this.query(`DROP TABLE IF EXISTS ${this.table(collection)}`);
		this._knownCollections.delete(collection);
		this._columnsCache.delete(collection);
		return true;
	}

	async add(config: VQueryT.Add): Promise<DataInternal> {
		const { data, collection } = config;
		await this.ensureCollection(collection);

		const primaryKey = this.primaryKey(collection);
		if (primaryKey === "_id") {
			await addId(config, this, true);
		} else if ((data as any)[primaryKey] === undefined) {
			(data as any)[primaryKey] = genId();
		}

		const originalId = (data as any)[primaryKey] ?? genId();
		const storageId =
			typeof originalId !== "string" ? String(originalId) : originalId;

		const fields = serializeData(data, primaryKey, this.compositeEncoding);
		await ensureColumns(this, collection, fields);

		const columns = [
			primaryKey,
			...fields.map(field => columnForField(field.key)),
		];
		const values = [
			storageId,
			...fields.map(field => field.value),
		];
		const placeholders = values.map(() => "?").join(", ");

		await this.query(
			`INSERT INTO ${this.table(collection)}
             (${columns.map(quoteIdentifier).join(", ")})
             VALUES (${placeholders})`,
			values,
		);

		return data;
	}

	find(config: VQueryT.Find) {
		return find(this, config);
	}

	async findOne(config: VQueryT.Find) {
		config.dbFindOpts = {
			...(config.dbFindOpts || {}),
			limit: 1,
		};
		const result = await this.find(config);
		return result.length ? result[0] : null;
	}

	update(config: VQueryT.Update) {
		return update(this, config, false);
	}

	async updateOne(config: VQueryT.Update) {
		const result = await update(this, config, true);
		return result[0] || null;
	}

	remove(config: VQueryT.Remove) {
		return remove(this, config, false);
	}

	async removeOne(config: VQueryT.Remove) {
		const result = await remove(this, config, true);
		return result[0] || null;
	}

	async count(config: VQueryT.Count): Promise<number> {
		const { collection } = config;
		await this.ensureCollection(collection);

		const where = await buildWhere(this, collection, config as VQueryT.Find);
		if (where.partial) return (await this.find(config as VQueryT.Find)).length;

		const rows = await this.query<{
			count: number | string;
		}>(
			`SELECT COUNT(*) AS count FROM ${this.table(collection)} ${where.sql}`,
			where.values,
		);
		return Number(rows[0]?.count ?? 0);
	}

	async beginTransaction(id: Id): Promise<TransactionHandle> {
		await this._waitForTx();
		const pool = this.db as any;
		let conn: MariaDBConnection;
		if (typeof pool.reserve === "function") conn = await pool.reserve();
		else if (typeof pool.getConnection === "function")
			conn = await pool.getConnection();
		else conn = pool;
		this._txConn = conn;
		this._txActive = true;
		await this.query("BEGIN");
		return {
			id,
		};
	}

	async commitTransaction(handle: TransactionHandle) {
		await this.query("COMMIT");
		this._releaseTx();
	}

	async rollbackTransaction(handle: TransactionHandle) {
		await this.query("ROLLBACK");
		this._releaseTx();
	}

	async createIndex(config: VQueryT.CreateIndex) {
		await this._waitForTx();
		const { collection, index } = config;
		const { fields, opts } = index;
		const indexName = opts?.name || `idx_${collection}_${fields.join("_")}`;
		const uniqueStr = opts?.unique ? "UNIQUE " : "";
		const fieldsStr = fields.map(field => quoteIdentifier(field)).join(", ");
		await this.query(
			`CREATE ${uniqueStr}INDEX IF NOT EXISTS ${quoteIdentifier(indexName)} ON ${this.table(collection)} (${fieldsStr})`,
		);
	}

	async removeIndex(config: VQueryT.RemoveIndex) {
		await this._waitForTx();
		const { collection, index } = config;
		const { fields, opts } = index;
		const indexName = opts?.name || `idx_${collection}_${fields.join("_")}`;
		await this.query(
			`DROP INDEX IF EXISTS ${quoteIdentifier(indexName)} ON ${this.table(collection)}`,
		);
	}
}
