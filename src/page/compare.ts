import { adapterName, fmt } from "./utils";
import { Entry } from "./types";
import { state } from "./var";

function getPlatformsForAdapter(adapter: string): string[] {
	return [
		...new Set(
			state.entries
				.filter(e => e.info.adapter === adapter)
				.map(e => `${e.info.ver}__${e.info.os}`),
		),
	].sort((a, b) => {
		const [verA, osA] = a.split("__");
		const [verB, osB] = b.split("__");
		if (verA === "bun" && verB !== "bun") return -1;
		if (verB === "bun" && verA !== "bun") return 1;
		if (verA !== verB) return verB.localeCompare(verA);
		return osA.localeCompare(osB);
	});
}

function formatPlatform(platform: string): string {
	const [ver, os] = platform.split("__");
	return ver === "bun" ? `bun / ${os}` : `node ${ver} / ${os}`;
}

let selectedBasePlatforms: Set<string> = new Set();
let selectedTargetPlatforms: Set<string> = new Set();
let currentSort: "name" | "diff" | "winner" = "name";
let currentFilter: "all" | "faster" | "slower" | "equal" = "all";

export function renderCompare() {
	const adapters = [
		...new Set(state.entries.map(e => e.info.adapter)),
	].sort();
	const baseSel = document.querySelector<HTMLSelectElement>("#compare-base");
	const targetSel =
		document.querySelector<HTMLSelectElement>("#compare-target");

	const opts = adapters
		.map(a => `<option value="${a}">${adapterName(a)}</option>`)
		.join("");
	baseSel.innerHTML = opts;
	targetSel.innerHTML = opts;

	if (adapters.length > 1) targetSel.selectedIndex = 1;

	function updatePlatformChips() {
		const basePlatforms = getPlatformsForAdapter(baseSel.value);
		const targetPlatforms = getPlatformsForAdapter(targetSel.value);

		selectedBasePlatforms = new Set(basePlatforms);
		selectedTargetPlatforms = new Set(targetPlatforms);

		renderPlatformChips(
			"compare-base-chips",
			basePlatforms,
			selectedBasePlatforms,
			(platform, checked) => {
				if (checked) selectedBasePlatforms.add(platform);
				else selectedBasePlatforms.delete(platform);
				updateCompareResults();
			},
		);

		renderPlatformChips(
			"compare-target-chips",
			targetPlatforms,
			selectedTargetPlatforms,
			(platform, checked) => {
				if (checked) selectedTargetPlatforms.add(platform);
				else selectedTargetPlatforms.delete(platform);
				updateCompareResults();
			},
		);
	}

	function updateCompareResults() {
		doCompare(
			baseSel.value,
			targetSel.value,
			Array.from(selectedBasePlatforms),
			Array.from(selectedTargetPlatforms),
		);
	}

	baseSel.addEventListener("change", () => {
		updatePlatformChips();
		updateCompareResults();
	});
	targetSel.addEventListener("change", () => {
		updatePlatformChips();
		updateCompareResults();
	});

	document.querySelectorAll("[data-sort]").forEach(btn => {
		btn.addEventListener("click", () => {
			document
				.querySelectorAll("[data-sort]")
				.forEach(b => b.classList.remove("active"));
			btn.classList.add("active");
			currentSort = (btn as HTMLElement).dataset.sort as any;
			updateCompareResults();
		});
	});

	document.querySelectorAll("[data-filter]").forEach(btn => {
		btn.addEventListener("click", () => {
			document
				.querySelectorAll("[data-filter]")
				.forEach(b => b.classList.remove("active"));
			btn.classList.add("active");
			currentFilter = (btn as HTMLElement).dataset.filter as any;
			updateCompareResults();
		});
	});

	updatePlatformChips();
	updateCompareResults();
}

function renderPlatformChips(
	containerId: string,
	platforms: string[],
	selected: Set<string>,
	onChange: (platform: string, checked: boolean) => void,
) {
	const container = document.querySelector<HTMLDivElement>(`#${containerId}`);
	if (!container) return;

	container.innerHTML = platforms
		.map(p => {
			const checked = selected.has(p) ? "checked" : "";
			return `<label class="platform-chip ${checked ? "active" : ""}">
				<input type="checkbox" value="${p}" ${checked} style="display:none;">
				${formatPlatform(p)}
			</label>`;
		})
		.join("");

	container.querySelectorAll("label.platform-chip").forEach(label => {
		label.addEventListener("click", e => {
			e.preventDefault();
			const input = label.querySelector("input");
			const isChecked = input.checked;
			input.checked = !isChecked;
			label.classList.toggle("active");
			onChange(input.value, !isChecked);
		});
	});
}

function filterEntriesByPlatforms(
	entries: Entry[],
	adapter: string,
	platforms: string[],
): Entry[] {
	return entries.filter(e => {
		if (e.info.adapter !== adapter) return false;
		const key = `${e.info.ver}__${e.info.os}`;
		return platforms.includes(key);
	});
}

function stddev(values: number[]): number {
	if (values.length < 2) return 0;
	const avg = values.reduce((a, b) => a + b, 0) / values.length;
	const sq = values.map(v => (v - avg) ** 2);
	return Math.sqrt(sq.reduce((a, b) => a + b, 0) / (values.length - 1));
}

interface CompareRow {
	op: string;
	bAvg: number;
	tAvg: number;
	ratio: number;
	statClass: string;
	text: string;
	titleText: string;
	baseMin: number;
	baseMax: number;
	baseStd: number;
	baseCount: number;
	targetMin: number;
	targetMax: number;
	targetStd: number;
	targetCount: number;
}

function buildCompareRows(
	baseA: string,
	targetA: string,
	basePlatforms: string[],
	targetPlatforms: string[],
): CompareRow[] {
	const { entries } = state;
	const allOps = [
		...new Set(entries.flatMap(e => e.data.results.map(r => r.name))),
	].sort();

	const baseEntries = filterEntriesByPlatforms(entries, baseA, basePlatforms);
	const targetEntries = filterEntriesByPlatforms(
		entries,
		targetA,
		targetPlatforms,
	);

	const rows: CompareRow[] = [];

	for (const op of allOps) {
		const baseTimes = baseEntries
			.map(e => e.data.results.find(r => r.name === op)?.time)
			.filter((t): t is number => t !== undefined);
		const targetTimes = targetEntries
			.map(e => e.data.results.find(r => r.name === op)?.time)
			.filter((t): t is number => t !== undefined);

		if (!baseTimes.length || !targetTimes.length) continue;

		const bAvg = baseTimes.reduce((a, b) => a + b, 0) / baseTimes.length;
		const tAvg = targetTimes.reduce((a, b) => a + b, 0) / targetTimes.length;

		const ratio = bAvg / tAvg;
		let statClass = "stat-equal";
		let text = "Equal";

		const isTiny = Math.min(bAvg, tAvg) < 1;
		const fastRatio = isTiny ? 1.25 : 1.05;
		const slowRatio = isTiny ? 0.75 : 0.95;

		if (ratio < slowRatio) {
			statClass = "stat-faster";
			text = `${adapterName(baseA)} ${(1 / ratio).toFixed(2)}x faster`;
		} else if (ratio > fastRatio) {
			statClass = "stat-slower";
			text = `${adapterName(targetA)} ${ratio.toFixed(2)}x faster`;
		}

		let titleText = "Adapters are equal performance-wise";
		if (statClass !== "stat-equal") {
			const betterAdapter = bAvg < tAvg ? baseA : targetA;
			titleText = `${adapterName(betterAdapter)} is faster`;
		}

		rows.push({
			op,
			bAvg,
			tAvg,
			ratio,
			statClass,
			text,
			titleText,
			baseMin: Math.min(...baseTimes),
			baseMax: Math.max(...baseTimes),
			baseStd: stddev(baseTimes),
			baseCount: baseTimes.length,
			targetMin: Math.min(...targetTimes),
			targetMax: Math.max(...targetTimes),
			targetStd: stddev(targetTimes),
			targetCount: targetTimes.length,
		});
	}

	return rows;
}

function sortRows(
	rows: CompareRow[],
	sort: "name" | "diff" | "winner",
): CompareRow[] {
	const sorted = [
		...rows,
	];
	switch (sort) {
		case "name":
			sorted.sort((a, b) => a.op.localeCompare(b.op));
			break;
		case "diff":
			sorted.sort((a, b) => Math.abs(1 - b.ratio) - Math.abs(1 - a.ratio));
			break;
		case "winner": {
			const order = {
				"stat-faster": 0,
				"stat-equal": 1,
				"stat-slower": 2,
			};
			sorted.sort(
				(a, b) =>
					order[a.statClass] - order[b.statClass] || a.op.localeCompare(b.op),
			);
			break;
		}
	}
	return sorted;
}

function filterRows(
	rows: CompareRow[],
	filter: "all" | "faster" | "slower" | "equal",
): CompareRow[] {
	if (filter === "all") return rows;
	const map = {
		faster: "stat-faster",
		slower: "stat-slower",
		equal: "stat-equal",
	};
	return rows.filter(r => r.statClass === map[filter]);
}

function buildSummaryHTML(
	rows: CompareRow[],
	baseA: string,
	targetA: string,
): string {
	const baseWins = rows.filter(r => r.statClass === "stat-faster").length;
	const targetWins = rows.filter(r => r.statClass === "stat-slower").length;
	const equal = rows.filter(r => r.statClass === "stat-equal").length;
	const total = rows.length;

	let winner = "";
	if (baseWins > targetWins) {
		winner = `<span class="stat-faster">${adapterName(baseA)} wins overall</span>`;
	} else if (targetWins > baseWins) {
		winner = `<span class="stat-slower">${adapterName(targetA)} wins overall</span>`;
	} else {
		winner = `<span class="stat-equal">Tie</span>`;
	}

	return `
		<div id="compare-summary">
			<div class="summary-winner">${winner}</div>
			<div class="summary-stats">
				<span class="summary-stat stat-faster" title="${adapterName(baseA)}">${baseWins} wins</span>
				<span class="summary-stat stat-equal">${equal} equal</span>
				<span class="summary-stat stat-slower" title="${adapterName(targetA)}">${targetWins} wins</span>
			</div>
			<div class="summary-bar">
				<div class="bar-a" style="width: ${total ? (baseWins / total) * 100 : 0}%"></div>
				<div class="bar-equal" style="width: ${total ? (equal / total) * 100 : 0}%"></div>
				<div class="bar-b" style="width: ${total ? (targetWins / total) * 100 : 0}%"></div>
			</div>
		</div>
	`;
}

function progressBarHTML(
	value: number,
	maxValue: number,
	cssClass: string,
): string {
	const pct = maxValue > 0 ? Math.max((value / maxValue) * 100, 2) : 2;
	return `<div class="bar-track"><div class="bar-fill ${cssClass}" style="width: ${pct}%"></div></div>`;
}

function tooltipText(row: CompareRow, baseA: string, targetA: string) {
	const baseInfo = `${adapterName(baseA)}: avg ${fmt(row.bAvg)}`;
	const targetInfo = `${adapterName(targetA)}: avg ${fmt(row.tAvg)}`;
	return `${row.titleText} | ${baseInfo} | ${targetInfo}`;
}

export function doCompare(
	baseA: string,
	targetA: string,
	basePlatforms: string[] = [],
	targetPlatforms: string[] = [],
) {
	const container = document.querySelector("#compare-results");
	const summaryContainer = document.querySelector("#compare-summary-wrapper");
	container.innerHTML = "";

	const baseEntries = filterEntriesByPlatforms(
		state.entries,
		baseA,
		basePlatforms,
	);
	const targetEntries = filterEntriesByPlatforms(
		state.entries,
		targetA,
		targetPlatforms,
	);

	if (!basePlatforms.length || !targetPlatforms.length) {
		container.innerHTML =
			"<p style='color: var(--pico-muted-color); font-style: italic;'>No platforms selected</p>";
		if (summaryContainer) summaryContainer.innerHTML = "";
		return;
	}

	if (!baseEntries.length || !targetEntries.length) {
		container.innerHTML = "<p>No data available for comparison.</p>";
		if (summaryContainer) summaryContainer.innerHTML = "";
		return;
	}

	const allRows = buildCompareRows(
		baseA,
		targetA,
		basePlatforms,
		targetPlatforms,
	);
	const rows = filterRows(sortRows(allRows, currentSort), currentFilter);

	if (summaryContainer) {
		summaryContainer.innerHTML = buildSummaryHTML(allRows, baseA, targetA);
	}

	if (!rows.length) {
		container.innerHTML = "<p>No operations match the current filter.</p>";
		return;
	}

	let html = "";
	for (const row of rows) {
		const cardMax = Math.max(row.bAvg, row.tAvg);
		const tooltip = tooltipText(row, baseA, targetA);
		html += `
			<article class="compare-card" title="${tooltip}">
				<div class="compare-card-header">
					<code>${row.op}</code>
					<span class="compare-badge ${row.statClass}">${row.text}</span>
				</div>
				<div class="compare-bar-row">
					<span class="compare-bar-label time">${fmt(row.bAvg)}</span>
					${progressBarHTML(row.bAvg, cardMax, "bar-a")}
				</div>
				<div class="compare-bar-row">
					<span class="compare-bar-label time">${fmt(row.tAvg)}</span>
					${progressBarHTML(row.tAvg, cardMax, "bar-b")}
				</div>
			</article>
		`;
	}

	container.innerHTML = html;
}
