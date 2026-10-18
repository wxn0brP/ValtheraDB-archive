import { Id } from "@wxn0brp/db-core";
import { ActionsBase } from "@wxn0brp/db-core/base/actions";
import {
	AdapterCloseError,
	AdapterError,
	AdapterInitError,
	isValtheraError,
	QueryValidationError,
	TransactionError,
} from "@wxn0brp/db-core/errors";
import { addId, addIdBulk } from "@wxn0brp/db-core/helpers/addId";
import { genId } from "@wxn0brp/db-core/helpers/gen";
import { DataInternal } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { TransactionHandle } from "@wxn0brp/db-core/types/transaction";
import { find } from "./find";
import { remove } from "./remove";
import { serializeData } from "./storage/codec";
import { quoteIdentifier, sqlColumnForField } from "./storage/identifiers";
import { ensureColumns, migrateLegacyJsonb } from "./storage/schema";
import { buildWhere } from "./storage/where";
import {
	PostgreSQLValtheraOptions,
	QueryablePostgreSQL,
	SupportedPostgreSQL,
} from "./types";
import { update } from "./update";
import { version } from "./version";

export class PostgreSQLValthera extends ActionsBase {
	_inited = true;
	version = version;
	capabilities = {
		transactions: true,
		indexes: true,
		persistent: true,
	};
	schema?: string;
	mode: "strict" | "lazy";
	primaryKeyOption: string | Record<string, string>;
	private connectionString?: string;
	private _knownCollections: Set<string> = new Set();

	constructor(
		public db: SupportedPostgreSQL,
		opts: PostgreSQLValtheraOptions = {},
	) {
		super();
		this.schema = opts.schema;
		this.mode = opts.mode ?? "strict";
		this.primaryKeyOption = opts.primaryKey ?? "_id";
		this.connectionString =
			(this.db as any).connectionString ||
			(this.db as any).options?.connectionString;
	}

	async init() {
		if (this.db && !(this.db as any).ended) return;
		if (!this.connectionString) return;
		try {
			const { Pool } = await import("pg");
			this.db = new Pool({
				connectionString: this.connectionString,
			});
		} catch (err) {
			if (isValtheraError(err)) throw err;
			throw new AdapterInitError(err, {
				schema: this.schema,
				mode: this.mode,
			});
		}
	}

	async close() {
		const end = (this.db as any).end;
		if (typeof end !== "function") return;
		try {
			await Promise.resolve(end.call(this.db));
		} catch (err) {
			if (isValtheraError(err)) throw err;
			throw new AdapterCloseError(err, {
				schema: this.schema,
			});
		}
	}

	async query<T extends Record<string, any> = Record<string, any>>(
		sql: string,
		values: any[] = [],
	) {
		try {
			return await (this.db as QueryablePostgreSQL).query<T>(sql, values);
		} catch (err) {
			if (isValtheraError(err)) throw err;
			throw new AdapterError(err, {
				sql,
			});
		}
	}

	table(collection: string) {
		const table = quoteIdentifier(collection);
		return this.schema ? `${quoteIdentifier(this.schema)}.${table}` : table;
	}

	metadataTable(collection: string) {
		return collection;
	}

	primaryKey(collection: string) {
		return typeof this.primaryKeyOption === "string"
			? this.primaryKeyOption
			: (this.primaryKeyOption[collection] ?? "_id");
	}

	async getCollections(): Promise<string[]> {
		const schema = this.schema || "public";
		const result = await this.query<{
			table_name: string;
		}>(
			`SELECT table_name
             FROM information_schema.tables
             WHERE table_schema = $1 AND table_type = 'BASE TABLE'
             ORDER BY table_name`,
			[
				schema,
			],
		);
		return result.rows.map(row => row.table_name);
	}

	async ensureCollection(collection: string): Promise<boolean> {
		const exists = await this.issetCollection(collection);
		if (!exists && this.mode === "strict")
			throw new QueryValidationError(
				`PostgreSQL table ${this.table(collection)} does not exist`,
				{
					collection,
					mode: this.mode,
				},
			);

		if (!exists) {
			const primaryKey = this.primaryKey(collection);
			await this.query(`CREATE TABLE ${this.table(collection)} (
                ${quoteIdentifier(primaryKey)} TEXT PRIMARY KEY
            )`);
			this._knownCollections.add(collection);
			return true;
		}

		await migrateLegacyJsonb(this, collection);
		return false;
	}

	async issetCollection(collection: string): Promise<boolean> {
		if (this._knownCollections.has(collection)) return true;

		const schema = this.schema || "public";
		const result = await this.query<{
			exists: boolean;
		}>(
			`SELECT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = $1 AND table_name = $2 AND table_type = 'BASE TABLE'
            ) AS "exists"`,
			[
				schema,
				this.metadataTable(collection),
			],
		);
		const exists = Boolean(result.rows[0]?.exists);
		if (exists) {
			this._knownCollections.add(collection);
		}
		return exists;
	}

	async removeCollection(collection: string): Promise<boolean> {
		await this.query(`DROP TABLE IF EXISTS ${this.table(collection)}`);
		this._knownCollections.delete(collection);
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
		const fields = serializeData(data, primaryKey);
		await ensureColumns(this, collection, fields);

		const columns = [
			quoteIdentifier(primaryKey),
			...fields.map(field => sqlColumnForField(field.key)),
		];
		const values = [
			storageId,
			...fields.map(field => field.value),
		];
		const placeholders = values.map((_, index) => `$${index + 1}`);

		await this.query(
			`INSERT INTO ${this.table(collection)}
			(${columns.join(", ")})
             VALUES (${placeholders.join(", ")})`,
			values,
		);

		return data;
	}

	async bulkAdd(config: VQueryT.BulkAdd): Promise<DataInternal[]> {
		const { collection, datas } = config;
		if (!datas.length) return datas;

		await this.ensureCollection(collection);
		const primaryKey = this.primaryKey(collection);
		if (primaryKey === "_id") {
			await addIdBulk(config, this, true);
		} else {
			for (const data of datas) {
				if ((data as any)[primaryKey] === undefined)
					(data as any)[primaryKey] = genId();
			}
		}

		const serialized = datas.map(data => serializeData(data, primaryKey));
		await ensureColumns(this, collection, serialized.flat());

		const keys: string[] = [];
		const seen = new Set<string>();
		for (const fields of serialized) {
			for (const field of fields) {
				if (seen.has(field.key)) continue;
				seen.add(field.key);
				keys.push(field.key);
			}
		}

		const columns = [
			quoteIdentifier(primaryKey),
			...keys.map(sqlColumnForField),
		];
		const values: any[] = [];
		const rows: string[] = [];

		for (let i = 0; i < datas.length; i++) {
			const byKey = new Map(
				serialized[i].map(field => [
					field.key,
					field.value,
				]),
			);
			const originalId = (datas[i] as any)[primaryKey] ?? genId();
			const storageId =
				typeof originalId !== "string" ? String(originalId) : originalId;
			const row = [
				storageId,
				...keys.map(key => (byKey.has(key) ? byKey.get(key) : null)),
			];
			const base = values.length;
			rows.push(
				`(${row.map((_, index) => `$${base + index + 1}`).join(", ")})`,
			);
			values.push(...row);
		}

		await this.query(
			`INSERT INTO ${this.table(collection)}
			(${columns.join(", ")})
             VALUES ${rows.join(", ")}`,
			values,
		);

		return datas as DataInternal[];
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

	async beginTransaction(
		id: Id,
		collections: string[] = [],
	): Promise<TransactionHandle> {
		try {
			await this.query("BEGIN");
		} catch (err) {
			throw new TransactionError("Failed to begin transaction", {
				cause: err,
				context: {
					collections,
				},
			});
		}
		return {
			id,
		};
	}

	async commitTransaction(handle: TransactionHandle): Promise<void> {
		try {
			await this.query("COMMIT");
		} catch (err) {
			throw new TransactionError("Failed to commit transaction", {
				cause: err,
				context: {
					handle: handle.id,
				},
			});
		}
	}

	async rollbackTransaction(handle: TransactionHandle): Promise<void> {
		try {
			await this.query("ROLLBACK");
		} catch (err) {
			throw new TransactionError("Failed to rollback transaction", {
				cause: err,
				context: {
					handle: handle.id,
				},
			});
		}
	}

	async createIndex(config: VQueryT.CreateIndex): Promise<void> {
		const { collection, index } = config;
		const { fields, opts } = index;
		const indexName = opts?.name || `idx_${collection}_${fields.join("_")}`;
		const uniqueStr = opts?.unique ? "UNIQUE " : "";
		const fieldsStr = fields.map(f => quoteIdentifier(f)).join(", ");
		await this.query(
			`CREATE ${uniqueStr}INDEX IF NOT EXISTS ${quoteIdentifier(indexName)} ON ${this.table(collection)} (${fieldsStr})`,
		);
	}

	async removeIndex(config: VQueryT.RemoveIndex): Promise<void> {
		const { collection, index } = config;
		const { fields, opts } = index;
		const indexName = opts?.name || `idx_${collection}_${fields.join("_")}`;
		await this.query(`DROP INDEX IF EXISTS ${quoteIdentifier(indexName)}`);
	}

	async count(config: VQueryT.Count): Promise<number> {
		const { collection } = config;
		await this.ensureCollection(collection);
		const where = await buildWhere(this, collection, config as VQueryT.Find);
		const result = await this.query<{
			count: string;
		}>(
			`SELECT COUNT(*) as count FROM ${this.table(collection)} ${where.sql}`,
			where.values,
		);
		return parseInt(result.rows[0]?.count || "0", 10);
	}
}
