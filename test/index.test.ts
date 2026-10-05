import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rm } from "fs/promises";
import { join } from "path";
import { BinAdapter } from "../src/adapter";

const TEST_FILE = join(process.cwd(), "test_temp_index.val");

describe("_id index", () => {
	let mgr: BinAdapter;

	beforeEach(async () => {
		await rm(TEST_FILE, {
			force: true,
		});
		mgr = new BinAdapter(TEST_FILE, {
			preferredSize: 256,
			defaultIndexed: true,
		});
		await mgr.init();
	});

	afterEach(async () => {
		await mgr.close();
		await rm(TEST_FILE, {
			force: true,
		});
	});

	it("findOne by _id uses the index", async () => {
		await mgr.add({
			collection: "t",
			data: {
				_id: "x1",
				v: 1,
			},
		});
		await mgr.add({
			collection: "t",
			data: {
				_id: "x2",
				v: 2,
			},
		});
		const r = await mgr.findOne({
			collection: "t",
			search: {
				_id: "x2",
			},
		});
		expect((r as any).v).toBe(2);
	});

	it("find by _id uses the index", async () => {
		await mgr.add({
			collection: "t",
			data: {
				_id: "x1",
				v: 1,
			},
		});
		await mgr.add({
			collection: "t",
			data: {
				_id: "x2",
				v: 2,
			},
		});
		const r = await mgr.find({
			collection: "t",
			search: {
				_id: "x1",
			},
		});
		expect(r.length).toBe(1);
		expect((r[0] as any).v).toBe(1);
	});
});
