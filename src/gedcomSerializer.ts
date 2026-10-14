function serializeProperty(
	tag: string,
	value: any,
	level: number,
	lines: string[],
) {
	if (Array.isArray(value)) {
		for (const item of value) {
			serializeProperty(tag, item, level, lines);
		}
		return;
	}

	if (typeof value === "object" && value !== null) {
		const val = value._value ?? "";
		if (val !== "") {
			lines.push(`${level} ${tag} ${val}`);
		} else {
			lines.push(`${level} ${tag}`);
		}

		for (const [k, v] of Object.entries(value)) {
			if (k === "_value") continue;
			serializeProperty(k, v, level + 1, lines);
		}
	} else {
		const strValue = String(value ?? "");
		if (strValue !== "") {
			lines.push(`${level} ${tag} ${strValue}`);
		} else {
			lines.push(`${level} ${tag}`);
		}
	}
}

export function serializeCollections(
	collections: Map<string, Record<string, any>[]>,
) {
	const lines: string[] = [];

	const headerDocs = collections.get("HEAD");
	if (headerDocs && headerDocs.length > 0) {
		const headerDoc = headerDocs[0];
		lines.push("0 HEAD");
		for (const [key, val] of Object.entries(headerDoc)) {
			if (key === "_id") continue;
			serializeProperty(key, val, 1, lines);
		}
	} else {
		lines.push("0 HEAD");
		lines.push("1 GEDC");
		lines.push("2 VERS 7.0");
		lines.push("2 FORM LINEAGE-LINKED");
		lines.push("1 CHAR UTF-8");
	}

	for (const [collection, docs] of collections) {
		if (collection === "HEAD" || collection === "TRLR") continue;

		for (const doc of docs) {
			const id = doc._id;
			const isXref =
				id && typeof id === "string" && id.startsWith("@") && id.endsWith("@");

			if (isXref) {
				lines.push(`0 ${id} ${collection}`);
			} else {
				lines.push(`0 ${collection}`);
			}

			for (const [key, val] of Object.entries(doc)) {
				if (key === "_id") continue;
				serializeProperty(key, val, 1, lines);
			}
		}
	}

	lines.push("0 TRLR");

	return lines.join("\n") + "\n";
}
