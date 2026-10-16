export const operations = [
	{
		name: "add <collection> <data> [id_gen]",
		description: "Add a document to a collection",
		args: [
			"string",
			"object",
			"boolean",
		],
		min: 2,
	},
	{
		name: "find <collection> <search> [options] [findOpts] [context]",
		description: "Find documents in a collection",
		args: [
			"string",
			"object",
			"object",
			"object",
			"object",
		],
		min: 2,
	},
	{
		name: "count <collection> [search]",
		description: "Count documents in a collection",
		args: [
			"string",
			"object",
		],
		min: 2,
	},
	{
		name: "bulkAdd <collection> <data> [id_gen]",
		description: "Add multiple documents to a collection",
		args: [
			"string",
			"object",
			"boolean",
		],
		min: 2,
	},
	{
		name: "createIndex <collection> <fields> [opts]",
		description: "Create an index on a collection",
		args: [
			"string",
			"object",
			"object",
		],
		min: 2,
	},
	{
		name: "removeIndex <collection> <fields>",
		description: "Remove an index from a collection",
		args: [
			"string",
			"object",
		],
		min: 2,
	},
	{
		name: "findOne <collection> <search> [findOpts] [context]",
		description: "Find one document in a collection",
		args: [
			"string",
			"object",
			"object",
			"object",
		],
		min: 2,
	},
	{
		name: "update <collection> <search> <updater> [context]",
		description: "Update documents in a collection",
		args: [
			"string",
			"object",
			"object",
			"object",
		],
		min: 3,
	},
	{
		name: "updateOne <collection> <search> <updater> [context]",
		description: "Update one document in a collection",
		args: [
			"string",
			"object",
			"object",
			"object",
		],
		min: 3,
	},
	{
		name: "updateOneOrAdd <collection> <search> <updater> [add_arg]",
		description: "Update one document in a collection",
		args: [
			"string",
			"object",
			"object",
			"object",
		],
		min: 3,
	},
	{
		name: "remove <collection> <search> [context]",
		description: "Remove documents in a collection",
		args: [
			"string",
			"object",
			"object",
		],
		min: 2,
	},
	{
		name: "removeOne <collection> <search> [context]",
		description: "Remove one document in a collection",
		args: [
			"string",
			"object",
			"object",
		],
		min: 2,
	},
	{
		name: "toggleOne <collection> <data>",
		description: "Update one document in a collection",
		args: [
			"string",
			"object",
			"object",
		],
		min: 2,
	},
];

export const collectionOperations = [
	{
		name: "getCollections",
		description: "Get all collections",
		args: [],
		min: 0,
	},
	{
		name: "capabilities",
		description: "Describe what the underlying adapter supports",
		args: [],
		min: 0,
	},
	{
		name: "ensureCollection <collection>",
		description: "Ensure a collection exists",
		args: [
			"string",
		],
		min: 1,
	},
	{
		name: "issetCollection <collection>",
		description: "Check if a collection exists",
		args: [
			"string",
		],
		min: 1,
	},
	{
		name: "removeCollection <collection>",
		description: "Remove a collection",
		args: [
			"string",
		],
		min: 1,
	},
];
