import { type BenchResult } from "../run";
import { type CloudAverages, type OpAverage } from "./cloud";
import { formatTime } from "./display";

export interface ComparisonRow {
	op: string;
	local: number;
	overall?: OpAverage;
	adapter?: OpAverage;
}

interface Diff {
	text: string;
	color: string;
}

export function buildComparisonRows(
	localResults: BenchResult[],
	cloud: CloudAverages,
	adapterName: string,
): ComparisonRow[] {
	const adapterAvg = cloud.adapters.get(adapterName);

	return localResults.map(r => ({
		op: r.name,
		local: r.time,
		overall: cloud.overall.get(r.name),
		adapter: adapterAvg?.get(r.name),
	}));
}

function diff(local: number, reference: number): Diff {
	const ratio = local / reference;
	const isTiny = Math.min(local, reference) < 1;
	const equalRatio = isTiny ? 1.25 : 1.05;

	if (ratio >= 1 / equalRatio && ratio <= equalRatio) {
		return {
			text: "≈ equal",
			color: "\x1b[2m",
		};
	}

	if (ratio < 1) {
		return {
			text: `${(1 / ratio).toFixed(2)}x faster`,
			color: "\x1b[32m",
		};
	}

	return {
		text: `${ratio.toFixed(2)}x slower`,
		color: "\x1b[31m",
	};
}

function colorCell(d: Diff | null, width: number) {
	const text = d?.text ?? "-";
	const padded = text.padEnd(width);
	return d ? `${d.color}${padded}\x1b[0m` : padded;
}

export function printComparisonTable(
	rows: ComparisonRow[],
	adapterName: string,
) {
	const adapterHeader = `${adapterName} avg`;

	const localTimes = rows.map(r => formatTime(r.local));
	const overallTimes = rows.map(r =>
		r.overall ? formatTime(r.overall.avg) : "-",
	);
	const adapterTimes = rows.map(r =>
		r.adapter ? formatTime(r.adapter.avg) : "-",
	);
	const overallDiffs = rows.map(r =>
		r.overall ? diff(r.local, r.overall.avg) : null,
	);
	const adapterDiffs = rows.map(r =>
		r.adapter ? diff(r.local, r.adapter.avg) : null,
	);

	const W_OP = Math.max("Test".length, ...rows.map(r => r.op.length));
	const W_LOCAL = Math.max("Local".length, ...localTimes.map(t => t.length));
	const W_OVERALL = Math.max(
		"Overall avg".length,
		...overallTimes.map(t => t.length),
	);
	const W_OVERALL_DIFF = Math.max(
		"vs overall".length,
		...overallDiffs.map(d => d?.text.length ?? 1),
	);
	const W_ADAPTER = Math.max(
		adapterHeader.length,
		...adapterTimes.map(t => t.length),
	);
	const W_ADAPTER_DIFF = Math.max(
		"vs adapter".length,
		...adapterDiffs.map(d => d?.text.length ?? 1),
	);

	const line = (l: string, m: string, r: string) =>
		l +
		"─".repeat(W_OP + 2) +
		m +
		"─".repeat(W_LOCAL + 2) +
		m +
		"─".repeat(W_OVERALL + 2) +
		m +
		"─".repeat(W_OVERALL_DIFF + 2) +
		m +
		"─".repeat(W_ADAPTER + 2) +
		m +
		"─".repeat(W_ADAPTER_DIFF + 2) +
		r;

	const row = (
		op: string,
		local: string,
		overall: string,
		overallDiff: Diff | null,
		adapter: string,
		adapterDiff: Diff | null,
	) =>
		`│ ${op.padEnd(W_OP)} │ ${local.padStart(W_LOCAL)} │ ${overall.padStart(W_OVERALL)} │ ${colorCell(overallDiff, W_OVERALL_DIFF)} │ ${adapter.padStart(W_ADAPTER)} │ ${colorCell(adapterDiff, W_ADAPTER_DIFF)} │`;

	console.log();
	console.log("\x1b[1m--- Comparison with cloud ---\x1b[0m");

	if (!rows.some(r => r.adapter)) {
		console.log(
			`\x1b[2m  No cloud measurements found for adapter "${adapterName}"\x1b[0m`,
		);
	}

	console.log();
	console.log(line("┌", "┬", "┐"));
	console.log(
		`│ ${"Test".padEnd(W_OP)} │ ${"Local".padStart(W_LOCAL)} │ ${"Overall avg".padStart(W_OVERALL)} │ ${"vs overall".padEnd(W_OVERALL_DIFF)} │ ${adapterHeader.padStart(W_ADAPTER)} │ ${"vs adapter".padEnd(W_ADAPTER_DIFF)} │`,
	);
	console.log(line("├", "┼", "┤"));

	for (let i = 0; i < rows.length; i++) {
		const r = rows[i];
		console.log(
			row(
				r.op,
				localTimes[i],
				overallTimes[i],
				overallDiffs[i],
				adapterTimes[i],
				adapterDiffs[i],
			),
		);
	}

	console.log(line("└", "┴", "┘"));
	console.log();
}
