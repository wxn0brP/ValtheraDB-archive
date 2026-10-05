import * as msgpack from "@msgpack/msgpack";

export interface FormatCodec {
	encode(data: any, collection: string): Promise<Buffer>;
	decode(data: Buffer, collection: string): Promise<any>;
}

export function defaultFormat(): FormatCodec {
	return {
		encode: async (data: any) => Buffer.from(msgpack.encode(data)),
		decode: async (data: Buffer) => msgpack.decode(data),
	};
}
