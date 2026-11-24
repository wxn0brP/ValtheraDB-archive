#!/usr/bin/env bun

import { ValtheraClass } from "@wxn0brp/db-core";
import { existsSync } from "fs";
import { basename, dirname, resolve } from "path";
import { benchmarkLarge } from "../large";
import { type BenchResult } from "../run";
import { benchmarkSmall } from "../small";
import { loadCustomSetup, writeResults } from "../utils";
import { parseCliOptions, printHelp } from "./args";
import { buildCloudAverages, fetchCloudEntries } from "./cloud";
import { buildComparisonRows, printComparisonTable } from "./compare";
import { printHeader, printResultsTable, printSummary } from "./display";

const options = parseCliOptions();

if (options.help) {
	printHelp();
	process.exit(0);
}

const adapterPath = resolve(process.cwd(), options.adapterPathArg);

if (!existsSync(adapterPath)) {
	console.error(`Adapter file not found: ${adapterPath}`);
	process.exit(1);
}

const pathParts = adapterPath.split("/");
const valtheraE2eIndex = pathParts.lastIndexOf("valthera-e2e");
const adapterName =
	valtheraE2eIndex > 0
		? pathParts[valtheraE2eIndex - 1]
		: basename(dirname(adapterPath));

const adapterModule = await import(adapterPath);
const adapterFactory = adapterModule.default;

if (typeof adapterFactory !== "function") {
	console.error(`Invalid adapter factory in ${adapterPath}`);
	console.error("Expected default export to be a function");
	process.exit(1);
}

printHeader(adapterName, adapterPath);

console.log("  Loading adapter...");
const adapter = await adapterFactory();

if (!adapter) {
	console.error("Adapter factory returned null");
	process.exit(1);
}

const db = new ValtheraClass({
	adapter,
});
await db.init();

const onAfterAdd = await loadCustomSetup(adapterName, db.adapter);

console.log();

const allResults: BenchResult[] = [];

console.log("\x1b[1m--- Small collection (users, 10k) ---\x1b[0m");
const smallResults = await benchmarkSmall(db.c("users"));
allResults.push(...smallResults);
console.log();

if (!options.smallOnly) {
	console.log("\x1b[1m--- Large collection (posts, 200k) ---\x1b[0m");
	const largeResults = await benchmarkLarge(db.c("posts"), onAfterAdd);
	allResults.push(...largeResults);
	console.log();
} else {
	console.log("\x1b[2m  (small-only mode)\x1b[0m");
}

console.log("\x1b[1m--- Results ---\x1b[0m");
printResultsTable(allResults);

printSummary(allResults, adapterName);

if (!options.noCloud) {
	console.log("  Loading cloud results...");
	try {
		const cloudEntries = await fetchCloudEntries();
		const cloudAverages = buildCloudAverages(cloudEntries);
		const comparison = buildComparisonRows(
			allResults,
			cloudAverages,
			adapterName,
		);
		printComparisonTable(comparison, adapterName);
	} catch (e) {
		console.warn(`\x1b[33m!\x1b[0m Could not load cloud results: ${e.message}`);
		console.warn("  Use --no-cloud to skip this comparison.");
		console.log();
	}
}

if (options.jsonOutput) {
	writeResults(options.jsonFile, {
		results: allResults,
		adapter: adapterName,
		coreVersion: db.version,
		adapterVersion: db.adapter?.version || "N/A",
	});
	console.log(`\x1b[2mResults saved to ${options.jsonFile}\x1b[0m`);
}

await db.close();
