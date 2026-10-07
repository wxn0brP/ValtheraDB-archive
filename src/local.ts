#!/usr/bin/env bun

import { ValtheraClass } from "@wxn0brp/db-core";
import { existsSync } from "fs";
import { parseArgs } from "node:util";
import { basename, dirname, resolve } from "path";
import { benchmarkLarge } from "./large";
import { type BenchResult } from "./run";
import { benchmarkSmall } from "./small";
import { loadCustomSetup, writeResults } from "./utils";

function formatTime(timeMs: number) {
	if (timeMs < 1) return `${(timeMs * 1000).toFixed(2)}μs`;
	if (timeMs < 1000) return `${timeMs.toFixed(2)}ms`;
	return `${(timeMs / 1000).toFixed(2)}s`;
}

function printHeader(adapterName: string, adapterPath: string) {
	console.log();
	console.log("──────────────────────────────────────────────────");
	console.log("ValtheraDB Benchmark Runner");
	console.log("──────────────────────────────────────────────────");
	console.log(`  Adapter: ${adapterName}`);
	console.log(`  Path: ${adapterPath}`);
	console.log(`  Date: ${new Date().toISOString()}`);
	console.log("──────────────────────────────────────────────────");
	console.log();
}

function printResultsTable(results: BenchResult[]) {
	const W_NAME = 25;
	const W_TIME = 10;
	const W_BAR = 25;

	const times = results.map(r => r.time);
	const avg = times.reduce((a, b) => a + b, 0) / times.length;
	const min = Math.min(...times);
	const max = Math.max(...times);

	const logMin = Math.log(min);
	const logRange = Math.log(max) - logMin || 1;

	const line = (l: string, m: string, r: string) =>
		l +
		"─".repeat(W_NAME + 2) +
		m +
		"─".repeat(W_TIME + 2) +
		m +
		"─".repeat(W_BAR + 2) +
		r;

	const row = (a: string, b: string, c: string) =>
		`│ ${a.padEnd(W_NAME)} │ ${b.padStart(W_TIME)} │ ${c.padEnd(W_BAR)} │`;

	const bar = (t: number) => {
		const pos = (Math.log(t) - logMin) / logRange;
		const len = Math.max(1, Math.round(pos * W_BAR));

		const ratio = t / avg;
		const color =
			ratio < 0.5 ? "\x1b[32m" : ratio < 2 ? "\x1b[33m" : "\x1b[31m";

		return (
			color +
			"█".repeat(len) +
			"\x1b[0m" +
			"\x1b[2m" +
			"░".repeat(W_BAR - len) +
			"\x1b[0m"
		);
	};

	console.log();
	console.log(line("┌", "┬", "┐"));
	console.log(row("Test", "Time", "Distribution"));
	console.log(line("├", "┼", "┤"));

	for (const r of results)
		console.log(row(r.name, formatTime(r.time), bar(r.time)));

	console.log(line("└", "┴", "┘"));
	console.log();
}

function printSummary(allResults: BenchResult[], adapterName: string) {
	const totalTime = allResults.reduce((sum, r) => sum + r.time, 0);
	console.log();
	console.log(
		`\x1b[32m✓\x1b[0m Completed ${allResults.length} benchmarks for ${adapterName}`,
	);
	console.log(`  Total time: ${formatTime(totalTime)}`);
	console.log();
}

const { values, positionals } = parseArgs({
	options: {
		small: {
			type: "boolean",
			short: "s",
		},
		json: {
			type: "boolean",
			short: "j",
		},
		jsonFile: {
			type: "string",
			short: "f",
		},
	},
	allowPositionals: true,
});

const smallOnly = values.small ?? false;
const jsonOutput = values.json || values.jsonFile;
const jsonFile = values.jsonFile || "results.json";
const adapterPathArg = positionals[0] || "./valthera-e2e/index.ts";
const adapterPath = resolve(process.cwd(), adapterPathArg);

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

if (!smallOnly) {
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

if (jsonOutput) {
	writeResults(jsonFile, {
		results: allResults,
		adapter: adapterName,
		coreVersion: db.version,
		adapterVersion: db.adapter?.version || "N/A",
	});
	console.log(`\x1b[2mResults saved to ${jsonFile}\x1b[0m`);
}

await db.close();
