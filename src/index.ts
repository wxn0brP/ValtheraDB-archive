import type { ValtheraClass } from "@wxn0brp/db-core";
import { ValtheraPlugin } from "@wxn0brp/db-core/types/plugin";
import { getOpKind } from "@wxn0brp/db-core/utils/opKind";
import { rebuild } from "./rebuild";
import { encodeCrdt } from "./serialize";
import { compact } from "./snapshot";
import { collectionPrefix } from "./static";
import { sync } from "./sync";
import {
	CollectionsSyncResult,
	CrdtLogEntry,
	CrdtMutationEntry,
	CrdtOp,
	CrdtPluginOpts,
	SyncOpts,
} from "./types";

export * from "./types";
export { compact, rebuild, sync };

const TRACKED_KINDS = new Set([
	"write",
	"delete",
]);

function stripVolatile(query: Record<string, any>) {
	const rest = {
		...query,
	};
	delete rest.control;
	delete rest.transaction;
	return rest;
}

function buildEntry(
	op: string,
	query: Record<string, any>,
	result: any,
	db: ValtheraClass,
): CrdtLogEntry {
	if (op === "add")
		return {
			a: encodeCrdt(structuredClone(result)),
		};

	if (op === "bulkAdd") {
		const records = Array.isArray(result) ? result : [];
		return {
			aa: encodeCrdt(structuredClone(records)),
		};
	}

	const d = stripVolatile(query) as CrdtMutationEntry["d"];

	if (
		(op === "updateOneOrAdd" || op === "toggleOne") &&
		result?.type === "added" &&
		result.data
	) {
		const idKey = db.adapter?.adapterOpts?.idKey ?? "_id";
		const id = result.data[idKey];
		if (id !== undefined) {
			if (op === "updateOneOrAdd")
				d.add_arg = {
					...(d.add_arg ?? {}),
					[idKey]: id,
				};
			else
				d.data = {
					...(d.data ?? {}),
					[idKey]: id,
				};
		}
	}

	return {
		d: encodeCrdt(d),
		op: op as CrdtOp,
	};
}

export function createCrdtPlugin(opts: CrdtPluginOpts = {}): ValtheraPlugin {
	const prefix = opts.prefix ?? collectionPrefix;
	const exclude = new Set(opts.exclude ?? []);
	let _db: ValtheraClass;

	return {
		name: "crdt",
		init(db: ValtheraClass) {
			_db = db;
		},
		async execute(ctx) {
			const result = await ctx.next();

			const kind = ctx.kind ?? getOpKind(ctx.op);
			if (!TRACKED_KINDS.has(kind)) return result;

			const query = ctx.query;
			if (!query || typeof query !== "object") return result;

			const col = query.collection;
			if (
				!col ||
				col === prefix ||
				col.startsWith(prefix + "/") ||
				exclude.has(col)
			)
				return result;

			const entry = buildEntry(ctx.op, query, result, _db);

			await _db.execute(
				"add",
				{
					collection: prefix + "/" + col,
					data: entry,
					id_gen: true,
				},
				query.transaction,
			);

			return result;
		},
	};
}

export async function syncBoth(
	dbA: ValtheraClass,
	dbB: ValtheraClass,
	collection: string,
	options: boolean | SyncOpts = false,
): Promise<CollectionsSyncResult> {
	const first = await sync(dbA, dbB, collection, options);
	const second = await sync(dbB, dbA, collection, options);

	return {
		collections: [
			first,
			second,
		],
		copied: first.copied + second.copied,
		changed: first.changed || second.changed,
		rebuild: first.rebuild || second.rebuild,
	};
}

export async function reverseSync(
	my: ValtheraClass,
	other: ValtheraClass,
	collection: string,
) {
	return await sync(other, my, collection);
}
