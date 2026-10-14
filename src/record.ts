import { FLAG_ALIVE, FLAG_DELETED } from "./const";
import { AnyRecord } from "./types";

export function encodeVarint(value: number) {
	const bytes: number[] = [];
	while (value > 0x7f) {
		bytes.push((value & 0x7f) | 0x80);
		value >>>= 7;
	}
	bytes.push(value & 0x7f);
	return bytes;
}

export function decodeVarint(buf: Buffer, offset: number) {
	let value = 0;
	let shift = 0;
	let bytesRead = 0;
	let byte: number;

	do {
		if (offset + bytesRead >= buf.length) {
			throw new Error("Varint extends beyond buffer");
		}
		byte = buf[offset + bytesRead];
		value |= (byte & 0x7f) << shift;
		shift += 7;
		bytesRead++;
	} while (byte & 0x80);

	return {
		value,
		bytesRead,
	};
}

export function encodeDataRecord(_id: string, l: string) {
	const idBytes = Buffer.from(_id, "utf8");
	const lBytes = Buffer.from(l, "utf8");
	const idLenEnc = encodeVarint(idBytes.length);
	const lLenEnc = encodeVarint(lBytes.length);

	const size =
		1 + idLenEnc.length + idBytes.length + lLenEnc.length + lBytes.length;
	const buf = Buffer.allocUnsafe(size);
	let offset = 0;

	buf[offset++] = FLAG_ALIVE;
	for (const b of idLenEnc) buf[offset++] = b;
	idBytes.copy(buf, offset);
	offset += idBytes.length;
	for (const b of lLenEnc) buf[offset++] = b;
	lBytes.copy(buf, offset);

	return buf;
}

export function encodeTombstone(_id: string) {
	const idBytes = Buffer.from(_id, "utf8");
	const idLenEnc = encodeVarint(idBytes.length);

	const size = 1 + idLenEnc.length + idBytes.length;
	const buf = Buffer.allocUnsafe(size);
	let offset = 0;

	buf[offset++] = FLAG_DELETED;
	for (const b of idLenEnc) buf[offset++] = b;
	idBytes.copy(buf, offset);

	return buf;
}

export function decodeRecord(
	buf: Buffer,
	offset: number,
): {
	record: AnyRecord;
	bytesRead: number;
} {
	const startOffset = offset;
	const flag = buf[offset++];

	const { value: idLen, bytesRead: idLenBytes } = decodeVarint(buf, offset);
	offset += idLenBytes;
	const _id = buf.subarray(offset, offset + idLen).toString("utf8");
	offset += idLen;

	if (flag === FLAG_ALIVE) {
		const { value: lLen, bytesRead: lLenBytes } = decodeVarint(buf, offset);
		offset += lLenBytes;
		const l = buf.subarray(offset, offset + lLen).toString("utf8");
		offset += lLen;
		return {
			record: {
				flag,
				_id,
				l,
			},
			bytesRead: offset - startOffset,
		};
	}

	return {
		record: {
			flag: FLAG_DELETED,
			_id,
		},
		bytesRead: offset - startOffset,
	};
}
