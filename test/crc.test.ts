import { describe, expect, it } from "bun:test";
import { crc32 } from "../src/bin/crc";

describe("crc32", () => {
	it("computes known value for empty input", () => {
		expect(crc32(Buffer.alloc(0))).toBe(0);
	});

	it("computes known value for '123456789'", () => {
		expect(crc32(Buffer.from("123456789", "utf8"))).toBe(0xcbf43926);
	});

	it("changes with content", () => {
		const a = crc32(Buffer.from("foo"));
		const b = crc32(Buffer.from("bar"));
		expect(a).not.toBe(b);
	});
});
