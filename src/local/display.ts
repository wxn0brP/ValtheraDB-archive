import { type BenchResult } from "../run";

export function formatTime(timeMs: number) {
	if (timeMs < 1) return `${(timeMs * 1000).toFixed(2)}μs`;
	if (timeMs < 1000) return `${timeMs.toFixed(2)}ms`;
	return `${(timeMs / 1000).toFixed(2)}s`;
}

export function printHeader(adapterName: string, adapterPath: string) {
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

export function printResultsTable(results: BenchResult[]) {
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

export function printSummary(allResults: BenchResult[], adapterName: string) {
	const totalTime = allResults.reduce((sum, r) => sum + r.time, 0);
	console.log();
	console.log(
		`\x1b[32m✓\x1b[0m Completed ${allResults.length} benchmarks for ${adapterName}`,
	);
	console.log(`  Total time: ${formatTime(totalTime)}`);
	console.log();
}
