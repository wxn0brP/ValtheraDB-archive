import { IndexOpts } from "@wxn0brp/db-core/types/indexes";
import { DbDirOpts } from "@wxn0brp/db-storage-dir/types";

export type IndexConfig = Record<string, string[]>;

export interface DirIndexOpts extends DbDirOpts {
	maxFileSize?: number;
}

export interface ValtheraIndexDirInterface {
	createIndex(
		collection: string,
		fields: string[],
		opts?: IndexOpts,
	): Promise<void>;
}

declare module "@wxn0brp/db-core/types/query" {
	export interface VQuery_Control {
		_dirIndex_files?: string[];
	}
}
