import { ValtheraPlugin } from "@wxn0brp/db-core/types/plugin";
import { createHash } from "crypto";
import { RedisCacheOpts } from "./types";

const TAG = "\u0000";

function stableStringify(value: any): string {
	if (value === null) return "null";
	if (value === undefined) return `${TAG}undefined`;
	if (value instanceof RegExp) return `${TAG}regexp:${value.toString()}`;
	if (value instanceof Date) {
		const time = value.getTime();
		return `${TAG}date:${Number.isNaN(time) ? "invalid" : value.toISOString()}`;
	}
	if (typeof value === "bigint") return `${TAG}bigint:${value.toString()}`;
	if (typeof value === "function") return `${TAG}function`;
	if (typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value))
		return "[" + value.map(stableStringify).join(",") + "]";
	const keys = Object.keys(value).sort();
	return (
		"{" +
		keys
			.map(k => JSON.stringify(k) + ":" + stableStringify(value[k]))
			.join(",") +
		"}"
	);
}

function hashKey(str: string) {
	return createHash("sha256").update(str).digest("hex").slice(0, 16);
}

export function createRedisCachePlugin(opts: RedisCacheOpts): ValtheraPlugin {
	const {
		client,
		ttl = 60,
		prefix = "valthera",
		exclude = [],
		include = null,
		maxKeyLength = 200,
	} = opts;

	const excludeSet = new Set(exclude);

	function shouldCache(collection: string) {
		if (excludeSet.has(collection)) return false;
		if (include && !include.includes(collection)) return false;
		return true;
	}

	function buildKey(op: string, collection: string, query: any) {
		const serialized = stableStringify({
			op,
			collection,
			search: query?.search,
			findOpts: query?.findOpts,
			dbFindOpts: query?.dbFindOpts,
		});
		const hash = hashKey(serialized);
		const key = `${prefix}:${collection}:${hash}`;
		if (key.length > maxKeyLength) {
			return `${prefix}:${collection}:${hashKey(key)}`;
		}
		return key;
	}

	function patternFor(collection: string) {
		return `${prefix}:${collection}:*`;
	}

	async function invalidateCollection(collection: string) {
		const pattern = patternFor(collection);
		let cursor = "0";
		do {
			const [nextCursor, keys] = await client.scan(cursor, "MATCH", pattern);
			if (keys.length > 0) {
				await Promise.all(keys.map(k => client.del(k)));
			}
			cursor = nextCursor;
		} while (cursor !== "0");
	}

	return {
		name: "redis-cache",
		async execute(ctx) {
			const collection = ctx.collection;
			if (!collection || !shouldCache(collection)) {
				return ctx.next();
			}

			const inTransaction =
				!!ctx.query && typeof ctx.query === "object" && !!ctx.query.transaction;

			if (ctx.kind === "read") {
				if (inTransaction) return ctx.next();

				const key = buildKey(ctx.op, collection, ctx.query);
				const cached = await client.get(key);
				if (cached !== null) {
					return JSON.parse(cached);
				}
				const result = await ctx.next();
				if (result !== null && result !== undefined) {
					await client.set(key, JSON.stringify(result), "EX", ttl);
				}
				return result;
			}

			if (
				ctx.kind === "write" ||
				ctx.kind === "delete" ||
				ctx.op === "removeCollection"
			) {
				const result = await ctx.next();
				await invalidateCollection(collection);
				return result;
			}

			return ctx.next();
		},
	};
}

export * from "./types";
