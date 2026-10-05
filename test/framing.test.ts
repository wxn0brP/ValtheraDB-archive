import { describe, expect, test } from "bun:test";
import {
	decodeJsonPayload,
	encodeJsonFrame,
	FrameReader,
} from "../src/protocol/framing";

describe("framing", () => {
	test("decodes complete JSON frames", () => {
		const reader = new FrameReader();
		const frames = reader.push(
			encodeJsonFrame(1, "data", {
				ok: true,
			}),
		);

		expect(frames).toHaveLength(1);
		expect(frames[0].type).toBe(1);
		expect(frames[0].dbName).toBe("data");
		expect(decodeJsonPayload(frames[0])).toEqual({
			ok: true,
		});
	});

	test("waits for partial payloads", () => {
		const reader = new FrameReader();
		const encoded = encodeJsonFrame(2, "main", {
			value: "abc",
		});

		expect(reader.push(encoded.subarray(0, 10))).toHaveLength(0);
		const frames = reader.push(encoded.subarray(10));

		expect(frames).toHaveLength(1);
		expect(frames[0].dbName).toBe("main");
		expect(decodeJsonPayload(frames[0])).toEqual({
			value: "abc",
		});
	});
});
