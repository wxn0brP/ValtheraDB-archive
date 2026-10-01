import { ValtheraClass } from "@wxn0brp/db-core";
import type { AdapterFactory } from "../types";

export async function loadAdapter(path: string): Promise<AdapterFactory> {
	const resolved = path.startsWith(".") ? `${process.cwd()}/${path}` : path;

	let mod: any;
	try {
		mod = await import(resolved);
	} catch (err: any) {
		console.error(`Error: Failed to import adapter: ${resolved}`);
		console.error(`  ${err.message ?? err}`);
		process.exit(1);
	}

	if (!mod.default) {
		console.error(`Error: Adapter module must have a default export`);
		process.exit(1);
	}

	if (typeof mod.default !== "function") {
		console.error(`Error: Adapter default export must be a function`);
		process.exit(1);
	}

	return mod.default as AdapterFactory;
}

export async function validateAdapterFactory(
	adapterFactory: AdapterFactory,
): Promise<void> {
	let db: ValtheraClass = null;
	try {
		const adapter = await adapterFactory();
		if (!adapter) throw new Error("Adapter factory returned null or undefined");

		db = new ValtheraClass({
			adapter,
		});
		await db.init();

		const requiredMethods = [
			"add",
			"find",
			"findOne",
			"update",
			"updateOne",
			"remove",
			"removeOne",
			"updateOneOrAdd",
			"toggleOne",
			"getCollections",
			"ensureCollection",
			"issetCollection",
			"removeCollection",
		];

		for (const method of requiredMethods)
			if (typeof db[method as keyof typeof db] !== "function")
				throw new Error(`ValtheraClass missing required method: ${method}`);
	} catch (err: any) {
		console.error(`Error: Adapter initialization failed`);
		console.error(`  ${err.message ?? err}`);
		if (db) await db.close().catch(() => {});
		process.exit(1);
	}
	if (db) await db.close().catch(() => {});
}
