import { ValtheraClass } from "@wxn0brp/db-core";
import { describe, expect, it } from "bun:test";
import { Pool } from "pg";
import { createPostgreSQLValthera, PostgreSQLValthera } from "../src";

const DATABASE_URL =
	process.env.DATABASE_URL ?? "postgresql://localhost:5432/vdb_test";

function collection(name: string) {
	return `vdb_pg_${process.pid}_${name}`;
}

async function setup(name: string) {
	const pool = new Pool({
		connectionString: DATABASE_URL,
	});
	const action = new PostgreSQLValthera(pool, {
		mode: "lazy",
	});
	const db = new ValtheraClass({
		adapter: action,
	});
	const table = collection(name);
	await action.removeCollection(table);
	await action.query(
		`CREATE TABLE ${action.table(table)} (
            _id TEXT PRIMARY KEY
        )`,
	);
	return {
		pool,
		action,
		db,
		table,
	};
}

describe("PostgreSQLValthera", () => {
	it("1. adds and finds rows with generated _id", async () => {
		const { db, table } = await setup("add_find");
		try {
			const users = db.c(table);
			const added = await users.add({
				user: "Julia",
				age: 37,
			});
			const found = await users.find({
				user: "Julia",
			});

			expect(typeof added._id).toBe("string");
			expect(found).toHaveLength(1);
			expect(found[0]).toMatchObject({
				_id: added._id,
				user: "Julia",
				age: 37,
			});
		} finally {
			await db.removeCollection(table);
			await db.close();
		}
	});

	it("2. does not create missing tables", async () => {
		const pool = new Pool({
			connectionString: DATABASE_URL,
		});
		const action = new PostgreSQLValthera(pool);
		const db = new ValtheraClass({
			adapter: action,
		});
		const table = collection("missing");

		try {
			await action.removeCollection(table);
			let error: Error | null = null;
			try {
				await action.add({
					collection: table,
					data: {
						user: "Ada",
					},
				});
			} catch (err: any) {
				error = err;
			}
			expect(error?.message).toContain("does not exist");
		} finally {
			await db.close();
		}
	});

	it("3. does not alter missing columns in strict mode", async () => {
		const pool = new Pool({
			connectionString: DATABASE_URL,
		});
		const action = new PostgreSQLValthera(pool);
		const table = collection("strict_columns");

		try {
			await action.removeCollection(table);
			await action.query(
				`CREATE TABLE ${action.table(table)} (
                    _id TEXT PRIMARY KEY
                )`,
			);

			let error: Error | null = null;
			try {
				await action.add({
					collection: table,
					data: {
						user: "Ada",
					},
				});
			} catch (err: any) {
				error = err;
			}
			expect(error?.message).toContain("does not exist");
		} finally {
			await action.removeCollection(table);
			await action.close();
		}
	});

	it("4. uses existing user-created columns in strict mode", async () => {
		const pool = new Pool({
			connectionString: DATABASE_URL,
		});
		const action = new PostgreSQLValthera(pool);
		const db = new ValtheraClass({
			adapter: action,
		});
		const table = collection("strict_ready");

		try {
			await action.removeCollection(table);
			await action.query(
				`CREATE TABLE ${action.table(table)} (
                    _id TEXT PRIMARY KEY,
                    "user" TEXT NOT NULL
                )`,
			);

			const users = db.c(table);
			await users.add({
				_id: "u1",
				user: "Ada",
			});
			const found = await users.findOne({
				user: "Ada",
			});

			expect(found).toMatchObject({
				_id: "u1",
				user: "Ada",
			});
		} finally {
			await db.removeCollection(table);
			await db.close();
		}
	});

	it("5. creates missing tables and columns in lazy mode", async () => {
		const pool = new Pool({
			connectionString: DATABASE_URL,
		});
		const action = new PostgreSQLValthera(pool, {
			mode: "lazy",
		});
		const db = new ValtheraClass({
			adapter: action,
		});
		const table = collection("lazy_create");

		try {
			await action.removeCollection(table);
			const users = db.c(table);
			const added = await users.add({
				user: "Ada",
				age: 7,
			});
			const found = await users.findOne({
				_id: added._id,
			});

			expect(found).toMatchObject({
				user: "Ada",
				age: 7,
			});
		} finally {
			await db.removeCollection(table);
			await db.close();
		}
	});

	it("6. updates matching rows", async () => {
		const { db, table } = await setup("update");
		try {
			const users = db.c(table);
			await users.add({
				user: "Ada",
				age: 7,
			});

			const updated = await users.update(
				{
					user: "Ada",
				},
				{
					age: 18,
				},
			);
			const found = await users.find({
				user: "Ada",
			});

			expect(updated).toHaveLength(1);
			expect(updated[0]).toMatchObject({
				user: "Ada",
				age: 18,
			});
			expect(found[0]).toMatchObject({
				user: "Ada",
				age: 18,
			});
		} finally {
			await db.removeCollection(table);
			await db.close();
		}
	});

	it("7. finds rows by native _id column", async () => {
		const { db, table } = await setup("id_find");
		try {
			const users = db.c(table);
			await users.add({
				_id: "u1",
				user: "Ada",
			});

			const byId = await users.find({
				_id: "u1",
			});
			const byIn = await db.find({
				collection: table,
				search: {
					$in: {
						_id: [
							"u1",
						],
					},
				},
			});
			const exists = await db.find({
				collection: table,
				search: {
					$exists: {
						_id: true,
					},
				},
			});
			const missing = await db.find({
				collection: table,
				search: {
					$exists: {
						_id: false,
					},
				},
			});

			expect(byId).toHaveLength(1);
			expect(byId[0]).toMatchObject({
				_id: "u1",
				user: "Ada",
			});
			expect(byIn).toHaveLength(1);
			expect(exists).toHaveLength(1);
			expect(missing).toHaveLength(0);
		} finally {
			await db.removeCollection(table);
			await db.close();
		}
	});

	it("8. does not change existing column type when updating a field to null", async () => {
		const { db, action, table } = await setup("null_type");
		try {
			const items = db.c(table);
			await items.add({
				_id: "i1",
				score: 10,
			});
			await items.updateOne(
				{
					_id: "i1",
				},
				{
					score: null,
				},
			);
			await items.updateOne(
				{
					_id: "i1",
				},
				{
					score: 20,
				},
			);

			const columns = await action.query<{
				udt_name: string;
			}>(
				`SELECT udt_name
                 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
				[
					table,
					"score",
				],
			);
			const found = await items.findOne({
				_id: "i1",
			});

			expect(columns.rows[0]?.udt_name).toBe("float8");
			expect(found).toMatchObject({
				_id: "i1",
				score: 20,
			});
		} finally {
			await db.removeCollection(table);
			await db.close();
		}
	});

	it("9. stores document fields as PostgreSQL columns instead of JSON", async () => {
		const { db, action, table } = await setup("columns");
		try {
			const users = db.c(table);
			await users.add({
				user: "Ada",
				age: 7,
				active: true,
			});

			const columns = await action.query<{
				column_name: string;
				udt_name: string;
			}>(
				`SELECT column_name, udt_name
                 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = $1`,
				[
					table,
				],
			);
			const byName = new Map(
				columns.rows.map(row => [
					row.column_name,
					row.udt_name,
				]),
			);

			expect([
				...byName.values(),
			]).not.toContain("json");
			expect([
				...byName.values(),
			]).not.toContain("jsonb");
			expect(byName.get("user")).toBe("text");
			expect(byName.get("age")).toBe("float8");
			expect(byName.get("active")).toBe("bool");
		} finally {
			await db.removeCollection(table);
			await db.close();
		}
	});

	it("10. removes matching rows", async () => {
		const { db, table } = await setup("remove");
		try {
			const users = db.c(table);
			await users.add({
				user: "Julia",
				age: 37,
			});
			await users.add({
				user: "Ada",
				age: 7,
			});

			const removed = await users.remove({
				user: "Ada",
			});
			const remaining = await users.find({});

			expect(removed).toHaveLength(1);
			expect(removed[0]).toMatchObject({
				user: "Ada",
				age: 7,
			});
			expect(remaining).toHaveLength(1);
			expect(remaining[0]).toMatchObject({
				user: "Julia",
				age: 37,
			});
		} finally {
			await db.removeCollection(table);
			await db.close();
		}
	});

	it("11. applies advanced search operators and find options", async () => {
		const { db, table } = await setup("advanced");
		try {
			const items = db.c(table);
			await items.add({
				name: "A",
				val: 5,
				hidden: 1,
			});
			await items.add({
				name: "B",
				val: 10,
				hidden: 2,
			});
			await items.add({
				name: "C",
				val: 15,
				hidden: 3,
			});

			const found = await db.find<{
				name: string;
				val: number;
			}>({
				collection: table,
				search: {
					$gt: {
						val: 7,
					},
				},
				findOpts: {
					select: [
						"name",
						"val",
					],
				},
			});

			expect(found).toHaveLength(2);
			expect(found[0]).toEqual({
				name: "B",
				val: 10,
			});
			expect(found[1]).toEqual({
				name: "C",
				val: 15,
			});
		} finally {
			await db.removeCollection(table);
			await db.close();
		}
	});

	it("12. createPostgreSQLValthera close closes the pool", async () => {
		const pool = new Pool({
			connectionString: DATABASE_URL,
		});
		const db = createPostgreSQLValthera(pool);

		await db.close();

		expect((pool as any).ended).toBe(true);
	});

	it("13. supports custom primary keys per table", async () => {
		const pool = new Pool({
			connectionString: DATABASE_URL,
		});
		const table = collection("custom_primary_key");
		const action = new PostgreSQLValthera(pool, {
			mode: "lazy",
			primaryKey: {
				[table]: "user_id",
			},
		});
		const db = new ValtheraClass({
			adapter: action,
		});
		try {
			await action.removeCollection(table);
			const users = db.c(table);
			await users.add({
				user_id: "u1",
				name: "Ada",
			});
			const found = await users.findOne({
				user_id: "u1",
			});

			expect(found).toMatchObject({
				user_id: "u1",
				name: "Ada",
			});
		} finally {
			await db.removeCollection(table);
			await db.close();
		}
	});

	it("14. preserves Date fields through timestamp columns", async () => {
		const { db, action, table } = await setup("date");
		try {
			const happenedAt = new Date("2026-06-11T12:34:56.789Z");
			const events = db.c(table);
			await events.add({
				_id: "e1",
				happenedAt,
			});

			const found = await events.findOne({
				_id: "e1",
			});
			const columns = await action.query<{
				udt_name: string;
			}>(
				`SELECT udt_name
                 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
				[
					table,
					"happenedAt",
				],
			);

			expect(found?.happenedAt).toBeInstanceOf(Date);
			// biome-ignore lint/correctness/noUnsafeOptionalChaining: .
			expect((found?.happenedAt as Date).toISOString()).toBe(
				happenedAt.toISOString(),
			);
			expect(columns.rows[0]?.udt_name).toBe("timestamptz");
		} finally {
			await db.removeCollection(table);
			await db.close();
		}
	});

	it("15. converts column to BYTEA on incompatible non-null field type changes", async () => {
		const { db, action, table } = await setup("type_conflict");
		try {
			const items = db.c(table);
			await items.add({
				_id: "i1",
				value: 1,
			});
			await action.updateOne({
				collection: table,
				search: {
					_id: "i1",
				},
				updater: {
					value: "one",
				},
			});

			const columns = await action.query<{
				udt_name: string;
			}>(
				`SELECT udt_name
                 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
				[
					table,
					"value",
				],
			);
			const found = await items.findOne({
				_id: "i1",
			});

			expect(columns.rows[0]?.udt_name).toBe("bytea");
			expect(found).toMatchObject({
				_id: "i1",
				value: "one",
			});
		} finally {
			await db.removeCollection(table);
			await db.close();
		}
	});

	it("16. migrates legacy JSONB tables in lazy mode", async () => {
		const pool = new Pool({
			connectionString: DATABASE_URL,
		});
		const action = new PostgreSQLValthera(pool, {
			mode: "lazy",
		});
		const db = new ValtheraClass({
			adapter: action,
		});
		const table = collection("legacy_jsonb");

		try {
			await action.removeCollection(table);
			await action.query(
				`CREATE TABLE ${action.table(table)} (
                    _id TEXT PRIMARY KEY,
                    data JSONB NOT NULL
                )`,
			);
			await action.query(
				`INSERT INTO ${action.table(table)} (_id, data) VALUES ($1, $2::jsonb)`,
				[
					"l1",
					JSON.stringify({
						_id: "l1",
						name: "Legacy",
						count: 2,
					}),
				],
			);

			const found = await db.c(table).findOne({
				name: "Legacy",
			});
			const columns = await action.query<{
				column_name: string;
				udt_name: string;
			}>(
				`SELECT column_name, udt_name
                 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = $1`,
				[
					table,
				],
			);
			const byName = new Map(
				columns.rows.map(row => [
					row.column_name,
					row.udt_name,
				]),
			);

			expect(found).toMatchObject({
				_id: "l1",
				name: "Legacy",
				count: 2,
			});
			expect(byName.has("data")).toBe(false);
			expect(byName.get("name")).toBe("text");
			expect(byName.get("count")).toBe("float8");
		} finally {
			await db.removeCollection(table);
			await db.close();
		}
	});

	it("17. supports explicit PostgreSQL schemas", async () => {
		const pool = new Pool({
			connectionString: DATABASE_URL,
		});
		const schema = `vdb_pg_schema_${process.pid}`;
		const table = collection("schema_table");
		const action = new PostgreSQLValthera(pool, {
			mode: "lazy",
			schema,
		});
		const db = new ValtheraClass({
			adapter: action,
		});

		try {
			await action.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
			await action.removeCollection(table);

			const users = db.c(table);
			await users.add({
				_id: "s1",
				user: "SchemaUser",
			});
			const found = await users.findOne({
				user: "SchemaUser",
			});
			const collections = await db.getCollections();

			expect(found).toMatchObject({
				_id: "s1",
				user: "SchemaUser",
			});
			expect(collections).toContain(table);
		} finally {
			await db.removeCollection(table);
			await action.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
			await db.close();
		}
	});
});
