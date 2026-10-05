import { clearCache, loadFromCache, saveToCache } from "./cache";
import { renderCompare } from "./compare";
import {
	addLocalResult,
	loadLocalResultsIntoState,
	renderLocalResultsList,
} from "./local";
import { renderSummary } from "./summary";
import { renderTables, initTablesDownload } from "./tables";
import { ResultFile } from "./types";
import { normalize, parseEntry } from "./utils";
import { state } from "./var";

async function loadData() {
	const cached = loadFromCache();
	if (cached) {
		state.adapterConfig = cached.adapterConfig;
		state.entries = cached.entries;
		loadLocalResultsIntoState();
		document.querySelector<HTMLDivElement>("#loader").style.display = "none";
		document.querySelector<HTMLDivElement>("#content").style.display = "block";
		renderSummary();
		renderCompare();
		renderTables();
		initTablesDownload();
		renderLocalResultsList();
		return;
	}

	try {
		const configRes = await fetch("config.json");
		if (configRes.ok) state.adapterConfig = await configRes.json();

		const treeRes = await fetch(
			"https://api.github.com/repos/wxn0brP/ValtheraDB-benchmark/git/trees/results?recursive=1",
		);
		const treeData = await treeRes.json();

		const jsonPaths = treeData.tree
			.filter((item: any) => item.path.endsWith("/result.json"))
			.map((item: any) => item.path);

		const fetchPromises = jsonPaths.map(async (path: string) => {
			const rawUrl = `https://raw.githubusercontent.com/wxn0brP/ValtheraDB-benchmark/results/${path}`;
			const res = await fetch(rawUrl);
			const data: ResultFile = await res.json();

			const dir = path.split("/")[0];
			data.results = normalize(data.results);
			return {
				dir,
				info: parseEntry(dir),
				data,
			};
		});

		state.entries = await Promise.all(fetchPromises);
		loadLocalResultsIntoState();
		saveToCache();

		document.querySelector<HTMLDivElement>("#loader").style.display = "none";
		document.querySelector<HTMLDivElement>("#content").style.display = "block";

		renderSummary();
		renderCompare();
		renderTables();
		initTablesDownload();
		renderLocalResultsList();
	} catch (e) {
		console.error("Failed to load data", e);
		document.querySelector("#loader").innerHTML =
			`<p class="danger">Failed to load data. See console for details.</p>`;
	}
}

const hamburger = document.querySelector<HTMLButtonElement>(".hamburger");
const navLinks = document.querySelector("#nav-links");

hamburger.addEventListener("click", () => {
	const isOpen = navLinks.classList.toggle("open");
	hamburger.classList.toggle("open");
	hamburger.setAttribute("aria-expanded", String(isOpen));
});

navLinks.querySelectorAll("a").forEach(link => {
	link.addEventListener("click", () => {
		navLinks.classList.remove("open");
		hamburger.classList.remove("open");
		hamburger.setAttribute("aria-expanded", "false");
	});
});

document
	.querySelector<HTMLButtonElement>("#clear-cache")
	?.addEventListener("click", clearCache);

document
	.querySelector<HTMLButtonElement>("#upload-local-btn")
	?.addEventListener("click", async () => {
		const input = document.querySelector<HTMLInputElement>("#local-file-input");
		if (!input?.files?.length) {
			alert("Please select a file first");
			return;
		}
		const file = input.files[0];
		const success = await addLocalResult(file);
		if (success) {
			input.value = "";
			renderLocalResultsList();
		}
	});

loadData();
