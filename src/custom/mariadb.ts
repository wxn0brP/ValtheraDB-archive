export async function init(action: any) {
	await action.query(`CREATE TABLE IF NOT EXISTS ${action.table("users")} (
		\`_id\` VARCHAR(191) NOT NULL PRIMARY KEY,
		\`name\` LONGTEXT,
		\`age\` DOUBLE,
		\`email\` LONGTEXT,
		\`isActive\` TINYINT(1),
		\`createdAt\` DOUBLE
	)`);

	await action.query(`CREATE TABLE IF NOT EXISTS ${action.table("posts")} (
		\`_id\` VARCHAR(191) NOT NULL PRIMARY KEY,
		\`title\` LONGTEXT,
		\`author\` LONGTEXT,
		\`views\` DOUBLE,
		\`createdAt\` DOUBLE
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
