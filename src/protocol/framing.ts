import {
	HEADER_SIZE,
	MAX_DB_NAME_LENGTH,
	MAX_PAYLOAD_LENGTH,
	Frame,
} from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeJsonFrame(
	type: number,
	dbName: string,
	payload: unknown,
): Buffer {
	return encodeFrame(
		type,
		dbName,
		Buffer.from(encoder.encode(JSON.stringify(payload ?? {}))),
	);
}

export function encodeFrame(
	type: number,
	dbName: string,
	payload: Buffer<ArrayBufferLike>,
): Buffer {
	if (!Number.isInteger(type) || type < 0)
		throw new Error("frame type must be an unsigned integer");
	const dbNamePayload = Buffer.from(encoder.encode(dbName || ""));
	if (dbNamePayload.length > MAX_DB_NAME_LENGTH)
		throw new Error("db name is too large");
	if (payload.length > MAX_PAYLOAD_LENGTH)
		throw new Error("payload is too large");

	const header = Buffer.allocUnsafe(HEADER_SIZE);
	header.writeUInt32LE(type, 0);
	header.writeUInt32LE(dbNamePayload.length, 4);
	header.writeUInt32LE(payload.length, 8);
	return Buffer.concat([
		header,
		dbNamePayload,
		payload,
	]);
}

export function decodeJsonPayload<T = any>(frame: Frame): T {
	if (frame.payload.length === 0) return {} as T;
	return JSON.parse(decoder.decode(frame.payload)) as T;
}

export class FrameReader {
	_buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);

	push(chunk: Buffer<ArrayBufferLike>): Frame[] {
		this._buffer =
			this._buffer.length === 0
				? chunk
				: Buffer.concat([
						this._buffer,
						chunk,
					]);
		const frames: Frame[] = [];

		while (this._buffer.length >= HEADER_SIZE) {
			const type = this._buffer.readUInt32LE(0);
			const dbNameLength = this._buffer.readUInt32LE(4);
			const payloadLength = this._buffer.readUInt32LE(8);

			if (dbNameLength > MAX_DB_NAME_LENGTH) {
				throw new Error(
					`db name length ${dbNameLength} exceeds limit ${MAX_DB_NAME_LENGTH}`,
				);
			}
			if (payloadLength > MAX_PAYLOAD_LENGTH) {
				throw new Error(
					`payload length ${payloadLength} exceeds limit ${MAX_PAYLOAD_LENGTH}`,
				);
			}

			const frameLength = HEADER_SIZE + dbNameLength + payloadLength;
			if (this._buffer.length < frameLength) break;

			const dbNameEnd = HEADER_SIZE + dbNameLength;
			frames.push({
				type,
				dbName: decoder.decode(this._buffer.subarray(HEADER_SIZE, dbNameEnd)),
				payload: this._buffer.subarray(dbNameEnd, frameLength),
			});
			this._buffer = this._buffer.subarray(frameLength);
		}

		return frames;
	}
}
