import { crc32 } from "./crc";
import { VARINT } from "./static";

export type RecordFlags = number;

export const RECORD_FLAG = {
	DELETED: 1 << 0,
	CRC: 1 << 1,
	COMPRESSED: 1 << 2,
} as const;

export interface DecodedRecord {
	data: Buffer;
	flags: number;
	totalSize: number;
}

export function encodeRecord(
	data: Buffer,
	opts: {
		crc?: boolean;
		compressed?: boolean;
	} = {},
): Buffer {
	const flag =
		(opts.crc ? RECORD_FLAG.CRC : 0) |
		(opts.compressed ? RECORD_FLAG.COMPRESSED : 0);
	const lenSize = varintSizeForLen(data.length);
	const totalSize = 1 + lenSize + data.length + (opts.crc ? 4 : 0);
	const out = Buffer.alloc(totalSize);

	out[0] = flag;
	writeLenVarint(out, 1, data.length);
	data.copy(out, 1 + lenSize);

	if (opts.crc) {
		const crc = crc32(out.subarray(0, 1 + lenSize + data.length));
		out.writeUInt32LE(crc, 1 + lenSize + data.length);
	}

	return out;
}

export function decodeRecord(
	buf: Uint8Array,
	offset: number,
): DecodedRecord | null {
	const start = offset;
	if (offset >= buf.length) return null;

	const flags = buf[offset++];
	if (flags & RECORD_FLAG.DELETED) {
		const lenInfo = readLenVarint(buf, offset);
		return {
			data: Buffer.alloc(0),
			flags,
			totalSize:
				offset -
				start +
				lenInfo.size +
				lenInfo.value +
				(flags & RECORD_FLAG.CRC ? 4 : 0),
		};
	}

	const lenInfo = readLenVarint(buf, offset);
	offset += lenInfo.size;

	const dataStart = offset;
	const dataEnd = dataStart + lenInfo.value;
	let after = dataEnd;

	if (flags & RECORD_FLAG.CRC) {
		const storedCrc = Buffer.from(buf).readUInt32LE(dataEnd);
		const computedCrc = crc32(Buffer.from(buf.subarray(start, dataEnd)));
		if (storedCrc !== computedCrc) {
			throw new Error(
				`record CRC mismatch: stored ${storedCrc.toString(16)} != computed ${computedCrc.toString(16)}`,
			);
		}
		after += 4;
	}

	return {
		data: Buffer.from(buf.subarray(dataStart, dataEnd)),
		flags,
		totalSize: after - start,
	};
}

export function recordSize(
	data: Buffer,
	opts: {
		crc?: boolean;
	} = {},
) {
	return 1 + varintSizeForLen(data.length) + data.length + (opts.crc ? 4 : 0);
}

export function varintSizeForLen(value: number) {
	if (value < VARINT.MAX_1) return 1;
	if (value < VARINT.MAX_2) return 2;
	if (value < VARINT.MAX_3) return 3;
	if (value < VARINT.MAX_4) return 4;
	return 5;
}

export function writeLenVarint(buf: Uint8Array, offset: number, value: number) {
	if (value < VARINT.MAX_1) {
		buf[offset] = value;
		return 1;
	}
	if (value < VARINT.MAX_2) {
		buf[offset] = (value & 0x7f) | 0x80;
		buf[offset + 1] = Math.floor(value / 0x80);
		return 2;
	}
	if (value < VARINT.MAX_3) {
		buf[offset] = (value & 0x7f) | 0x80;
		buf[offset + 1] = (Math.floor(value / 0x80) & 0x7f) | 0x80;
		buf[offset + 2] = Math.floor(value / 0x4000);
		return 3;
	}
	if (value < VARINT.MAX_4) {
		buf[offset] = (value & 0x7f) | 0x80;
		buf[offset + 1] = (Math.floor(value / 0x80) & 0x7f) | 0x80;
		buf[offset + 2] = (Math.floor(value / 0x4000) & 0x7f) | 0x80;
		buf[offset + 3] = Math.floor(value / 0x200000);
		return 4;
	}
	buf[offset] = (value & 0x7f) | 0x80;
	buf[offset + 1] = (Math.floor(value / 0x80) & 0x7f) | 0x80;
	buf[offset + 2] = (Math.floor(value / 0x4000) & 0x7f) | 0x80;
	buf[offset + 3] = (Math.floor(value / 0x200000) & 0x7f) | 0x80;
	buf[offset + 4] = Math.floor(value / 0x10000000);
	return 5;
}

export function readLenVarint(
	buf: Uint8Array,
	offset: number,
): {
	value: number;
	size: number;
} {
	let value = buf[offset] & 0x7f;
	let size = 1;
	if ((buf[offset] & 0x80) === 0)
		return {
			value,
			size,
		};
	value += (buf[offset + 1] & 0x7f) * 0x80;
	size = 2;
	if ((buf[offset + 1] & 0x80) === 0)
		return {
			value,
			size,
		};
	value += (buf[offset + 2] & 0x7f) * 0x4000;
	size = 3;
	if ((buf[offset + 2] & 0x80) === 0)
		return {
			value,
			size,
		};
	value += (buf[offset + 3] & 0x7f) * 0x200000;
	size = 4;
	if ((buf[offset + 3] & 0x80) === 0)
		return {
			value,
			size,
		};
	value += buf[offset + 4] * 0x10000000;
	size = 5;
	return {
		value,
		size,
	};
}
