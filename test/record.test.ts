import { describe, expect, it } from "bun:test";
import { decodeRecord, encodeRecord, RECORD_FLAG } from "../src/bin/record";

describe("record", () => {
	it("roundtrips a simple record", () => {
		const data = Buffer.from("hello world");
		const enc = encodeRecord(data);
		const dec = decodeRecord(enc, 0);
		expect(dec).not.toBeNull();
		expect(dec!.data.toString()).toBe("hello world");
		expect(dec!.flags & RECORD_FLAG.DELETED).toBe(0);
	});

	it("roundtrips an empty record", () => {
		const enc = encodeRecord(Buffer.alloc(0));
		const dec = decodeRecord(enc, 0);
		expect(dec).not.toBeNull();
		expect(dec!.data.length).toBe(0);
	});

	it("roundtrips a large record with varint", () => {
		const data = Buffer.alloc(2000, 0x42);
		const enc = encodeRecord(data);
		const dec = decodeRecord(enc, 0);
		expect(dec!.data.length).toBe(2000);
		expect(dec!.data.equals(data)).toBe(true);
	});

	it("roundtrips with CRC", () => {
		const data = Buffer.from("crc test");
		const enc = encodeRecord(data, {
			crc: true,
		});
		const dec = decodeRecord(enc, 0);
		expect(dec!.flags & RECORD_FLAG.CRC).not.toBe(0);
		expect(dec!.data.toString()).toBe("crc test");
	});

	it("detects CRC mismatch", () => {
		const data = Buffer.from("crc test");
		const enc = encodeRecord(data, {
			crc: true,
		});
		enc[enc.length - 1] ^= 0xff;
		expect(() => decodeRecord(enc, 0)).toThrow(/CRC/);
	});

	it("handles deleted flag", () => {
		const enc = Buffer.alloc(2);
		enc[0] = RECORD_FLAG.DELETED;
		enc[1] = 0;
		const dec = decodeRecord(enc, 0);
		expect(dec!.flags & RECORD_FLAG.DELETED).not.toBe(0);
	});
});
