import { ValtheraClass } from "@wxn0brp/db-core";
import type { Data } from "@wxn0brp/db-core/types/data";
import type { TypedValthera } from "@wxn0brp/db-core/types/typed";
import { BinAdapter } from "./adapter";
import { Options } from "./bin";

export * from "./bin";
export * from "./adapter";
export * from "./version";

export async function createBinValthera<
	T extends Record<string, Data> = Record<string, never>,
>(path: string, opts: Partial<Options> = {}, init = true) {
	const adapter = new BinAdapter(path, opts);
	const db = new ValtheraClass({
		adapter,
		executorAware: true,
	});

	if (init) await db.init();

	return {
		db: db as unknown as TypedValthera<T, ValtheraClass>,
		adapter,
		manager: adapter.manager,
	};
}

export const DYNAMIC = {
	async def(path: string, opts: Partial<Options> = {}) {
		const adapter = new BinAdapter(path, opts);
		await adapter.init();
		return adapter;
	},
};
