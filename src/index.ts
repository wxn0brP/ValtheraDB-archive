import { ValtheraClass } from "@wxn0brp/db-core";
import { BinAdapter } from "./adapter";
import { Options } from "./bin";

export * from "./bin";
export * from "./adapter";
export * from "./version";

export async function createBinValthera(
	path: string,
	opts: Partial<Options> = {},
	init = true,
) {
	const adapter = new BinAdapter(path, opts);
	const db = new ValtheraClass({
		adapter,
		executorAware: true,
	});

	if (init) await db.init();

	return {
		db,
		adapter,
		manager: adapter.manager,
	};
}

export const DYNAMIC = {
	async bin(path: string, opts: Partial<Options> = {}) {
		const adapter = new BinAdapter(path, opts);
		await adapter.init();
		return adapter;
	},
};
