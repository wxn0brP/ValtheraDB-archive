import { Id } from "@wxn0brp/db-core";
import { ActionsBase } from "@wxn0brp/db-core/base/actions";
import { AdapterError, QueryValidationError } from "@wxn0brp/db-core/errors";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { TransactionHandle } from "@wxn0brp/db-core/types/transaction";
import { add, bulkAdd } from "./add";
import { buildWhere } from "./buildWhere";
import { MAX_STMT_CACHE } from "./const";
import { find } from "./find";
import { remove } from "./remove";
import { AffinityMap, SupportedDB, VStatement } from "./types";
import { update } from "./update";
import { computeAffinity, execStmt, qid } from "./utils";
import { version } from "./version";

export class SQLiteValthera extends ActionsBase {
	_inited = true;
	_stmtCache = new Map<string, VStatement>();
	_stmtCacheKeys: string[] = [];
	_pendingStmts = new Map<string, Promise<VStatement>>();
	_tableColumns = new Map<string, Set<string>>();
	_tableAffinities = new Map<string, AffinityMap>();
	_txActive = false;
	_txWaiters: Array<() => void> = [];
	version = version;
	capabilities = {
		transactions: true,
		indexes: true,
		persistent: true,
	};

	constructor(
		public db: SupportedDB,
		public primaryKey: Record<string, string> = {},
	) {
		super();
	}

	async _waitForTx() {
		if (!this._txActive) return;
		return await new Promise<void>(resolve => {
			this._txWaiters.push(resolve);
		});
	}

	_releaseTx() {
		this._txActive = false;
		const waiters = this._txWaiters;
		this._txWaiters = [];
		for (const w of waiters) w();
	}

	async _getTableInfo(collection: string): Promise<Record<string, string>> {
		const stmt = await this._prepare(`PRAGMA table_info(${qid(collection)})`);
		const rows: any[] = await execStmt(stmt, "all");
		const info: Record<string, string> = {};
		for (const r of rows) info[r.name] = r.type || "";
		return info;
	}

	async _invalidateTableCache(collection: string): Promise<void> {
		this._tableColumns.delete(collection);
		this._tableAffinities.delete(collection);
	}

	async _getTableColumns(collection: string): Promise<Set<string>> {
		const cached = this._tableColumns.get(collection);
		if (cached) return cached;

		const info = await this._getTableInfo(collection);
		const cols = new Set(Object.keys(info));
		this._tableColumns.set(collection, cols);
		return cols;
	}

	async _getColumnAffinities(collection: string): Promise<AffinityMap> {
		const cached = this._tableAffinities.get(collection);
		if (cached) return cached;

		const info = await this._getTableInfo(collection);
		const affinities: AffinityMap = {};
		for (const [name, type] of Object.entries(info))
			affinities[name] = computeAffinity(type);
		this._tableAffinities.set(collection, affinities);
		return affinities;
	}

	async _ensureColumns(collection: string, keys: string[]): Promise<void> {
		const existing = await this._getTableColumns(collection);
		const missing = keys.filter(k => k !== "_id" && !existing.has(k));
		if (missing.length === 0) return;

		for (const col of missing) {
			const stmt = await this._prepare(
				`ALTER TABLE ${qid(collection)} ADD COLUMN ${qid(col)}`,
			);
			await execStmt(stmt, "run");
		}

		await this._invalidateTableCache(collection);
	}

	async close() {
		this._stmtCache.clear();
		this._stmtCacheKeys = [];
		this._pendingStmts.clear();
		this._tableColumns.clear();
		this._tableAffinities.clear();
		const close = (this.db as any).close;
		if (typeof close === "function") await Promise.resolve(close.call(this.db));
	}

	async _prepare(sql: string): Promise<VStatement> {
		const cached = this._stmtCache.get(sql);
		if (cached) return cached;

		const pending = this._pendingStmts.get(sql);
		if (pending) return pending;

		const promise = this._prepareUncached(sql).finally(() => {
			this._pendingStmts.delete(sql);
		});
		this._pendingStmts.set(sql, promise);
		return promise;
	}

	private async _prepareUncached(sql: string): Promise<VStatement> {
		const db = this.db as any;
		let stmt: VStatement;

		if (typeof db.prepare !== "undefined") {
			stmt = await db.prepare(sql);
		} else if (typeof db.prepareSync !== "undefined") {
			stmt = await db.prepareSync(sql);
		} else if (typeof db.query === "function") {
			const q = await db.query(sql);
			if (q && (q.all || q.get || q.run)) {
				stmt = q;
			} else {
				throw new AdapterError(new Error("Unsupported database"), {
					sql,
					driver: "query",
				});
			}
		} else {
			throw new AdapterError(new Error("Unsupported database"), {
				sql,
				driver: "unknown",
			});
		}

		this._cacheStmt(sql, stmt);
		return stmt;
	}

	_cacheStmt(sql: string, stmt: VStatement) {
		if (this._stmtCache.size >= MAX_STMT_CACHE) {
			const oldest = this._stmtCacheKeys.shift();
			if (oldest) this._stmtCache.delete(oldest);
		}
		this._stmtCache.set(sql, stmt);
		this._stmtCacheKeys.push(sql);
	}

	async getCollections(): Promise<string[]> {
		const stmt = await this._prepare(
			"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
		);
		const tables = await execStmt(stmt, "all");
		return tables.map((t: any) => t.name);
	}

	async add(config: VQueryT.Add) {
		if (!config.transaction) await this._waitForTx();
		return add(this, config);
	}

	async find(config: VQueryT.Find) {
		if (!config.transaction) await this._waitForTx();
		return find(this, config);
	}

	async findOne(config: VQueryT.Find) {
		if (!config.transaction) await this._waitForTx();
		config.dbFindOpts = {
			limit: 1,
		};
		const result = await this.find(config);
		return result.length ? result[0] : null;
	}

	async update(config: VQueryT.Update) {
		if (!config.transaction) await this._waitForTx();
		return update(this, config, false);
	}

	async updateOne(config: VQueryT.Update) {
		if (!config.transaction) await this._waitForTx();
		const res = await update(this, config, true);
		return res[0] || null;
	}

	async remove(config: VQueryT.Remove) {
		if (!config.transaction) await this._waitForTx();
		return remove(this, config, false);
	}

	async removeOne(config: VQueryT.Remove) {
		if (!config.transaction) await this._waitForTx();
		const res = await remove(this, config, true);
		return res[0] || null;
	}

	async removeCollection(collection: string): Promise<boolean> {
		const sql = `DROP TABLE IF EXISTS ${qid(collection)}`;
		const stmt = await this._prepare(sql);
		await execStmt(stmt, "run");
		await this._invalidateTableCache(collection);
		return true;
	}

	async issetCollection(collection: string): Promise<boolean> {
		const stmt = await this._prepare(
			"SELECT name FROM sqlite_master WHERE type='table' AND name=?",
		);
		const result = await execStmt(stmt, "all", collection);
		return result.length > 0;
	}

	async ensureCollection(collection: string): Promise<boolean> {
		const issetCollection = await this.issetCollection(collection);
		if (!issetCollection) {
			throw new QueryValidationError(
				`Collection "${collection}" not found. Please create it first.`,
				{
					collection,
					op: "ensureCollection",
				},
			);
		}
		return true;
	}

	async beginTransaction(id: Id): Promise<TransactionHandle> {
		await this._waitForTx();
		const stmt = await this._prepare("BEGIN");
		await execStmt(stmt, "run");
		this._txActive = true;
		return {
			id,
		};
	}

	async commitTransaction(handle: TransactionHandle) {
		const stmt = await this._prepare("COMMIT");
		await execStmt(stmt, "run");
		this._releaseTx();
	}

	async rollbackTransaction(handle: TransactionHandle) {
		const stmt = await this._prepare("ROLLBACK");
		await execStmt(stmt, "run");
		this._releaseTx();
	}

	async createIndex(config: VQueryT.CreateIndex) {
		await this._waitForTx();
		const { collection, index } = config;
		const { fields, opts } = index;

		const indexName = opts?.name || `idx_${collection}_${fields.join("_")}`;
		const uniqueStr = opts?.unique ? "UNIQUE " : "";
		const fieldsStr = fields.map(f => qid(f)).join(", ");

		const sql = `CREATE ${uniqueStr}INDEX IF NOT EXISTS ${qid(indexName)} ON ${qid(collection)} (${fieldsStr})`;
		const stmt = await this._prepare(sql);
		await execStmt(stmt, "run");
	}

	async removeIndex(config: VQueryT.RemoveIndex) {
		await this._waitForTx();
		const { collection, index } = config;
		const { fields, opts } = index;

		const indexName = opts?.name || `idx_${collection}_${fields.join("_")}`;

		const sql = `DROP INDEX IF EXISTS ${qid(indexName)}`;
		const stmt = await this._prepare(sql);
		await execStmt(stmt, "run");
	}

	async count(config: VQueryT.Count) {
		if (!config.transaction) await this._waitForTx();
		const { collection, search } = config;

		const affinities = await this._getColumnAffinities(collection);
		const where = buildWhere(search, affinities);

		if (where.postFilter) {
			return (await this.find(config as VQueryT.Find)).length;
		}

		const sql = where.sql
			? `SELECT COUNT(*) as count FROM ${qid(collection)} WHERE ${where.sql}`
			: `SELECT COUNT(*) as count FROM ${qid(collection)}`;

		const stmt = await this._prepare(sql);
		const row = await execStmt(stmt, "get", ...where.values);
		return (row as any)?.count ?? 0;
	}

	async bulkAdd(config: VQueryT.BulkAdd) {
		if (!config.transaction) await this._waitForTx();
		return bulkAdd(this, config);
	}
}
