export const PROTOCOL_VERSION = 1;
export const HEADER_SIZE = 12;
export const MAX_PAYLOAD_LENGTH = 64 * 1024 * 1024;
export const MAX_DB_NAME_LENGTH = 4096;

export enum InboundFrameType {
	InitDb = 1,
	ExecuteJson = 2,
	CloseDb = 3,
	ListDbs = 4,
	Ping = 5,
	Shutdown = 6,
}

export enum OutboundFrameType {
	Ready = 100,
	Result = 101,
	Error = 102,
	Event = 103,
	Pong = 104,
}

export interface Frame {
	type: number;
	dbName: string;
	payload: Buffer<ArrayBufferLike>;
}

export interface InitDbPayload {
	dir: string;
	opts?: Record<string, any>;
}

export interface ExecuteJsonPayload {
	op: string;
	body?: any;
}

export interface CloseDbPayload {
	reason?: string;
}

export interface ResultPayload {
	ok: true;
	result: any;
}

export interface ErrorPayload {
	ok: false;
	code: string;
	message: string;
	details?: any;
}
