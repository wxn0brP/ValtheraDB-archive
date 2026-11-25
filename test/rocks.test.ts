import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "fs/promises";
import { join } from "path";
import { RocksAdapter } from "../src/index";

const TEST_DIR = join(process.cwd(), "test", ".tmp");

let counter = 0;
let dbPath = "";
let actions: RocksAdapter | null = null;

async function openDb(path = dbPath) {
	const db = new RocksAdapter(path);
	await db.init();
	return db;
}

describe("RocksValthera", () => {
	beforeEach(async () => {
		await mkdir(TEST_DIR, {
			recursive: true,
		});
		dbPath = join(TEST_DIR, `rocks-${Date.now()}-${counter++}`);
		actions = await openDb();
	});

	afterEach(async () => {
		if (actions) {
			await actions.close();
			actions = null;
		}
		await rm(dbPath, {
			recursive: true,
			force: true,
		});
	});

	test("1. manages collections", async () => {
		expect(await actions!.getCollections()).toEqual([]);
		expect(await actions!.issetCollection("users")).toBe(false);

		expect(await actions!.ensureCollection("users")).toBe(true);
		expect(await actions!.ensureCollection("users")).toBe(false);
		expect(await actions!.issetCollection("users")).toBe(true);
		expect(await actions!.getCollections()).toEqual([
			"users",
		]);

		expect(await actions!.removeCollection("users")).toBe(true);
		expect(await actions!.issetCollection("users")).toBe(false);
		expect(await actions!.getCollections()).toEqual([]);
	});

	test("2. adds and finds documents", async () => {
		const added = await actions!.add({
			collection: "users",
			data: {
				name: "Piotr",
				age: 37,
			},
		});

		const found = await actions!.find({
			collection: "users",
			search: {
				name: "Piotr",
			},
		});

		expect(typeof added._id).toBe("string");
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({
			_id: added._id,
			name: "Piotr",
			age: 37,
		});
	});

	test("3. supports id_gen=false without adding _id to data", async () => {
		const added = await actions!.add({
			collection: "logs",
			data: {
				event: "created",
			},
			id_gen: false,
		});

		const found = await actions!.findOne({
			collection: "logs",
			search: {
				event: "created",
			},
		});

		expect(added).toEqual({
			event: "created",
		});
		expect(found).toEqual({
			event: "created",
		});
	});

	test("4. updates matching documents", async () => {
		await actions!.add({
			collection: "users",
			data: {
				name: "Ala",
				age: 10,
			},
		});
		await actions!.add({
			collection: "users",
			data: {
				name: "Jan",
				age: 20,
			},
		});

		const updated = await actions!.update({
			collection: "users",
			search: {
				$gte: {
					age: 10,
				},
			},
			updater: {
				active: true,
			},
		});

		const found = await actions!.find({
			collection: "users",
			search: {
				active: true,
			},
			dbFindOpts: {
				sortBy: "age",
			},
		});

		expect(updated).toHaveLength(2);
		expect(found.map(user => user.name)).toEqual([
			"Ala",
			"Jan",
		]);
		expect(found.every(user => user.active === true)).toBe(true);
	});

	test("5. updates one document", async () => {
		await actions!.add({
			collection: "users",
			data: {
				name: "Ala",
				role: "user",
			},
		});
		await actions!.add({
			collection: "users",
			data: {
				name: "Ala",
				role: "admin",
			},
		});

		const updated = await actions!.updateOne({
			collection: "users",
			search: {
				name: "Ala",
			},
			updater: {
				role: "owner",
			},
		});

		const found = await actions!.find({
			collection: "users",
			search: {
				name: "Ala",
			},
		});

		expect(updated).toMatchObject({
			name: "Ala",
			role: "owner",
		});
		expect(found.filter(user => user.role === "owner")).toHaveLength(1);
	});

	test("6. removes matching documents", async () => {
		await actions!.add({
			collection: "users",
			data: {
				name: "Ala",
				active: true,
			},
		});
		await actions!.add({
			collection: "users",
			data: {
				name: "Jan",
				active: false,
			},
		});
		await actions!.add({
			collection: "users",
			data: {
				name: "Ewa",
				active: false,
			},
		});

		const removed = await actions!.remove({
			collection: "users",
			search: {
				active: false,
			},
		});
		const remaining = await actions!.find({
			collection: "users",
			search: {},
		});

		expect(removed.map(user => user.name).sort()).toEqual([
			"Ewa",
			"Jan",
		]);
		expect(remaining).toHaveLength(1);
		expect(remaining[0]).toMatchObject({
			name: "Ala",
			active: true,
		});
	});

	test("7. removes one document", async () => {
		await actions!.add({
			collection: "users",
			data: {
				group: "a",
				name: "Ala",
			},
		});
		await actions!.add({
			collection: "users",
			data: {
				group: "a",
				name: "Jan",
			},
		});

		const removed = await actions!.removeOne({
			collection: "users",
			search: {
				group: "a",
			},
		});
		const remaining = await actions!.find({
			collection: "users",
			search: {
				group: "a",
			},
		});

		expect(removed).toMatchObject({
			group: "a",
		});
		expect(remaining).toHaveLength(1);
	});

	test("8. applies find options and db find options", async () => {
		await actions!.add({
			collection: "items",
			data: {
				name: "A",
				value: 5,
				hidden: true,
			},
		});
		await actions!.add({
			collection: "items",
			data: {
				name: "B",
				value: 15,
				hidden: false,
			},
		});
		await actions!.add({
			collection: "items",
			data: {
				name: "C",
				value: 10,
				hidden: true,
			},
		});

		const found = await actions!.find({
			collection: "items",
			search: {
				$gte: {
					value: 5,
				},
			},
			findOpts: {
				select: [
					"name",
					"value",
				],
			},
			dbFindOpts: {
				sortBy: "value",
				sortAsc: false,
				limit: 2,
			},
		});

		expect(found).toEqual([
			{
				name: "B",
				value: 15,
			},
			{
				name: "C",
				value: 10,
			},
		]);
	});

	test("9. persists data after close and reopen", async () => {
		await actions!.add({
			collection: "users",
			data: {
				name: "Persisted",
			},
		});
		await actions!.close();
		actions = null;

		actions = await openDb();
		const found = await actions.findOne({
			collection: "users",
			search: {
				name: "Persisted",
			},
		});

		expect(found).toMatchObject({
			name: "Persisted",
		});
	});
});
