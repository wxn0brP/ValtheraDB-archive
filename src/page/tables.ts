import { adapterName, shortOp, formatRuntime, fmt } from "./utils";
import { state, OP_ORDER_SMALL, OP_ORDER_LARGE } from "./var";

const SECTIONS: [
	string,
	string[],
][] = [
	[
		"Small Collection (users, 10k)",
		OP_ORDER_SMALL,
	],
	[
		"Large Collection (posts, 200k)",
		OP_ORDER_LARGE,
	],
];

export function renderTables(selectedAdapter: string = null) {
	const container = document.querySelector("#tables-container");
	const select = document.querySelector<HTMLSelectElement>(
		"#tables-adapter-select",
	);

	const adapters = [
		...new Set(state.entries.map(e => e.info.adapter)),
	].sort();

	if (select.options.length === 0) {
		select.innerHTML = adapters
			.map(a => `<option value="${a}">${adapterName(a)}</option>`)
			.join("");
		select.innerHTML += `<option value="ALL">Show All</option>`;

		select.addEventListener("change", () => {
			renderTables(select.value);
		});

		if (!selectedAdapter && adapters.length > 0) {
			selectedAdapter = adapters.find(a => a === "dir") || adapters[0];
			select.value = selectedAdapter;
		}
	}

	container.innerHTML = buildTablesHTML(
		selectedAdapter === "ALL"
			? adapters
			: selectedAdapter
				? [
						selectedAdapter,
					]
				: adapters,
	);
}

function buildTablesHTML(adaptersToRender: string[]): string {
	let html = "";

	for (const adapter of adaptersToRender) {
		const group = state.entries.filter(e => e.info.adapter === adapter);
		const verOrder = [
			"bun",
			"24",
			"22",
			"20",
		];
		group.sort((a, b) => {
			const ai = verOrder.indexOf(a.info.ver);
			const bi = verOrder.indexOf(b.info.ver);
			if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
			return a.info.os.localeCompare(b.info.os);
		});

		const firstEntry = group[0];
		const coreVer = firstEntry?.data.coreVersion;
		const adapterVer = firstEntry?.data.adapterVersion;
		const versionLine = coreVer
			? `<p>core: ${coreVer}${adapterVer ? ` | adapter: ${adapterVer}` : ""}</p>`
			: "";
		html += `<h3>${adapterName(adapter)} Adapter</h3>${versionLine}`;

		for (const [label, ops] of SECTIONS) {
			const present = ops.filter(op =>
				group.some(e => e.data.results.some(r => r.name === op)),
			);
			if (!present.length) continue;

			html += `<h4>${label}</h4>`;
			html += `<figure><table class="striped">`;
			html += `<thead><tr><th scope="col">Runtime / OS</th>`;

			for (const op of present) html += `<th scope="col">${shortOp(op)}</th>`;
			html += `</tr></thead><tbody>`;

			for (const e of group) {
				html += `<tr><td>${formatRuntime(e.info.ver)} / ${e.info.os}</td>`;
				for (const op of present) {
					const r = e.data.results.find(x => x.name === op);
					html += `<td>${r ? fmt(r.time) : "-"}</td>`;
				}
				html += `</tr>`;
			}

			html += `</tbody></table></figure>`;
		}
	}

	return html;
}

function buildMarkdown(adaptersToRender: string[]): string {
	const lines: string[] = [];
	lines.push("# ValtheraDB Benchmark Results");
	lines.push("");

	for (const adapter of adaptersToRender) {
		const group = state.entries.filter(e => e.info.adapter === adapter);
		const verOrder = [
			"bun",
			"24",
			"22",
			"20",
		];
		group.sort((a, b) => {
			const ai = verOrder.indexOf(a.info.ver);
			const bi = verOrder.indexOf(b.info.ver);
			if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
			return a.info.os.localeCompare(b.info.os);
		});

		const firstEntry = group[0];
		const coreVer = firstEntry?.data.coreVersion;
		const adapterVer = firstEntry?.data.adapterVersion;

		lines.push(`## ${adapterName(adapter)} Adapter`);
		if (coreVer) {
			lines.push(
				`core: ${coreVer}${adapterVer ? ` | adapter: ${adapterVer}` : ""}`,
			);
			lines.push("");
		}

		for (const [label, ops] of SECTIONS) {
			const present = ops.filter(op =>
				group.some(e => e.data.results.some(r => r.name === op)),
			);
			if (!present.length) continue;

			lines.push(`### ${label}`);
			lines.push("");

			const header = [
				"Runtime / OS",
				...present.map(shortOp),
			];
			lines.push(`| ${header.join(" | ")} |`);
			lines.push(`| ${header.map(() => "---").join(" | ")} |`);

			for (const e of group) {
				const cells = [
					`${formatRuntime(e.info.ver)} / ${e.info.os}`,
					...present.map(op => {
						const r = e.data.results.find(x => x.name === op);
						return r ? fmt(r.time) : "-";
					}),
				];
				lines.push(`| ${cells.join(" | ")} |`);
			}

			lines.push("");
		}
	}

	return lines.join("\n");
}

function downloadMarkdown() {
	const select = document.querySelector<HTMLSelectElement>(
		"#tables-adapter-select",
	);
	const adapters = [
		...new Set(state.entries.map(e => e.info.adapter)),
	].sort();
	const selected = select?.value ?? "ALL";
	const adaptersToRender =
		selected === "ALL"
			? adapters
			: [
					selected,
				];

	const md = buildMarkdown(adaptersToRender);
	const blob = new Blob(
		[
			md,
		],
		{
			type: "text/markdown",
		},
	);
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `benchmark-${selected === "ALL" ? "all" : selected}.md`;
	a.click();
	URL.revokeObjectURL(url);
}

export function initTablesDownload() {
	document
		.querySelector<HTMLButtonElement>("#tables-download-md")
		?.addEventListener("click", downloadMarkdown);
}
