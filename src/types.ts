import { FLAG_DELETED } from "./const";

export interface LogRecord {
	flag: number;
	_id: string;
	l: string;
}

export interface TombstoneRecord {
	flag: typeof FLAG_DELETED;
	_id: string;
}

export type AnyRecord = LogRecord | TombstoneRecord;
