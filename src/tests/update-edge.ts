import type { TestDefinition } from "../types";
import { isQueryValidationFailure } from "./query-error";

export const updateEdgeTests: TestDefinition[] = [
	...[
		"$inc",
		"$dec",
	].flatMap(operator => [
		{
			domain: "update-operators" as const,
			name: `update-${operator.slice(1)}-missing-field`,
			fn: async db => {
				await db.c("items").add({
					_id: "target",
				});
				await db.c("items").updateOne(
					{
						_id: "target",
					},
					{
						[operator]: {
							value: 3,
						},
					},
				);
				const stored = await db.c("items").findOne({
					_id: "target",
				});
				if (stored.value !== (operator === "$inc" ? 3 : -3))
					throw new Error(`${operator} must initialize a missing field`);
			},
		},
		...[
			"text",
			null,
		].map(value => ({
			domain: "update-operators" as const,
			name: `update-${operator.slice(1)}-rejects-${value === null ? "null" : "string"}`,
			fn: async db => {
				await db.c("items").add({
					_id: "target",
					value,
				});
				let caught: unknown;
				try {
					await db.c("items").updateOne(
						{
							_id: "target",
						},
						{
							[operator]: {
								value: 3,
							},
						},
					);
				} catch (error) {
					caught = error;
				}
				if (!isQueryValidationFailure(caught))
					throw new Error(
						`${operator} on a nonnumeric field must reject with QUERY_INVALID`,
					);
				const stored = await db.c("items").findOne({
					_id: "target",
				});
				if (stored.value !== value)
					throw new Error("Rejected update must preserve the field");
			},
		})),
	]),
	{
		domain: "update-operators",
		name: "update-merge-concatenates-arrays",
		fn: async db => {
			await db.c("items").add({
				_id: "target",
				values: [
					1,
					2,
				],
			});
			await db.c("items").updateOne(
				{
					_id: "target",
				},
				{
					$merge: {
						values: [
							2,
							3,
						],
					},
				},
			);
			const stored = await db.c("items").findOne({
				_id: "target",
			});
			if (JSON.stringify(stored.values) !== "[1,2,2,3]")
				throw new Error("$merge must concatenate arrays without deduplication");
		},
	},
	...(
		[
			"$merge",
			"$deepMerge",
		] as const
	).map(operator => ({
		domain: "update-operators" as const,
		name: `update-${operator.slice(1)}-nested-object-depth`,
		fn: async db => {
			await db.c("items").add({
				_id: "target",
				settings: {
					address: {
						city: "old",
						zip: "123",
					},
					active: true,
				},
			});
			await db.c("items").updateOne(
				{
					_id: "target",
				},
				{
					[operator]: {
						settings: {
							address: {
								city: "new",
							},
						},
					},
				},
			);
			const stored = await db.c("items").findOne({
				_id: "target",
			});
			if (
				stored.settings.address.city !== "new" ||
				stored.settings.address.zip !== "123" ||
				stored.settings.active !== true
			)
				throw new Error(`${operator} has incorrect merge depth`);
		},
	})),
	{
		domain: "composite-operations",
		name: "upsert-add-argument-precedence",
		fn: async db => {
			const result = await db.c("items").updateOneOrAdd(
				{
					_id: "target",
					value: "search",
					searchOnly: true,
				},
				{
					value: "update",
					updateOnly: true,
				},
				{
					add_arg: {
						value: "add",
						addOnly: true,
					},
				},
			);
			const stored = await db.c("items").findOne({
				_id: "target",
			});
			if (
				result.type !== "added" ||
				stored.value !== "add" ||
				!stored.searchOnly ||
				!stored.updateOnly ||
				!stored.addOnly
			)
				throw new Error(
					"Insert must combine search, updater and add_arg in precedence order",
				);
		},
	},
	{
		domain: "composite-operations",
		name: "upsert-update-ignores-add-argument",
		fn: async db => {
			await db.c("items").add({
				_id: "target",
				value: "old",
			});
			const result = await db.c("items").updateOneOrAdd(
				{
					_id: "target",
				},
				{
					value: "update",
				},
				{
					add_arg: {
						value: "add",
						addOnly: true,
					},
				},
			);
			const stored = await db.c("items").findOne({
				_id: "target",
			});
			if (
				result.type !== "updated" ||
				stored.value !== "update" ||
				Object.hasOwn(stored, "addOnly")
			)
				throw new Error("Update branch must ignore add_arg");
		},
	},
	{
		domain: "composite-operations",
		name: "toggle-data-overrides-search",
		fn: async db => {
			const result = await db.c("items").toggleOne(
				{
					_id: "target",
					value: "search",
					retained: true,
				},
				{
					value: "data",
				},
			);
			const stored = await db.c("items").findOne({
				_id: "target",
			});
			if (
				result.type !== "added" ||
				stored.value !== "data" ||
				stored.retained !== true
			)
				throw new Error("Toggle insert must prefer data over search");
		},
	},
];
