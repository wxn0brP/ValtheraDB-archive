import type { TestDefinition } from "../types";

const cases = [
	{
		name: "empty-select",
		options: {
			select: [],
		},
		expected: {},
	},
	{
		name: "empty-exclude",
		options: {
			exclude: [],
		},
		expected: {
			_id: "p",
			profile: {
				name: "Alice",
				age: 30,
			},
			users: [
				{
					name: "Bob",
				},
			],
			secret: "hidden",
		},
	},
	{
		name: "missing-select",
		options: {
			select: [
				"missing",
				"profile.missing",
			],
		},
		expected: {},
	},
	{
		name: "missing-exclude",
		options: {
			exclude: [
				"missing",
				"profile.missing",
			],
			select: [
				"profile",
			],
		},
		expected: {
			profile: {
				name: "Alice",
				age: 30,
			},
		},
	},
	{
		name: "dotted-select",
		options: {
			select: [
				"profile.name",
			],
		},
		expected: {
			profile: {
				name: "Alice",
			},
		},
	},
	{
		name: "array-path-select",
		options: {
			select: [
				[
					"profile",
					"name",
				],
			],
		},
		expected: {
			profile: {
				name: "Alice",
			},
		},
	},
	{
		name: "nested-exclude",
		options: {
			exclude: [
				"profile.age",
			],
			select: [
				"profile",
			],
		},
		expected: {
			profile: {
				name: "Alice",
			},
		},
	},
	{
		name: "array-path-exclude",
		options: {
			exclude: [
				[
					"profile",
					"age",
				],
			],
			select: [
				"profile",
			],
		},
		expected: {
			profile: {
				name: "Alice",
			},
		},
	},
	{
		name: "no-array-traversal",
		options: {
			select: [
				"users.name",
			],
		},
		expected: {},
	},
	{
		name: "numeric-array-path",
		options: {
			select: [
				"users.0.name",
			],
		},
		expected: {
			users: {
				"0": {
					name: "Bob",
				},
			},
		},
	},
	{
		name: "transform-exclude-select-order",
		options: {
			transform: (doc: any) => ({
				...doc,
				label: doc.secret,
				secret: "changed",
				extra: true,
			}),
			exclude: [
				"secret",
			],
			select: [
				"label",
				"secret",
				"extra",
			],
		},
		expected: {
			label: "hidden",
			extra: true,
		},
	},
];

export const projectionEdgeTests: TestDefinition[] = cases.flatMap(
	({ name, options, expected }) =>
		(
			[
				"find",
				"findOne",
			] as const
		).map(method => ({
			domain: "find-options" as const,
			name: `projection-${method}-${name}`,
			fn: async db => {
				await db.c("projection").add({
					_id: "p",
					profile: {
						name: "Alice",
						age: 30,
					},
					users: [
						{
							name: "Bob",
						},
					],
					secret: "hidden",
				});
				const query = {
					collection: "projection",
					search: {
						_id: "p",
					},
					findOpts: options,
				};
				const result =
					method === "find"
						? (await db.find(query))[0]
						: await db.findOne(query);
				if (JSON.stringify(result) !== JSON.stringify(expected))
					throw new Error(
						`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(result)}`,
					);
				const stored = await db.c("projection").findOne({
					_id: "p",
				});
				if (stored.secret !== "hidden" || stored.profile.age !== 30)
					throw new Error("Projection must not change stored data");
			},
		})),
);
