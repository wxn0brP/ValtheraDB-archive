import { forgeTypedValthera, ValtheraClass } from "@wxn0brp/db-core";
import { Data } from "@wxn0brp/db-core/types/data";
import type { TypedValthera } from "@wxn0brp/db-core/types/typed";
import { createFileAdapter } from "@wxn0brp/db-storage-dir";
import { createIndexDirAdapter, type IndexDirActions } from "./adapter";
import type {
	DirIndexOpts,
	IndexConfig,
	ValtheraIndexDirInterface,
} from "./types";

const DEFAULT_MAX_FILE_SIZE = 256 * 1024;

export function createDirIndex<T extends Record<string, Data>>(
	folder: string,
	indexConfig: IndexConfig = {},
	opts: DirIndexOpts = {},
): TypedValthera<T, ValtheraClass & ValtheraIndexDirInterface> {
	const adapter = createDirIndexAdapter(folder, indexConfig, opts);
	const db = new ValtheraClass({
		adapter,
	});

	return forgeTypedValthera(db) as any;
}

export function createDirIndexAdapter(
	folder: string,
	indexConfig: IndexConfig = {},
	opts: DirIndexOpts = {},
): IndexDirActions {
	const dirAdapter = createFileAdapter(folder, {
		maxFileSize: DEFAULT_MAX_FILE_SIZE,
		...opts,
	});
	return createIndexDirAdapter(dirAdapter, indexConfig);
}

export const DYNAMIC = {
	def: (
		dir: string,
		indexConfig: IndexConfig = {},
		dirConfig: DirIndexOpts = {},
	) => createDirIndexAdapter(dir, indexConfig, dirConfig),
};
