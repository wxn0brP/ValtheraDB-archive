#!/usr/bin/env bun

import { dispatchFrame } from "./daemon/dispatch";
import { toErrorPayload } from "./daemon/errors";
import { DbRegistry } from "./daemon/registry";
import { encodeJsonFrame, FrameReader } from "./protocol/framing";
import { OutboundFrameType } from "./protocol/types";
import { conduitInfo } from "./versions";

const registry = new DbRegistry();
const reader = new FrameReader();
let shuttingDown = false;

function writeFrame(type: OutboundFrameType, dbName: string, payload: unknown) {
	process.stdout.write(encodeJsonFrame(type, dbName, payload));
}

writeFrame(OutboundFrameType.Ready, "", {
	ok: true,
	result: conduitInfo,
});

process.stdin.on("data", (chunk: Buffer) => {
	void handleChunk(chunk);
});

process.stdin.on("end", () => {
	void shutdown(0);
});

process.on("SIGINT", () => {
	void shutdown(130);
});

process.on("SIGTERM", () => {
	void shutdown(143);
});

async function handleChunk(chunk: Buffer) {
	if (shuttingDown) return;

	let frames;
	try {
		frames = reader.push(chunk);
	} catch (error) {
		writeFrame(OutboundFrameType.Error, "", toErrorPayload(error));
		await shutdown(1);
		return;
	}

	for (const frame of frames) {
		void handleFrame(frame);
	}
}

async function handleFrame(frame: Parameters<typeof dispatchFrame>[1]) {
	try {
		const response = await dispatchFrame(registry, frame);
		writeFrame(response.type, frame.dbName, response.payload);
		if (response.shutdown) await shutdown(0);
	} catch (error) {
		writeFrame(OutboundFrameType.Error, frame.dbName, toErrorPayload(error));
	}
}

async function shutdown(code: number) {
	if (shuttingDown) return;
	shuttingDown = true;
	try {
		await registry.closeAll();
	} catch (error) {
		console.error(error);
	} finally {
		process.exit(code);
	}
}
