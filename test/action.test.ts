import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rm } from "fs/promises";
import { join } from "path";
import { BinAdapter } from "../src/adapter";

const TEST_FILE = join(process.cwd(), "test_temp_bin_actions.val");

describe("BinAdapter", () => {
	let mgr: BinAdapter;

	beforeEach(async () => {
		await rm(TEST_FILE, {
			force: true,
		});
		mgr = new BinAdapter(TEST_FILE, {
			preferredSize: 256,
		});
		await mgr.init();
	});

	afterEach(async () => {
		await mgr.close();
		await rm(TEST_FILE, {
			force: true,
		});
	});

	it("init creates a new file", async () => {
		const stats = await mgr.manager.fd!.stat();
		expect(stats.size).toBeGreaterThan(0);
	});

	it("getCollections returns empty for new file", async () => {
		expect(await mgr.getCollections()).toEqual([]);
	});

	it("ensureCollection creates a new collection", async () => {
		expect(await mgr.ensureCollection("users")).toBe(true);
		expect(await mgr.issetCollection("users")).toBe(true);
	});

	it("ensureCollection returns false when exists", async () => {
		await mgr.ensureCollection("users");
		expect(await mgr.ensureCollection("users")).toBe(false);
	});

	describe("crud", () => {
		beforeEach(async () => {
			await mgr.add({
				collection: "test",
				data: {
					name: "a",
					val: 1,
				},
			});
			await mgr.add({
				collection: "test",
				data: {
					name: "b",
					val: 2,
				},
			});
			await mgr.add({
				collection: "test",
				data: {
					name: "c",
					val: 3,
				},
			});
		});

		it("add assigns an id", async () => {
			const r = await mgr.add({
				collection: "test",
				data: {
					name: "d",
				},
			});
			expect((r as any)._id).toBeTruthy();
		});

		it("find returns matching", async () => {
			const r = await mgr.find({
				collection: "test",
				search: {
					name: "a",
				},
			});
			expect(r.length).toBe(1);
			expect((r[0] as any).val).toBe(1);
		});

		it("find returns all when no search", async () => {
			const r = await mgr.find({
				collection: "test",
				search: {},
			});
			expect(r.length).toBe(3);
		});

		it("findOne returns first match", async () => {
			const r = await mgr.findOne({
				collection: "test",
				search: {
					name: "b",
				},
			});
			expect((r as any).val).toBe(2);
		});

		it("findOne returns null for no match", async () => {
			const r = await mgr.findOne({
				collection: "test",
				search: {
					name: "x",
				},
			});
			expect(r).toBeNull();
		});

		it("update modifies records", async () => {
			const r = await mgr.update({
				collection: "test",
				search: {
					name: "a",
				},
				updater: {
					val: 99,
				},
			});
			expect(r.length).toBe(1);
			expect((r[0] as any).val).toBe(99);
			const cur = await mgr.findOne({
				collection: "test",
				search: {
					name: "a",
				},
			});
			expect((cur as any).val).toBe(99);
		});

		it("updateOne updates a single record", async () => {
			const r = await mgr.updateOne({
				collection: "test",
				search: {},
				updater: {
					tagged: true,
				},
			});
			expect(r).not.toBeNull();
			expect((r as any).tagged).toBe(true);
		});

		it("remove deletes records", async () => {
			const r = await mgr.remove({
				collection: "test",
				search: {
					name: "a",
				},
			});
			expect(r.length).toBe(1);
			expect(
				await mgr.findOne({
					collection: "test",
					search: {
						name: "a",
					},
				}),
			).toBeNull();
		});

		it("removeOne deletes a single record", async () => {
			const r = await mgr.removeOne({
				collection: "test",
				search: {},
			});
			expect(r).not.toBeNull();
			const all = await mgr.find({
				collection: "test",
				search: {},
			});
			expect(all.length).toBe(2);
		});

		it("respects dbFindOpts limit and offset", async () => {
			const r = await mgr.find({
				collection: "test",
				search: {},
				dbFindOpts: {
					limit: 2,
				},
			});
			expect(r.length).toBe(2);
		});
	});

	it("supports multiple collections", async () => {
		await mgr.add({
			collection: "a",
			data: {
				x: 1,
			},
		});
		await mgr.add({
			collection: "b",
			data: {
				y: 2,
			},
		});
		expect(
			(
				await mgr.find({
					collection: "a",
					search: {},
				})
			).length,
		).toBe(1);
		expect(
			(
				await mgr.find({
					collection: "b",
					search: {},
				})
			).length,
		).toBe(1);
	});

	it("removeCollection removes the collection", async () => {
		await mgr.add({
			collection: "temp",
			data: {
				x: 1,
			},
		});
		await mgr.removeCollection("temp");
		expect(await mgr.issetCollection("temp")).toBe(false);
	});
});

describe("BinAdapter persistence", () => {
	const FILE = join(process.cwd(), "test_temp_persist.val");

	afterEach(async () => {
		await rm(FILE, {
			force: true,
		});
	});

	it("persists data across open/close", async () => {
		let mgr = new BinAdapter(FILE, {
			preferredSize: 256,
		});
		await mgr.init();
		await mgr.add({
			collection: "t",
			data: {
				x: 1,
			},
		});
		await mgr.add({
			collection: "t",
			data: {
				x: 2,
			},
		});
		await mgr.close();

		mgr = new BinAdapter(FILE, {
			preferredSize: 256,
		});
		await mgr.init();
		const r = await mgr.find({
			collection: "t",
			search: {},
		});
		expect(r.length).toBe(2);
		await mgr.close();
	});
});
