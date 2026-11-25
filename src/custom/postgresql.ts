export async function init(action: any) {
	await action.query(`CREATE TABLE IF NOT EXISTS ${action.table("users")} (
		"_id" TEXT PRIMARY KEY,
		"name" TEXT,
		"age" DOUBLE PRECISION,
		"email" TEXT,
		"isActive" BOOLEAN,
		"createdAt" DOUBLE PRECISION
	)`);

	await action.query(`CREATE TABLE IF NOT EXISTS ${action.table("posts")} (
		"_id" TEXT PRIMARY KEY,
		"title" TEXT,
		"author" TEXT,
		"views" DOUBLE PRECISION,
		"createdAt" DOUBLE PRECISION
	)`);

	await action.createIndex({
		collection: "users",
		index: {
			fields: [
				"isActive",
			],
		},
	});
	await action.createIndex({
		collection: "users",
		index: {
			fields: [
				"age",
			],
		},
	});
}

export async function onAfterAdd(action: any) {
	await action.createIndex({
		collection: "posts",
		index: {
			fields: [
				"views",
			],
		},
	});
}
