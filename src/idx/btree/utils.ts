export function decodeKey(key: { type: number; data: Buffer }) {
	if (key.type === 1) return key.data.readDoubleLE(0);
	if (key.type === 2) return key.data[0] === 1;
	if (key.type === 3) return new Date(key.data.readDoubleLE(0));
	if (key.type === 4) return null;
	return key.data.toString("utf-8");
}

export function cloneKey(key: { type: number; data: Buffer }) {
	return {
		type: key.type,
		data: Buffer.from(key.data),
	};
}
