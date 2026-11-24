import { type BenchResult } from "../run";

const REPO = "wxn0brP/ValtheraDB-benchmark";
const RESULTS_BRANCH = "results";

export interface CloudEntry {
	dir: string;
	adapter: string;
	runtime: string;
	os: string;
	results: BenchResult[];
}

export interface OpAverage {
	avg: number;
	count: number;
}

export interface CloudAverages {
	overall: Map<string, OpAverage>;
	adapters: Map<string, Map<string, OpAverage>>;
}

interface RawResultFile {
	os?: string;
	arch?: string;
	node?: string;
	bun?: string;
	adapter?: string;
	results: BenchResult[];
}

function normalize(results: BenchResult[]): BenchResult[] {
	const map = new Map<string, number[]>();
	for (const r of results) {
		const arr = map.get(r.name);
		if (arr) arr.push(r.time);
		else
			map.set(r.name, [
				r.time,
			]);
	}

	const out: BenchResult[] = [];
	for (const [name, times] of map) {
		out.push({
			name,
			time: times.reduce((a, b) => a + b, 0) / times.length,
		});
	}
	return out;
}

export async function fetchCloudEntries(): Promise<CloudEntry[]> {
	const treeRes = await fetch(
		`https://api.github.com/repos/${REPO}/git/trees/${RESULTS_BRANCH}?recursive=1`,
		{
			headers: {
				Accept: "application/vnd.github+json",
			},
		},
	);

	if (!treeRes.ok) {
		throw new Error(`GitHub API responded with ${treeRes.status}`);
	}

	const treeData = await treeRes.json();
	const paths: string[] = (treeData.tree ?? [])
		.filter((item: any) => item.path.endsWith("/result.json"))
		.map((item: any) => item.path);

	return Promise.all(
		paths.map(async path => {
			const res = await fetch(
				`https://raw.githubusercontent.com/${REPO}/${RESULTS_BRANCH}/${path}`,
			);
			if (!res.ok) {
				throw new Error(`Failed to fetch ${path} (${res.status})`);
			}

			const data: RawResultFile = await res.json();
			const dir = path.split("/")[0];
			const [adapter, runtime, os] = dir.split("__");

			return {
				dir,
				adapter,
				runtime,
				os,
				results: normalize(data.results ?? []),
			};
		}),
	);
}

function addTimes(map: Map<string, number[]>, results: BenchResult[]) {
	for (const r of results) {
		const arr = map.get(r.name);
		if (arr) arr.push(r.time);
		else
			map.set(r.name, [
				r.time,
			]);
	}
}

function toAverages(times: Map<string, number[]>): Map<string, OpAverage> {
	const out = new Map<string, OpAverage>();
	for (const [op, values] of times) {
		out.set(op, {
			avg: values.reduce((a, b) => a + b, 0) / values.length,
			count: values.length,
		});
	}
	return out;
}

export function buildCloudAverages(entries: CloudEntry[]): CloudAverages {
	const overallTimes = new Map<string, number[]>();
	const adapterTimes = new Map<string, Map<string, number[]>>();

	for (const entry of entries) {
		addTimes(overallTimes, entry.results);

		let times = adapterTimes.get(entry.adapter);
		if (!times) {
			times = new Map();
			adapterTimes.set(entry.adapter, times);
		}
		addTimes(times, entry.results);
	}

	const adapters = new Map<string, Map<string, OpAverage>>();
	for (const [adapter, times] of adapterTimes) {
		adapters.set(adapter, toAverages(times));
	}

	return {
		overall: toAverages(overallTimes),
		adapters,
	};
}
