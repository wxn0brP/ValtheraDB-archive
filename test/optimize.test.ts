import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rm } from "fs/promises";
import { join } from "path";
import { BinAdapter } from "../src/adapter";

const TEST_FILE = join(process.cwd(), "test_temp_opt.val");

describe("optimize", () => {
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

	it("reclaims space after bulk deletes", async () => {
		for (let i = 0; i < 50; i++) {
			await mgr.add({
				collection: "t",
				data: {
					x: i,
					big: "x".repeat(200),
				},
			});
		}
		const before = (await mgr.manager.fd!.stat()).size;
		for (let i = 0; i < 40; i++) {
			await mgr.remove({
				collection: "t",
				search: {
					x: i,
				},
			});
		}
		await mgr.optimize();
		const after = (await mgr.manager.fd!.stat()).size;
		expect(after).toBeLessThan(before);
		const remaining = await mgr.find({
			collection: "t",
			search: {},
		});
		expect(remaining.length).toBe(10);
	});
});
