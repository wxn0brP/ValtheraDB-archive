import { describe, expect, it } from "bun:test";
import {
	insert,
	lookup,
	newIndex,
	remove,
	serialize,
	deserialize,
	update,
} from "../src/bin/idindex";

describe("idindex", () => {
	it("inserts and looks up", () => {
		const idx = newIndex();
		insert(idx, "a", 100);
		insert(idx, "b", 200);
		expect(lookup(idx, "a")).toBe(100);
		expect(lookup(idx, "b")).toBe(200);
		expect(lookup(idx, "c")).toBe(null);
	});

	it("removes an entry", () => {
		const idx = newIndex();
		insert(idx, "a", 100);
		expect(remove(idx, "a")).toBe(true);
		expect(lookup(idx, "a")).toBe(null);
		expect(remove(idx, "a")).toBe(false);
	});

	it("updates an entry", () => {
		const idx = newIndex();
		insert(idx, "a", 100);
		update(idx, "a", 200);
		expect(lookup(idx, "a")).toBe(200);
	});

	it("serializes and deserializes", () => {
		const idx = newIndex();
		insert(idx, "abc", 100);
		insert(idx, "xyz", 200);
		const buf = serialize(idx);
		const restored = deserialize(buf);
		expect(lookup(restored, "abc")).toBe(100);
		expect(lookup(restored, "xyz")).toBe(200);
	});
});
