import type { TestDefinition } from "../types";

export const queryPipelineTests: TestDefinition[] = [
	{
		domain: "find-options",
		name: "pipeline-infinity-with-offset-and-sort",
		fn: async db => {
			await db.c("items").bulkAdd(
				[
					5,
					1,
					4,
					2,
					3,
				].map(value => ({
					value,
				})),
			);
			for (const sortBy of [
				undefined,
				"value",
			]) {
				const expected = await db.c("items").find(
					{},
					{
						offset: 2,
						sortBy,
					},
				);
				const actual = await db.c("items").find(
					{},
					{
						offset: 2,
						sortBy,
						limit: Infinity,
					},
				);
				if (
					actual.length !== 3 ||
					JSON.stringify(actual) !== JSON.stringify(expected)
				)
					throw new Error("Infinity must preserve all rows after offset");
			}
		},
	},
	{
		domain: "find-options",
		name: "pipeline-aggregate-before-sort-and-pagination",
		fn: async db => {
			await db.c("items").bulkAdd([
				{
					group: "a",
					value: 10,
				},
				{
					group: "b",
					value: 30,
				},
				{
					group: "c",
					value: 25,
				},
				{
					group: "a",
					value: 30,
				},
				{
					group: "b",
					value: 20,
				},
				{
					group: "c",
					value: 35,
				},
			]);
			const result = await db.c("items").find(
				{},
				{
					groupBy: "group",
					sum: {
						total: "value",
					},
					sortBy: "total",
					sortAsc: false,
					offset: 1,
					limit: 1,
				},
			);
			if (
				result.length !== 1 ||
				result[0].group !== "b" ||
				result[0].total !== 50
			)
				throw new Error(
					`Expected group b with total 50, got ${JSON.stringify(result)}`,
				);
		},
	},
	{
		domain: "find-options",
		name: "pipeline-distinct-before-sort-keeps-first",
		fn: async db => {
			await db.c("items").bulkAdd([
				{
					group: "a",
					value: 1,
				},
				{
					group: "a",
					value: 99,
				},
				{
					group: "b",
					value: 5,
				},
			]);
			const result = await db.c("items").find(
				{},
				{
					distinct: "group",
					sortBy: "value",
					sortAsc: false,
				},
			);
			if (JSON.stringify(result.map(row => row.value)) !== "[5,1]")
				throw new Error("Distinct must keep the first row before sorting");
		},
	},
	{
		domain: "find-options",
		name: "pipeline-distinct-after-aggregation",
		fn: async db => {
			await db.c("items").bulkAdd([
				{
					group: "a",
					value: 1,
				},
				{
					group: "a",
					value: 2,
				},
				{
					group: "b",
					value: 3,
				},
				{
					group: "c",
					value: 4,
				},
			]);
			const result = await db.c("items").find(
				{},
				{
					groupBy: "group",
					sum: {
						total: "value",
					},
					distinct: "total",
					sortBy: "total",
				},
			);
			if (JSON.stringify(result.map(row => row.total)) !== "[3,4]")
				throw new Error("Distinct must deduplicate aggregated totals");
		},
	},
	{
		domain: "find-options",
		name: "pipeline-count-includes-falsy-values",
		fn: async db => {
			await db.c("items").bulkAdd([
				{
					value: 0,
				},
				{
					value: false,
				},
				{
					value: "",
				},
				{
					value: null,
				},
				{},
			]);
			const result = await db.c("items").find(
				{},
				{
					count: {
						total: "value",
					},
				},
			);
			if (result.length !== 1 || result[0].total !== 3)
				throw new Error(
					"Aggregate count must include 0, false and empty string",
				);
		},
	},
	{
		domain: "find-options",
		name: "pipeline-nonnumeric-aggregations-return-null",
		fn: async db => {
			await db.c("items").bulkAdd([
				{
					group: "a",
					value: "5",
				},
				{
					group: "a",
					value: null,
				},
				{
					group: "a",
				},
			]);
			const result = await db.c("items").find(
				{},
				{
					groupBy: "group",
					min: {
						low: "value",
					},
					max: {
						high: "value",
					},
					avg: {
						mean: "value",
					},
					sum: {
						total: "value",
					},
				},
			);
			if (
				result.length !== 1 ||
				[
					"low",
					"high",
					"mean",
					"total",
				].some(key => result[0][key] !== null)
			)
				throw new Error(
					`Expected null aggregates, got ${JSON.stringify(result)}`,
				);
		},
	},
];
