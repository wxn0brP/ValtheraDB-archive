import {
	assertSafeFieldPath,
	COLLECTION_SRC,
	FIELD_SRC,
	parseReturn,
	stripIdentQuotes,
} from "../utils";

export function handleGet(query: string) {
	if (!/^GET\s+COLLECTIONS$/i.test(query)) {
		throw new Error("Invalid GET COLLECTIONS syntax.");
	}
	return parseReturn("getCollections");
}

export function handleCreate(query: string) {
	const match = query.match(
		new RegExp(
			`^CREATE\\s+(?:TABLE|COLLECTION)\\s+(IF\\s+NOT\\s+EXISTS\\s+)?(${COLLECTION_SRC}).*`,
			"i",
		),
	);
	if (!match) throw new Error("Invalid CREATE TABLE/COLLECTION syntax.");
	return parseReturn("ensureCollection", stripIdentQuotes(match[2]));
}

export function handleDrop(query: string) {
	const match = query.match(
		new RegExp(
			`^DROP\\s+(?:TABLE|COLLECTION)\\s+(?:IF\\s+EXISTS\\s+)?(${COLLECTION_SRC})$`,
			"i",
		),
	);
	if (!match) throw new Error("Invalid DROP TABLE/COLLECTION syntax.");
	return parseReturn("removeCollection", stripIdentQuotes(match[1]));
}

export function handleExists(query: string) {
	const match = query.match(
		new RegExp(`^EXISTS\\s+(?:TABLE|COLLECTION)\\s+(${COLLECTION_SRC})$`, "i"),
	);
	if (!match) throw new Error("Invalid EXISTS TABLE/COLLECTION syntax.");
	return parseReturn("issetCollection", stripIdentQuotes(match[1]));
}

export function handleCreateIndex(query: string) {
	const match = query.match(
		new RegExp(
			`^CREATE\\s+(UNIQUE\\s+)?INDEX\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${FIELD_SRC})\\s+ON\\s+(${COLLECTION_SRC})\\s*\\(([^)]+)\\)$`,
			"i",
		),
	);
	if (!match) throw new Error("Invalid CREATE INDEX syntax.");

	const fields = parseIndexFields(match[4]);
	const collection = stripIdentQuotes(match[3]);

	return parseReturn("createIndex", collection, {
		index: {
			collection,
			fields,
			opts: {
				unique: !!match[1],
				name: stripIdentQuotes(match[2]),
			},
		},
	});
}

export function handleDropIndex(query: string) {
	const match = query.match(
		new RegExp(
			`^DROP\\s+INDEX\\s+(?:IF\\s+EXISTS\\s+)?(${FIELD_SRC})\\s+ON\\s+(${COLLECTION_SRC})\\s*\\(([^)]+)\\)$`,
			"i",
		),
	);
	if (!match) throw new Error("Invalid DROP INDEX syntax.");

	const collection = stripIdentQuotes(match[2]);
	const fields = parseIndexFields(match[3]);

	return parseReturn("removeIndex", collection, {
		index: {
			collection,
			fields,
			opts: {
				name: stripIdentQuotes(match[1]),
			},
		},
	});
}

function parseIndexFields(raw: string): string[] {
	const fields = raw
		.split(",")
		.map(f => stripIdentQuotes(f))
		.filter(Boolean);
	if (!fields.length) throw new Error("Index requires at least one field");
	for (const field of fields) {
		assertSafeFieldPath(field, "index field");
		if (!/^[\w./]+$/.test(field))
			throw new Error(`Invalid index field '${field}'`);
	}
	return fields;
}
