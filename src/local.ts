#!/usr/bin/env bun

import { ValtheraClass } from "@wxn0brp/db-core";
import { existsSync } from "fs";
import { basename, dirname, resolve } from "path";
import { benchmarkLarge } from "./large";
import { type BenchResult } from "./run";
import { benchmarkSmall } from "./small";

process.on("uncaughtException", err => {
	console.error("Uncaught exception:", err);
	process.exit(1);
});

process.on("unhandledRejection", reason => {
	console.error("Unhandled rejection:", reason);
	process.exit(1);
});

function formatTime(timeMs: number): string {
	if (timeMs < 1) return `${(timeMs * 1000).toFixed(2)}μs`;
	if (timeMs < 1000) return `${timeMs.toFixed(2)}ms`;
	return `${(timeMs / 1000).toFixed(2)}s`;
}

function printHeader(adapterName: string, adapterPath: string) {
	console.log();
	console.log("--------------------------------------------------");
	console.log("ValtheraDB Benchmark Runner");
	console.log("--------------------------------------------------");
	console.log(`  Adapter: ${adapterName}`);
	console.log(`  Path: ${adapterPath}`);
	console.log(`  Date: ${new Date().toISOString()}`);
	console.log("--------------------------------------------------");
	console.log();
}

function printResultsTable(results: BenchResult[]) {
	const COL1_W = 25;
	const COL2_W = 10;
	const COL3_W = 25;
	const COL1_LABEL = "Test";
	const COL2_LABEL = "Time";

	const pad = (s: string, w: number, align: "left" | "right" = "left") =>
		align === "right" ? s.padStart(w) : s.padEnd(w);

	const C = {
		reset: "\x1b[0m",
		dim: "\x1b[2m",
		bold: "\x1b[1m",
		cyan: "\x1b[36m",
		green: "\x1b[32m",
		yellow: "\x1b[33m",
		red: "\x1b[31m",
	};

	const times = results.map(r => r.time);
	const minT = Math.min(...times);
	const maxT = Math.max(...times);
	const range = maxT - minT || 1;

	const bar = (time: number, maxLen: number = COL3_W): string => {
		const ratio = (time - minT) / range;
		const len = Math.round(ratio * maxLen);
		const filled = "\u2588".repeat(len || 1);
		const empty = "\u2591".repeat(maxLen - (len || 1));
		let color = C.green;
		if (ratio > 0.66) color = C.red;
		else if (ratio > 0.33) color = C.yellow;
		return `${color}${filled}${C.reset}${C.dim}${empty}${C.reset}`;
	};

	const B = {
		tl: "\u250c",
		tm: "\u252c",
		tr: "\u2510",
		bl: "\u2514",
		bm: "\u2534",
		br: "\u2518",
		ml: "\u251c",
		mm: "\u253c",
		mr: "\u2524",
		h: "\u2500",
		v: "\u2502",
	};

	const hLine = (l: string, m1: string, m2: string, r: string, fill: string) =>
		`${C.dim}${l}${fill.repeat(COL1_W + 2)}${m1}${fill.repeat(COL2_W + 2)}${m2}${fill.repeat(COL3_W + 2)}${r}${C.reset}`;

	const headerBorder = hLine(B.tl, B.tm, B.tm, B.tr, B.h);
	const midBorder = hLine(B.ml, B.mm, B.mm, B.mr, B.h);
	const footerBorder = hLine(B.bl, B.bm, B.bm, B.br, B.h);

	const dimV = `${C.dim}${B.v}${C.reset}`;
	const vSep = dimV;

	const row = (
		name: string,
		time: string,
		timeBar: string,
		isHeader: boolean = false,
	) => {
		const nameCol = pad(name, COL1_W);
		const timeCol = pad(time, COL2_W, "right");
		if (isHeader) {
			return `${vSep} ${C.bold}${C.cyan}${nameCol}${C.reset} ${vSep} ${C.bold}${C.cyan}${timeCol}${C.reset} ${vSep} ${timeBar} ${vSep}`;
		}
		return `${vSep} ${nameCol} ${vSep} ${timeCol} ${vSep} ${timeBar} ${vSep}`;
	};

	console.log();
	console.log(`${headerBorder}`);
	console.log(
		`${row(COL1_LABEL, COL2_LABEL, pad("Distribution", COL3_W), true)}`,
	);
	console.log(`${midBorder}`);
	for (let i = 0; i < results.length; i++) {
		const r = results[i];
		console.log(`${row(r.name, formatTime(r.time), bar(r.time), false)}`);
	}
	console.log(`${footerBorder}`);
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

async function main() {
	const adapterPathArg = process.argv[2] || "./valthera-e2e/index.ts";
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

	const customSetupPath = resolve(
		import.meta.dirname,
		"custom",
		`${adapterName}.js`,
	);
	let onAfterAdd = async () => {};

	if (existsSync(customSetupPath)) {
		console.log(`  Using custom setup for ${adapterName}`);
		const customModule = await import(customSetupPath);

		if (typeof customModule.init === "function") {
			await customModule.init(db.adapter);
		}

		if (typeof customModule.onAfterAdd === "function") {
			onAfterAdd = () => customModule.onAfterAdd(db.adapter);
		}
	} else {
		console.log(`  No custom setup found for ${adapterName}`);
	}

	console.log();

	const allResults: BenchResult[] = [];

	console.log("\x1b[1m--- Small collection (users, 10k) ---\x1b[0m");
	const smallResults = await benchmarkSmall(db.c("users"));
	allResults.push(...smallResults);
	console.log();

	console.log("\x1b[1m--- Large collection (posts, 200k) ---\x1b[0m");
	const largeResults = await benchmarkLarge(db.c("posts"), onAfterAdd);
	allResults.push(...largeResults);
	console.log();

	console.log("\x1b[1m--- Results ---\x1b[0m");
	printResultsTable(allResults);

	printSummary(allResults, adapterName);

	if (typeof db.close === "function") {
		await db.close().catch(() => {});
	}

	process.exit(0);
}

main().catch(err => {
	console.error("Fatal error:", err);
	process.exit(1);
});
