import { adapterName, fmt, parseEntry, threshold } from "./utils";
import { state } from "./var";

interface BenchmarkEntry {
	dir: string;
	time: number;
}

function groupByThreshold(sorted: BenchmarkEntry[]) {
	if (!sorted.length) return [];

	const groups: BenchmarkEntry[][] = [];
	let cur = [
		sorted[0],
	];

	for (let i = 1; i < sorted.length; i++) {
		const prev = cur[cur.length - 1];
		const t = threshold(prev.time);
		if ((sorted[i].time - prev.time) / prev.time <= t) {
			cur.push(sorted[i]);
		} else {
			groups.push(cur);
			cur = [
				sorted[i],
			];
		}
	}

	groups.push(cur);

	return groups;
}

export function renderSummary() {
	const notRanked = [
		"memory",
	];
	const rankingEntries = state.entries.filter(
		e => !notRanked.includes(e.info.adapter),
	);
	const allOps = [
		...new Set(rankingEntries.flatMap(e => e.data.results.map(r => r.name))),
	].sort();

	const container = document.querySelector<HTMLDivElement>("#summary-cards");
	container.innerHTML = "";

	const modal = document.querySelector<HTMLDialogElement>("#summary-modal");
	const modalTitle = document.querySelector<HTMLSpanElement>(
		"#summary-modal-title",
	);
	const modalContent = document.querySelector<HTMLDivElement>(
		"#summary-modal-content",
	);
	const modalClose = document.querySelector<HTMLButtonElement>(
		"#summary-modal-close",
	);

	modalClose?.addEventListener("click", () => modal?.close());
	modal?.addEventListener("click", e => {
		if (e.target === modal) modal.close();
	});

	for (const op of allOps) {
		const withTime = rankingEntries
			.map(e => ({
				dir: e.dir,
				time: e.data.results.find(r => r.name === op)?.time,
			}))
			.filter(
				(
					x,
				): x is {
					dir: string;
					time: number;
				} => x.time !== undefined,
			);

		if (!withTime.length) continue;

		let cardHTML = `<article><header><strong>${op}</strong></header>`;

		const sorted = withTime.sort((a, b) => a.time - b.time);
		const groups = groupByThreshold(sorted);

		const visibleCount = Math.min(3, groups.length);
		const visibleGroups = groups.slice(0, visibleCount);
		const visibleMax = Math.max(
			...visibleGroups.map(g => g.reduce((s, x) => s + x.time, 0) / g.length),
		);

		for (let i = 0; i < visibleCount; i++) {
			const avg =
				visibleGroups[i].reduce((s, x) => s + x.time, 0) /
				visibleGroups[i].length;
			const barWidth = visibleMax > 0 ? (avg / visibleMax) * 100 : 0;

			const names = visibleGroups[i]
				.map(x => {
					const info = parseEntry(x.dir);
					return `${adapterName(info.adapter)}/${info.ver}`;
				})
				.join(", ");

			cardHTML += `
                <div style="margin-bottom: 0.75rem;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                        <span class="adapter">${names}</span>
                        <span class="time">${fmt(avg)}</span>
                    </div>
                    <div class="bar-track">
                        <div class="bar-fill" style="width: ${barWidth}%; background: var(--pico-primary);"></div>
                    </div>
                </div>`;
		}

		if (groups.length > 3) {
			const allData = JSON.stringify(
				groups.map(g => ({
					names: g
						.map(x => {
							const info = parseEntry(x.dir);
							return `${adapterName(info.adapter)}/${info.ver}`;
						})
						.join(", "),
					avg: g.reduce((s, x) => s + x.time, 0) / g.length,
				})),
			);
			cardHTML += `<button class="outline contrast show-all-btn" data-op="${op}" data-all='${allData}'>Show all (${groups.length})</button>`;
		}

		cardHTML += `</article>`;
		container.innerHTML += cardHTML;
	}

	container.querySelectorAll(".show-all-btn").forEach(btn => {
		btn.addEventListener("click", () => {
			const op = btn.getAttribute("data-op");
			const allData = JSON.parse(btn.getAttribute("data-all") || "[]");
			const maxTime = Math.max(...allData.map((d: { avg: number }) => d.avg));

			if (modalTitle) modalTitle.textContent = op ?? "";
			if (modalContent) {
				modalContent.innerHTML = allData
					.map((d: { names: string; avg: number }) => {
						const barWidth = maxTime > 0 ? (d.avg / maxTime) * 100 : 0;
						return `
							<div style="margin-bottom: 0.75rem;">
								<div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
									<span class="adapter">${d.names}</span>
									<span class="time">${fmt(d.avg)}</span>
								</div>
								<div class="bar-track">
									<div class="bar-fill" style="width: ${barWidth}%; background: var(--pico-primary);"></div>
								</div>
							</div>`;
					})
					.join("");
			}
			modal?.showModal();
		});
	});
}
