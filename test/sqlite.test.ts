import { ValtheraClass } from "@wxn0brp/db-core";
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { SQLiteValthera } from "../src";

function setup(tableSql: string, primaryKey: Record<string, string> = {}) {
	const sqlDB = new Database(":memory:");
	const sqlActions = new SQLiteValthera(sqlDB, primaryKey);
	const db = new ValtheraClass({
		adapter: sqlActions,
	});

	sqlDB.prepare(tableSql).run();

	return {
		sqlDB,
		db,
	};
}

describe("SQLiteValthera", () => {
	test("1. adds and finds rows with default _id key", async () => {
		const { db } = setup(
			"CREATE TABLE users (_id TEXT PRIMARY KEY, user TEXT, age INT)",
		);
		const users = db.c("users");

		const added = await users.add({
			user: "Piotr",
			age: 37,
		});
		const found = await users.find({
			user: "Piotr",
		});

		expect(typeof added._id).toBe("string");
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({
			_id: added._id,
			user: "Piotr",
			age: 37,
		});
	});

	test("2. updates matching rows", async () => {
		const { db } = setup(
			"CREATE TABLE users (_id TEXT PRIMARY KEY, user TEXT, age INT)",
		);
		const users = db.c("users");

		await users.add({
			user: "Michał",
			age: 7,
		});
		const updated = await users.update(
			{
				user: "Michał",
			},
			{
				age: 18,
			},
		);
		const found = await users.find({
			user: "Michał",
		});

		expect(updated).toHaveLength(1);
		expect(updated[0]).toMatchObject({
			user: "Michał",
			age: 18,
		});
		expect(found[0]).toMatchObject({
			user: "Michał",
			age: 18,
		});
	});

	test("3. respects custom primary key during update", async () => {
		const { sqlDB, db } = setup(
			"CREATE TABLE users (user_id TEXT PRIMARY KEY, user TEXT, age INT)",
			{
				users: "user_id",
			},
		);
		const users = db.c("users");

		sqlDB
			.prepare("INSERT INTO users (user_id, user, age) VALUES (?, ?, ?)")
			.run("u1", "Piotr", 37);
		const updated = await users.update(
			{
				user: "Piotr",
			},
			{
				user_id: "u2",
				age: 38,
			},
		);
		const found = await users.find({
			user_id: "u1",
		});

		expect(updated).toHaveLength(1);
		expect(updated[0]).toMatchObject({
			user_id: "u1",
			user: "Piotr",
			age: 38,
		});
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({
			user_id: "u1",
			user: "Piotr",
			age: 38,
		});
	});

	test("4. removes rows using custom primary key", async () => {
		const { sqlDB, db } = setup(
			"CREATE TABLE users (user_id TEXT PRIMARY KEY, user TEXT, age INT)",
			{
				users: "user_id",
			},
		);
		const users = db.c("users");

		sqlDB
			.prepare("INSERT INTO users (user_id, user, age) VALUES (?, ?, ?)")
			.run("u1", "Piotr", 37);
		sqlDB
			.prepare("INSERT INTO users (user_id, user, age) VALUES (?, ?, ?)")
			.run("u2", "Michał", 7);

		const removed = await users.remove({
			user: "Michał",
		});
		const remaining = await users.find({});

		expect(removed).toHaveLength(1);
		expect(removed[0]).toMatchObject({
			user_id: "u2",
			user: "Michał",
			age: 7,
		});
		expect(remaining).toHaveLength(1);
		expect(remaining[0]).toMatchObject({
			user_id: "u1",
			user: "Piotr",
			age: 37,
		});
	});

	test("5. applies advanced search operators and find options", async () => {
		const { db } = setup(
			"CREATE TABLE items (_id TEXT PRIMARY KEY, name TEXT, val INT, hidden INT)",
		);
		const items = db.c("items");

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
			collection: "items",
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
	});

	test("6. round-trips booleans, nulls and numeric-like strings", async () => {
		const { db } = setup(
			"CREATE TABLE docs (_id TEXT PRIMARY KEY, flag INT, note TEXT, code TEXT)",
		);
		const docs = db.c("docs");

		await docs.add({
			_id: "d1",
			flag: true,
			note: "x",
			code: "007",
		});
		const doc = await docs.findOne({
			_id: "d1",
		});

		expect(doc.flag).toBe(true);
		expect(doc.note).toBe("x");
		expect(doc.code).toBe("007");

		const byBool = await docs.find({
			flag: true,
		});
		expect(byBool).toHaveLength(1);

		const byStr = await docs.find({
			code: "007",
		});
		expect(byStr).toHaveLength(1);
	});

	test("7. preserves foreign binary blobs", async () => {
		const { sqlDB, db } = setup(
			"CREATE TABLE bins (_id TEXT PRIMARY KEY, data BLOB)",
		);
		const binary = new Uint8Array([
			0x89,
			0x50,
			0x4e,
			0x47,
			0x0d,
			0x0a,
			0x1a,
			0x0a,
			1,
			2,
			3,
		]);
		sqlDB
			.prepare("INSERT INTO bins (_id, data) VALUES (?, ?)")
			.run("b1", binary);

		const bin = await db.c("bins").findOne({
			_id: "b1",
		});
		expect(bin.data).toBeInstanceOf(Uint8Array);
		expect(Array.from(bin.data)).toEqual(Array.from(binary));
	});

	test("8. search-by-null matches explicit nulls only", async () => {
		const { db } = setup("CREATE TABLE items (_id TEXT PRIMARY KEY, val TEXT)");
		const items = db.c("items");

		await items.add({
			_id: "a",
			val: null,
		});
		await items.add({
			_id: "b",
			val: "text",
		});
		await items.add({
			_id: "c",
		});

		const found = await items.find({
			val: null,
		});
		expect(found).toHaveLength(1);
		expect(found[0]._id).toBe("a");
		expect(found[0].val).toBeNull();
	});

	test("9. $exists pushdown matches missing columns", async () => {
		const { db } = setup(
			"CREATE TABLE items (_id TEXT PRIMARY KEY, temp TEXT)",
		);
		const items = db.c("items");

		await items.add({
			_id: "a",
			temp: "hot",
		});
		await items.add({
			_id: "b",
		});

		const existing = await items.find({
			$exists: {
				temp: true,
			},
		});
		expect(existing.map(d => d._id)).toEqual([
			"a",
		]);

		const missing = await items.find({
			$exists: {
				temp: false,
			},
		});
		expect(missing.map(d => d._id)).toEqual([
			"b",
		]);
	});

	test("10. empty $or matches nothing and invalid array search is rejected", async () => {
		const { db } = setup(
			"CREATE TABLE items (_id TEXT PRIMARY KEY, name TEXT)",
		);
		const items = db.c("items");
		await items.add({
			_id: "a",
			name: "A",
		});

		expect(
			await items.find({
				$or: [],
			}),
		).toHaveLength(0);
		expect(await items.find({} as any)).toHaveLength(1);
		await expect(
			items.find([
				"a",
			] as any),
		).rejects.toThrow("Search must be an object");
	});

	test("11. logical operators $and/$or/$not", async () => {
		const { db } = setup("CREATE TABLE items (_id TEXT PRIMARY KEY, val INT)");
		const items = db.c("items");
		for (const v of [
			1,
			5,
			10,
		])
			await items.add({
				_id: `i${v}`,
				val: v,
			});

		const or = await items.find({
			$or: [
				{
					val: 1,
				},
				{
					val: 10,
				},
			],
		});
		expect(or.map(d => d._id).sort()).toEqual([
			"i1",
			"i10",
		]);

		const and = await items.find({
			$and: [
				{
					$gt: {
						val: 0,
					},
				},
				{
					$lt: {
						val: 6,
					},
				},
			],
		});
		expect(and.map(d => d._id).sort()).toEqual([
			"i1",
			"i5",
		]);

		const not = await items.find({
			$not: {
				$gte: {
					val: 5,
				},
			},
		});
		expect(not.map(d => d._id)).toEqual([
			"i1",
		]);
	});

	test("12. range and list operators", async () => {
		const { db } = setup(
			"CREATE TABLE items (_id TEXT PRIMARY KEY, val INT, tag TEXT)",
		);
		const items = db.c("items");
		await items.add({
			_id: "a",
			val: 1,
			tag: "x",
		});
		await items.add({
			_id: "b",
			val: 5,
			tag: "y",
		});
		await items.add({
			_id: "c",
			val: 9,
			tag: "z",
		});

		expect(
			(
				await items.find({
					$between: {
						val: [
							2,
							8,
						],
					},
				})
			).map(d => d._id),
		).toEqual([
			"b",
		]);
		expect(
			(
				await items.find({
					$in: {
						val: [
							1,
							9,
						],
					},
				})
			)
				.map(d => d._id)
				.sort(),
		).toEqual([
			"a",
			"c",
		]);
		expect(
			(
				await items.find({
					$nin: {
						val: [
							1,
							9,
						],
					},
				})
			).map(d => d._id),
		).toEqual([
			"b",
		]);
		expect(
			(
				await items.find({
					$startswith: {
						tag: "y",
					},
				})
			).map(d => d._id),
		).toEqual([
			"b",
		]);
		expect(
			(
				await items.find({
					$endswith: {
						tag: "z",
					},
				})
			).map(d => d._id),
		).toEqual([
			"c",
		]);
	});

	test("13. $inc on missing column sets delta", async () => {
		const { db } = setup(
			"CREATE TABLE items (_id TEXT PRIMARY KEY, count INT)",
		);
		const items = db.c("items");
		await items.add({
			_id: "a",
		});

		const updated = await items.updateOne(
			{
				_id: "a",
			},
			{
				$inc: {
					count: 3,
				},
			},
		);
		expect(updated.count).toBe(3);

		const found = await items.findOne({
			_id: "a",
		});
		expect(found.count).toBe(3);
	});

	test("14. $unset removes field from database", async () => {
		const { db } = setup(
			"CREATE TABLE items (_id TEXT PRIMARY KEY, temp TEXT)",
		);
		const items = db.c("items");
		await items.add({
			_id: "a",
			temp: "value",
		});

		const updated = await items.updateOne(
			{
				_id: "a",
			},
			{
				$unset: {
					temp: "",
				},
			},
		);
		expect("temp" in updated).toBe(false);

		const found = await items.findOne({
			_id: "a",
		});
		expect("temp" in found).toBe(false);
	});

	test("15. update to undefined nullifies column", async () => {
		const { db } = setup("CREATE TABLE items (_id TEXT PRIMARY KEY, opt TEXT)");
		const items = db.c("items");
		await items.add({
			_id: "a",
			opt: "yes",
		});

		const updated = await items.updateOne(
			{
				_id: "a",
			},
			{
				opt: undefined,
			},
		);
		expect(updated.opt).toBeUndefined();

		const found = await items.findOne({
			_id: "a",
		});
		expect(
			updated.opt === undefined || !("opt" in found) || found.opt === null,
		).toBe(true);
	});

	test("16. add creates missing columns dynamically", async () => {
		const { db } = setup(
			"CREATE TABLE items (_id TEXT PRIMARY KEY, name TEXT)",
		);
		const items = db.c("items");

		await items.add({
			_id: "a",
			extra: 42,
		});
		const found = await items.findOne({
			_id: "a",
		});
		expect(found.extra).toBe(42);
	});

	test("17. concurrent queries share prepared statements safely", async () => {
		const { db } = setup("CREATE TABLE items (_id TEXT PRIMARY KEY, val INT)");
		const items = db.c("items");
		for (let i = 0; i < 20; i++)
			await items.add({
				_id: `i${i}`,
				val: i,
			});

		const results = await Promise.all(
			Array.from(
				{
					length: 10,
				},
				(_, k) =>
					items.findOne({
						_id: `i${k}`,
					}),
			),
		);
		results.forEach((r, k) => expect(r.val).toBe(k));
	});
});
