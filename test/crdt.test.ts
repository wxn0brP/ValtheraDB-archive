import { createMemoryValthera, ValtheraClass } from "@wxn0brp/db-core";
import { describe, expect, test } from "bun:test";
import { createCrdtPlugin, syncBoth, sync, rebuild, compact } from "../src";

interface User {
	_id: string;
	name: string;
	age?: number;
	last_name?: string;
}

interface Task {
	_id: string;
	title: string;
	done?: boolean;
}

function createDb(data: { users?: User[]; tasks?: Task[] } = {}) {
	const db = createMemoryValthera({
		users: data.users || [],
		tasks: data.tasks || [],
	}) as ValtheraClass & {
		users: any;
		tasks: any;
	};
	db.plugin(createCrdtPlugin());
	return db;
}

describe("crdt plugin", () => {
	test("1. records collection helper mutations and rebuilds from the operation log", async () => {
		const db1 = createDb();
		const db2 = createDb();

		const alice = await db1.users.add({
			name: "Alice",
		});
		await db1.users.updateOne(
			{
				_id: alice._id,
			},
			{
				age: 22,
			},
		);

		const log = await db1.find({
			collection: "__vcrdt__/users",
			search: {},
		});
		expect(log).toHaveLength(2);

		const result = await sync(db2, db1, "users", {
			rebuild: true,
		});
		expect(result).toMatchObject({
			collection: "users",
			copied: 2,
			changed: true,
			rebuild: true,
		});

		expect(await db2.users.find()).toEqual([
			expect.objectContaining({
				_id: alice._id,
				name: "Alice",
				age: 22,
			}),
		]);
	});

	test("2. syncBoth copies changes in both directions", async () => {
		const db1 = createDb();
		const db2 = createDb();

		const alice = await db1.users.add({
			name: "Alice",
		});
		const bob = await db2.users.add({
			name: "Bob",
		});

		const result = await syncBoth(db1, db2, "users", {
			rebuild: true,
		});

		expect(result.copied).toBe(2);
		expect(result.changed).toBe(true);
		expect(result.rebuild).toBe(true);

		const db1Users = await db1.users.find();
		const db2Users = await db2.users.find();

		expect(db1Users.map((user: User) => user._id).sort()).toEqual(
			[
				alice._id,
				bob._id,
			].sort(),
		);
		expect(db2Users.map((user: User) => user._id).sort()).toEqual(
			[
				alice._id,
				bob._id,
			].sort(),
		);
	});

	test("3. sync is idempotent when called repeatedly", async () => {
		const db1 = createDb();
		const db2 = createDb();

		await db1.users.add({
			name: "Alice",
		});

		expect(await sync(db2, db1, "users", true)).toMatchObject({
			copied: 1,
			changed: true,
		});
		expect(await sync(db2, db1, "users", true)).toMatchObject({
			copied: 0,
			changed: false,
		});

		expect(await db2.users.find()).toHaveLength(1);
		expect(
			await db2.find({
				collection: "__vcrdt__/users",
				search: {},
			}),
		).toHaveLength(1);
	});

	test("4. compact keeps current data as snapshot log entries", async () => {
		const db = createDb();

		const alice = await db.users.add({
			name: "Alice",
		});
		await db.users.add({
			name: "Bob",
		});
		await db.users.updateOne(
			{
				_id: alice._id,
			},
			{
				age: 22,
			},
		);

		expect(
			await db.find({
				collection: "__vcrdt__/users",
				search: {},
			}),
		).toHaveLength(3);

		await compact(db, "users");

		const compactedLog = await db.find({
			collection: "__vcrdt__/users",
			search: {},
		});
		expect(compactedLog).toHaveLength(2);
		expect(compactedLog.every((entry: any) => entry.p)).toBe(true);

		await rebuild(db, "users");
		expect(await db.users.find()).toEqual([
			expect.objectContaining({
				name: "Alice",
				age: 22,
			}),
			expect.objectContaining({
				name: "Bob",
			}),
		]);
	});
});

describe("crdt plugin - update operations", () => {
	test("5. update (multiple) is recorded and replayed correctly", async () => {
		const db1 = createDb();
		const db2 = createDb();

		await db1.users.add({
			name: "Alice",
			age: 20,
		});
		await db1.users.add({
			name: "Bob",
			age: 25,
		});
		await db1.users.add({
			name: "Charlie",
			age: 30,
		});

		await db1.users.update(
			{
				$gte: {
					age: 25,
				},
			} as any,
			{
				$inc: {
					age: 1,
				},
			},
		);

		const result = await sync(db2, db1, "users", {
			rebuild: true,
		});
		expect(result.copied).toBe(4);

		const users = await db2.users.find();
		expect(users).toEqual([
			expect.objectContaining({
				name: "Alice",
				age: 20,
			}),
			expect.objectContaining({
				name: "Bob",
				age: 26,
			}),
			expect.objectContaining({
				name: "Charlie",
				age: 31,
			}),
		]);
	});

	test("6. updateOneOrAdd is recorded and replayed correctly", async () => {
		const db1 = createDb();
		const db2 = createDb();

		const alice = await db1.users.add({
			name: "Alice",
			age: 20,
		});
		await db1.users.updateOneOrAdd(
			{
				_id: alice._id,
			},
			{
				age: 21,
			},
		);
		await db1.users.updateOneOrAdd(
			{
				_id: "nonexistent",
			},
			{
				age: 99,
			},
			{
				add_arg: {
					name: "NewUser",
					age: 99,
				},
			},
		);

		const result = await sync(db2, db1, "users", {
			rebuild: true,
		});
		expect(result.copied).toBe(3);

		const users = await db2.users.find();
		expect(users).toHaveLength(2);
		expect(users).toEqual([
			expect.objectContaining({
				name: "Alice",
				age: 21,
			}),
			expect.objectContaining({
				name: "NewUser",
				age: 99,
			}),
		]);
	});
});

describe("crdt plugin - remove operations", () => {
	test("7. removeOne is recorded and replayed correctly", async () => {
		const db1 = createDb();
		const db2 = createDb();

		const alice = await db1.users.add({
			name: "Alice",
		});
		await db1.users.add({
			name: "Bob",
		});
		await db1.users.removeOne({
			_id: alice._id,
		});

		const result = await sync(db2, db1, "users", {
			rebuild: true,
		});
		expect(result.copied).toBe(3);

		const users = await db2.users.find();
		expect(users).toHaveLength(1);
		expect(users[0]).toEqual(
			expect.objectContaining({
				name: "Bob",
			}),
		);
	});

	test("8. remove (multiple) is recorded and replayed correctly", async () => {
		const db1 = createDb();
		const db2 = createDb();

		await db1.users.add({
			name: "Alice",
			age: 20,
		});
		await db1.users.add({
			name: "Bob",
			age: 25,
		});
		await db1.users.add({
			name: "Charlie",
			age: 30,
		});

		await db1.users.remove({
			$gte: {
				age: 25,
			},
		} as any);

		const result = await sync(db2, db1, "users", {
			rebuild: true,
		});
		expect(result.copied).toBe(4);

		const users = await db2.users.find();
		expect(users).toHaveLength(1);
		expect(users[0]).toEqual(
			expect.objectContaining({
				name: "Alice",
			}),
		);
	});
});

describe("crdt plugin - toggleOne", () => {
	test("9. toggleOne add is recorded and replayed correctly", async () => {
		const db1 = createDb();
		const db2 = createDb();

		await db1.users.toggleOne(
			{
				_id: "fav-1",
			},
			{
				name: "Favorite",
			},
		);

		const result = await sync(db2, db1, "users", {
			rebuild: true,
		});
		expect(result.copied).toBe(1);

		const users = await db2.users.find();
		expect(users).toHaveLength(1);
		expect(users[0]).toEqual(
			expect.objectContaining({
				_id: "fav-1",
				name: "Favorite",
			}),
		);
	});

	test("10. toggleOne remove then re-add is recorded correctly", async () => {
		const db1 = createDb();
		const db2 = createDb();

		await db1.users.add({
			_id: "fav-1",
			name: "Favorite",
		});
		await db1.users.toggleOne({
			_id: "fav-1",
		});
		await db1.users.toggleOne(
			{
				_id: "fav-1",
			},
			{
				name: "Favorite Again",
			},
		);

		const result = await sync(db2, db1, "users", {
			rebuild: true,
		});
		expect(result.copied).toBe(3);

		const users = await db2.users.find();
		expect(users).toHaveLength(1);
		expect(users[0]).toEqual(
			expect.objectContaining({
				_id: "fav-1",
				name: "Favorite Again",
			}),
		);
	});
});

describe("crdt plugin - multiple collections", () => {
	test("11. operations on different collections are isolated", async () => {
		const db1 = createDb();
		const db2 = createDb();

		await db1.users.add({
			name: "Alice",
		});
		await db1.tasks.add({
			title: "Task 1",
		});

		const userLog = await db1.find({
			collection: "__vcrdt__/users",
			search: {},
		});
		const taskLog = await db1.find({
			collection: "__vcrdt__/tasks",
			search: {},
		});

		expect(userLog).toHaveLength(1);
		expect(taskLog).toHaveLength(1);

		await sync(db2, db1, "users", {
			rebuild: true,
		});
		expect(await db2.users.find()).toHaveLength(1);
		expect(await db2.tasks.find()).toHaveLength(0);

		await sync(db2, db1, "tasks", {
			rebuild: true,
		});
		expect(await db2.tasks.find()).toHaveLength(1);
	});
});

describe("crdt plugin - concurrent edits", () => {
	test("12. concurrent updates from both sides merge via rebuild", async () => {
		const db1 = createDb();
		const db2 = createDb();

		const alice = await db1.users.add({
			name: "Alice",
		});

		await sync(db2, db1, "users", {
			rebuild: true,
		});

		await db1.users.updateOne(
			{
				_id: alice._id,
			},
			{
				age: 22,
			},
		);
		await db2.users.updateOne(
			{
				_id: alice._id,
			},
			{
				last_name: "Smith",
			},
		);

		await syncBoth(db1, db2, "users", {
			rebuild: true,
		});

		const db1Users = await db1.users.find();
		const db2Users = await db2.users.find();

		expect(db1Users).toEqual([
			expect.objectContaining({
				name: "Alice",
				age: 22,
				last_name: "Smith",
			}),
		]);
		expect(db2Users).toEqual([
			expect.objectContaining({
				name: "Alice",
				age: 22,
				last_name: "Smith",
			}),
		]);
	});

	test("13. three-way sync works correctly", async () => {
		const db1 = createDb();
		const db2 = createDb();
		const db3 = createDb();

		const alice = await db1.users.add({
			name: "Alice",
		});
		const bob = await db2.users.add({
			name: "Bob",
		});
		const charlie = await db3.users.add({
			name: "Charlie",
		});

		await syncBoth(db1, db2, "users", {
			rebuild: true,
		});
		await syncBoth(db2, db3, "users", {
			rebuild: true,
		});
		await syncBoth(db1, db3, "users", {
			rebuild: true,
		});

		for (const db of [
			db1,
			db2,
			db3,
		]) {
			const users = await db.users.find();
			expect(users).toHaveLength(3);
			const names = users.map((u: User) => u.name).sort();
			expect(names).toEqual([
				"Alice",
				"Bob",
				"Charlie",
			]);
		}
	});
});

describe("crdt plugin - exclude option", () => {
	test("14. excluded collections are not tracked", async () => {
		const db = createMemoryValthera({
			users: [],
			logs: [],
		}) as ValtheraClass & {
			users: any;
			logs: any;
		};
		db.plugin(
			createCrdtPlugin({
				exclude: [
					"logs",
				],
			}),
		);

		await db.users.add({
			name: "Alice",
		});
		await db.logs.add({
			message: "test",
		});

		const userLog = await db.find({
			collection: "__vcrdt__/users",
			search: {},
		});
		expect(userLog).toHaveLength(1);

		const logLog = await db.find({
			collection: "__vcrdt__/logs",
			search: {},
		});
		expect(logLog).toHaveLength(0);
	});
});

describe("crdt plugin - custom prefix", () => {
	test("15. custom prefix is used for log collections", async () => {
		const db = createMemoryValthera({
			users: [],
		}) as ValtheraClass & {
			users: any;
		};
		db.plugin(
			createCrdtPlugin({
				prefix: "__custom_crdt__",
			}),
		);

		await db.users.add({
			name: "Alice",
		});

		const log = await db.find({
			collection: "__custom_crdt__/users",
			search: {},
		});
		expect(log).toHaveLength(1);

		const defaultLog = await db.find({
			collection: "__vcrdt__/users",
			search: {},
		});
		expect(defaultLog).toHaveLength(0);
	});
});

describe("crdt plugin - edge cases", () => {
	test("20. sync with no changes returns copied: 0", async () => {
		const db1 = createDb();
		const db2 = createDb();

		const result = await sync(db2, db1, "users");
		expect(result).toMatchObject({
			copied: 0,
			changed: false,
			rebuild: false,
		});
	});

	test("21. sync without rebuild does not rebuild target", async () => {
		const db1 = createDb();
		const db2 = createDb();

		await db1.users.add({
			name: "Alice",
		});
		await sync(db2, db1, "users", {
			rebuild: false,
		});

		const log = await db2.find({
			collection: "__vcrdt__/users",
			search: {},
		});
		expect(log).toHaveLength(1);

		const users = await db2.users.find();
		expect(users).toHaveLength(0);
	});

	test("22. rebuild on empty log does nothing", async () => {
		const db = createDb();
		await rebuild(db, "users");
		expect(await db.users.find()).toHaveLength(0);
	});

	test("23. compact on empty collection produces empty log", async () => {
		const db = createDb();
		await compact(db, "users");
		const log = await db.find({
			collection: "__vcrdt__/users",
			search: {},
		});
		expect(log).toHaveLength(0);
	});

	test("24. multiple adds then compact then rebuild preserves data", async () => {
		const db = createDb();

		for (let i = 0; i < 10; i++) {
			await db.users.add({
				name: `User${i}`,
			});
		}

		expect(await db.users.find()).toHaveLength(10);
		expect(
			await db.find({
				collection: "__vcrdt__/users",
				search: {},
			}),
		).toHaveLength(10);

		await compact(db, "users");
		expect(
			await db.find({
				collection: "__vcrdt__/users",
				search: {},
			}),
		).toHaveLength(10);

		await rebuild(db, "users");
		expect(await db.users.find()).toHaveLength(10);
	});

	test("25. plugin does not log operations on crdt internal collections", async () => {
		const db = createDb();

		await db.adapter.add({
			collection: "__vcrdt__/users",
			data: {
				a: {
					name: "Direct",
				},
			},
			id_gen: true,
		});

		const log = await db.find({
			collection: "__vcrdt__/users",
			search: {},
		});
		expect(log).toHaveLength(1);
	});

	test("26. sync boolean shorthand works", async () => {
		const db1 = createDb();
		const db2 = createDb();

		await db1.users.add({
			name: "Alice",
		});

		const result = await sync(db2, db1, "users", true);
		expect(result).toMatchObject({
			copied: 1,
			changed: true,
			rebuild: true,
		});

		expect(await db2.users.find()).toHaveLength(1);
	});
});
