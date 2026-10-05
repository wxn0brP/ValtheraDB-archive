export function varintSize(value: number) {
	if (value < 0) throw new Error("varint: negative value not supported");
	if (value < 0x80) return 1;
	if (value < 0x4000) return 2;
	if (value < 0x200000) return 3;
	if (value < 0x10000000) return 4;
	if (value < 0x800000000) return 5;
	if (value < 0x40000000000) return 6;
	if (value < 0x2000000000000) return 7;
	if (value < 0x100000000000000n) return 8;
	if (value < 0x8000000000000000n) return 9;
	return 10;
}

export function writeVarint(value: number, buf: Uint8Array, offset: number) {
	if (value < 0) throw new Error("varint: negative value not supported");
	while (value >= 0x80) {
		buf[offset++] = (value & 0x7f) | 0x80;
		value = Math.floor(value / 0x80);
	}
	buf[offset++] = value;
	return offset;
}

export function readVarint(
	buf: Uint8Array,
	offset: number,
): {
	value: number;
	size: number;
} {
	let value = 0;
	let multiplier = 1;
	let size = 0;
	while (true) {
		const b = buf[offset++];
		size++;
		value += (b & 0x7f) * multiplier;
		if ((b & 0x80) === 0) break;
		multiplier *= 0x80;
		if (size > 10) throw new Error("varint: too long");
	}
	return {
		value,
		size,
	};
}

export function varintByteSize(buf: Uint8Array, offset: number) {
	let size = 0;
	do {
		size++;
	} while (buf[offset++] & 0x80);
	return size;
}
