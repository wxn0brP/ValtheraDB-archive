import { describe, expect, it } from "bun:test";
import { allocSlot, addFreeSlot, newSpace } from "../src/bin/space";
import { newHeader } from "../src/bin/header";

describe("space", () => {
	it("allocates from tail when free list is empty", () => {
		const header = newHeader(64, 2);
		const space = newSpace(header);
		const slot = allocSlot(space, 100);
		expect(slot.offset).toBe(128);
		expect(header.fileSize).toBe(228);
	});

	it("reuses a free slot when it fits", () => {
		const header = newHeader(64, 2);
		const space = newSpace(header);
		addFreeSlot(space, {
			offset: 1024,
			size: 200,
		});
		const slot = allocSlot(space, 100);
		expect(slot.offset).toBe(1024);
	});

	it("splits a free slot when too large", () => {
		const header = newHeader(64, 2);
		const space = newSpace(header);
		addFreeSlot(space, {
			offset: 1000,
			size: 500,
		});
		const slot = allocSlot(space, 100);
		expect(slot.offset).toBe(1000);
		expect(header.fileSize).toBe(128);
	});

	it("promotes slot to correct bucket on insert", () => {
		const header = newHeader(64, 2);
		const space = newSpace(header);
		addFreeSlot(space, {
			offset: 100,
			size: 5000,
		});
		expect(space.freeLists[2].some(s => s.offset === 100)).toBe(true);
	});

	it("coalesces adjacent slots", () => {
		const header = newHeader(64, 2);
		const space = newSpace(header);
		addFreeSlot(space, {
			offset: 100,
			size: 50,
		});
		addFreeSlot(space, {
			offset: 150,
			size: 50,
		});
		const merged = space.freeLists.find(list =>
			list.some(s => s.offset === 100 && s.size === 100),
		);
		expect(merged).toBeDefined();
	});
});
