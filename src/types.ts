/**
 * Minimal Redis client interface compatible with both ioredis and bun:redis.
 * Both clients implement this shape for the 4 commands we need.
 */
export interface RedisLikeClient {
	get(key: string): Promise<string | null>;
	set(key: string, value: string, ex: "EX", ttl: number): Promise<any>;
	del(key: string): Promise<number>;
	scan(
		cursor: string | number,
		match: string,
		pattern: string,
	): Promise<[string, string[]]>;
}

export interface RedisCacheOpts {
	/** Redis client instance (ioredis or bun:redis) */
	client: RedisLikeClient;
	/** Cache TTL in seconds. Default: 60 */
	ttl?: number;
	/** Key prefix. Default: "valthera" */
	prefix?: string;
	/** Collections excluded from caching */
	exclude?: string[];
	/** If set, only these collections are cached */
	include?: string[];
	/** Max key length before hashing. Default: 200 */
	maxKeyLength?: number;
}
