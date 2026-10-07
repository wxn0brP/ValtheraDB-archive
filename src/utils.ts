import { ActionsBaseInterface } from "@wxn0brp/db-core/types/action";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { type BenchResult } from "./run";

process.on("uncaughtException", err => {
	console.error("Uncaught exception:", err);
	process.exit(1);
});

process.on("unhandledRejection", reason => {
	console.error("Unhandled rejection:", reason);
	process.exit(1);
});

export async function loadCustomSetup(
	adapterName: string,
	adapter: ActionsBaseInterface,
): Promise<() => Promise<void>> {
	const setupPath = resolve(import.meta.dirname, "custom", `${adapterName}.js`);
	let onAfterAdd = async () => {};

	if (existsSync(setupPath)) {
		console.log(`-> Using custom setup for ${adapterName}`);
		const mod = await import(setupPath);

		if (typeof mod.init === "function") {
			await mod.init(adapter);
		} else {
			console.log(`-> No init function found for ${adapterName}`);
		}

		if (typeof mod.onAfterAdd === "function") {
			onAfterAdd = () => mod.onAfterAdd(adapter);
		}
	} else {
		console.log(`-> No custom setup found for ${adapterName}`);
	}

	return onAfterAdd;
}

export function writeResults(
	file: string,
	params: {
		results: BenchResult[];
		adapter: string;
		coreVersion: string;
		adapterVersion: string;
	},
) {
	const results = {
		time: new Date().toISOString(),
		os: process.platform,
		arch: process.arch,
		node: process?.version,
		bun: globalThis.Bun?.version || "N/A",
		adapter: params.adapter,
		coreVersion: params.coreVersion,
		adapterVersion: params.adapterVersion,
		results: params.results,
	};
	if (existsSync(file)) {
		const oldResults = JSON.parse(readFileSync(file, "utf-8"));
		results.results = [
			...oldResults.results,
			...results.results,
		];
	}
	writeFileSync(file, JSON.stringify(results, null, 2));
}
