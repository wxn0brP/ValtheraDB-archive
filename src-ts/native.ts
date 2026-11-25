import { AdapterError, QueryValidationError } from "@wxn0brp/db-core/errors";
import { dlopen, FFIType } from "bun:ffi";
import { join } from "path";

const path = join(import.meta.dir, "..", "lib", "libvaltheradb.so");
const lib = dlopen(path, {
	find: {
		args: [
			FFIType.cstring,
			FFIType.cstring,
			FFIType.bool,
		],
		returns: FFIType.ptr,
	},
	find_paged: {
		args: [
			FFIType.cstring,
			FFIType.cstring,
			FFIType.int32_t,
			FFIType.int32_t,
		],
		returns: FFIType.ptr,
	},
	remove_entries: {
		args: [
			FFIType.cstring,
			FFIType.cstring,
			FFIType.bool,
		],
		returns: FFIType.ptr,
	},
	update_entries: {
		args: [
			FFIType.cstring,
			FFIType.cstring,
			FFIType.cstring,
			FFIType.bool,
		],
		returns: FFIType.ptr,
	},
	free_result: {
		args: [
			FFIType.ptr,
		],
		returns: FFIType.void,
	},
	get_result_count: {
		args: [
			FFIType.ptr,
		],
		returns: FFIType.int32_t,
	},
	get_result_item: {
		args: [
			FFIType.ptr,
			FFIType.int32_t,
		],
		returns: FFIType.cstring,
	},
	is_error: {
		args: [
			FFIType.ptr,
		],
		returns: FFIType.bool,
	},
});

const encoder = new TextEncoder();

function encode(str: string) {
	return encoder.encode(str + "\0");
}

function parseResultArray(ptr: any, findOne: boolean = false) {
	if (!ptr) throw new AdapterError("Error. Pointer is null");

	try {
		if (lib.symbols.is_error(ptr)) {
			const errorMsg = lib.symbols.get_result_item(ptr, 0) as any;
			const message = errorMsg.toString();
			const validationPrefix = "QUERY_INVALID: ";
			if (message.startsWith(validationPrefix))
				throw new QueryValidationError(message.slice(validationPrefix.length));
			throw new AdapterError(message);
		}

		const count = lib.symbols.get_result_count(ptr);
		const results = [];

		for (let i = 0; i < count; i++) {
			const itemStr = lib.symbols.get_result_item(ptr, i) as any;
			results.push(JSON.parse(itemStr.toString()));
		}

		if (findOne) {
			return results.length > 0 ? results[0] : null;
		}

		return results;
	} finally {
		lib.symbols.free_result(ptr);
	}
}

function encodeSearch(fields: unknown) {
	return JSON.stringify(fields ?? {});
}

export function find(dir: string, fields: unknown, findOne = false) {
	const json = encodeSearch(fields);
	const ptr = lib.symbols.find(encode(dir), encode(json), findOne);
	return parseResultArray(ptr, findOne);
}

export function findPaged(
	dir: string,
	fields: unknown,
	offset: number,
	limit: number,
) {
	const json = encodeSearch(fields);
	const ptr = lib.symbols.find_paged(
		encode(dir),
		encode(json),
		offset,
		limit === Infinity ? -1 : limit,
	);
	return parseResultArray(ptr, false);
}

export function remove(dir: string, fields: unknown, one = false) {
	const json = encodeSearch(fields);
	const ptr = lib.symbols.remove_entries(encode(dir), encode(json), one);
	return parseResultArray(ptr, false);
}

export function update(
	dir: string,
	fields: unknown,
	updater: unknown,
	one = false,
) {
	const fieldsJson = encodeSearch(fields);
	const updaterJson = JSON.stringify(updater ?? {});
	const ptr = lib.symbols.update_entries(
		encode(dir),
		encode(fieldsJson),
		encode(updaterJson),
		one,
	);
	return parseResultArray(ptr, false);
}
