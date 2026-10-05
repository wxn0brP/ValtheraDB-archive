export const MAGIC = 0x56444242; // "VDBB"

export const HEADER_SIZE = 128;
export const COLLECTION_HEADER_SIZE = 64;
export const INDEX_ENTRY_SIZE = 64;

export const VERSION = 4;

export const FILE_FLAG = {
	CRC: 1 << 0,
	COMPRESSED: 1 << 1,
} as const;

export const COLLECTION_FLAG = {
	INDEXED: 1 << 0,
	CRC: 1 << 1,
	COMPRESSED: 1 << 2,
} as const;

export const FREE_BUCKET = {
	SMALL_MAX: 256,
	MEDIUM_MAX: 4096,
	SMALL: 0,
	MEDIUM: 1,
	LARGE: 2,
	COUNT: 3,
} as const;

export const VARINT = {
	MAX_1: 0x80,
	MAX_2: 0x4000,
	MAX_3: 0x200000,
	MAX_4: 0x10000000,
	MAX_LEN: 5,
} as const;

export const COMPACTION_DEAD_RATIO = 0.25;
