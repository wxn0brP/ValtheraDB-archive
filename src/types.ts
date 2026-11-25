import type { VQuery } from "@wxn0brp/db-core/types/query";

export type CrdtOp =
	| "add"
	| "bulkAdd"
	| "update"
	| "updateOne"
	| "updateOneOrAdd"
	| "remove"
	| "removeOne"
	| "toggleOne";

export const CRDT_OPS: ReadonlySet<string> = new Set<string>([
	"add",
	"bulkAdd",
	"update",
	"updateOne",
	"updateOneOrAdd",
	"remove",
	"removeOne",
	"toggleOne",
]);

export interface CrdtAddEntry<T = any> {
	a: T;
}

export interface CrdtBulkAddEntry<T = any> {
	aa: T[];
}

export interface CrdtMutationEntry {
	d: Omit<VQuery, "control" | "transaction">;
	op: CrdtOp;
}

export interface CrdtCompactEntry<T = any> {
	p: T;
}

export type CrdtLogEntry<T = any> =
	| CrdtAddEntry<T>
	| CrdtBulkAddEntry<T>
	| CrdtMutationEntry
	| CrdtCompactEntry<T>;

export interface SyncOpts {
	rebuild?: boolean;
}

export interface SyncResult {
	collection: string;
	copied: number;
	changed: boolean;
	rebuild: boolean;
}

export interface CollectionsSyncResult {
	collections: SyncResult[];
	copied: number;
	changed: boolean;
	rebuild: boolean;
}

export interface CrdtPluginOpts {
	prefix?: string;
	exclude?: string[];
}
