import SQLParser from "#sql";
import { describe, expect, test } from "bun:test";

const sqlParser = new SQLParser();

describe("SQL Parser - SELECT", () => {
	test("1. should parse a simple SELECT query", () => {
		const query = "SELECT * FROM users WHERE id = 1";
		const parsedQuery = sqlParser.parse(query);

		expect(parsedQuery).toBeDefined();
		expect(parsedQuery.method).toBe("find");
		expect(parsedQuery.query.collection).toBe("users"); // collection name
		expect(parsedQuery.query.search).toEqual({
			id: 1,
		}); // where clause
	});

	test("1b. should parse a simple SELECT query without spaces", () => {
		const query = "SELECT * FROM users WHERE id=1";
		const parsedQuery = sqlParser.parse(query);

		expect(parsedQuery).toBeDefined();
		expect(parsedQuery.method).toBe("find");
		expect(parsedQuery.query.collection).toBe("users"); // collection name
		expect(parsedQuery.query.search).toEqual({
			id: 1,
		}); // where clause
	});

	test("2. should parse a SELECT query with specific columns", () => {
		const query = "SELECT name, email FROM users WHERE active = 1";
		const parsedQuery = sqlParser.parse(query);

		expect(parsedQuery).toBeDefined();
		expect(parsedQuery.method).toBe("find");
		expect(parsedQuery.query.collection).toBe("users"); // collection name
		expect(parsedQuery.query.search).toEqual({
			active: 1,
		}); // where clause
		expect(parsedQuery.query.findOpts).toEqual({
			select: [
				"name",
				"email",
			],
		}); // select options
	});

	test("2b. should parse a SELECT query with NOT IN", () => {
		const query = "SELECT * FROM users WHERE status NOT IN (1, 2)";
		const parsedQuery = sqlParser.parse(query);

		expect(parsedQuery).toBeDefined();
		expect(parsedQuery.method).toBe("find");
		expect(parsedQuery.query.collection).toBe("users"); // collection name
		expect(parsedQuery.query.search).toEqual({
			$nin: {
				status: [
					1,
					2,
				],
			},
		}); // where clause
	});

	test("3. should parse a SELECT query without WHERE clause", () => {
		const query = "SELECT * FROM users";
		const parsedQuery = sqlParser.parse(query);

		expect(parsedQuery).toBeDefined();
		expect(parsedQuery.method).toBe("find");
		expect(parsedQuery.query.collection).toBe("users"); // collection name
		expect(parsedQuery.query.search).toEqual({}); // empty where clause
	});

	test("4. should parse a SELECT query with EXCLUDE clause", () => {
		const query =
			"SELECT * EXCLUDE password, createdAt FROM users WHERE active = 1";
		const parsedQuery = sqlParser.parse(query);

		expect(parsedQuery).toBeDefined();
		expect(parsedQuery.method).toBe("find");
		expect(parsedQuery.query.collection).toBe("users"); // collection name
		expect(parsedQuery.query.search).toEqual({
			active: 1,
		}); // where clause
		expect(parsedQuery.query.findOpts).toEqual({
			exclude: [
				"password",
				"createdAt",
			],
		}); // exclude options
	});

	test("5. should parse a SELECT query with complex WHERE conditions", () => {
		const query = "SELECT * FROM users WHERE age > 18 AND status = 'active'";
		const parsedQuery = sqlParser.parse(query);

		expect(parsedQuery).toBeDefined();
		expect(parsedQuery.method).toBe("find");
		expect(parsedQuery.query.collection).toBe("users"); // collection name
		expect(parsedQuery.query.search).toEqual({
			$gt: {
				age: 18,
			},
			status: "active",
		}); // where clause
	});

	test("6. should parse a SELECT query with a JOIN clause", () => {
		const query =
			"SELECT posts.*, users.name FROM posts JOIN users ON posts.userId = users.id WHERE posts.id = 1";
		const parsedQuery = sqlParser.parse(query, {
			defaultDbKey: "db",
		});

		expect(parsedQuery).toBeDefined();
		expect(parsedQuery.method).toBe("relation-find");
		expect(parsedQuery.relation).toHaveLength(5);
		expect(parsedQuery.query).toEqual({});
		expect(parsedQuery.relation[0]).toEqual([
			"db",
			"posts",
		]); // path
		expect(parsedQuery.relation[1]).toEqual({
			id: 1,
		}); // where clause
		expect(parsedQuery.relation[2]).toEqual({
			users: {
				type: "1n",
				path: [
					"db",
					"users",
				],
				pk: "userId",
				fk: "id",
				as: "users",
			},
		}); // relations
		expect(parsedQuery.relation[3]).toEqual({
			select: [
				"posts.*",
				"users.name",
			],
		}); // select options
		expect(parsedQuery.relation[4]).toEqual({}); // db find options
	});

	test("7. should throw error for invalid SELECT syntax", () => {
		const query = "SELECT FROM users";

		expect(() => {
			sqlParser.parse(query);
		}).toThrow();
	});

	test("8. should parse LIKE operator", () => {
		const query = "SELECT * FROM users WHERE name LIKE '%John%'";
		const parsedQuery = sqlParser.parse(query);
		expect(parsedQuery.query.search).toEqual({
			$regex: {
				name: /^.*John.*$/,
			},
		});
	});

	test("8b. should parse NOT LIKE operator", () => {
		const query = "SELECT * FROM users WHERE name NOT LIKE '%John%'";
		const parsedQuery = sqlParser.parse(query);
		expect(parsedQuery.query.search).toEqual({
			$not: {
				$regex: {
					name: /^.*John.*$/,
				},
			},
		});
	});

	test("9. should parse IS NULL operator", () => {
		const query = "SELECT * FROM users WHERE deletedAt IS NULL";
		const parsedQuery = sqlParser.parse(query);
		expect(parsedQuery.query.search).toEqual({
			deletedAt: null,
		});
	});

	test("9b. should parse IS NOT NULL operator", () => {
		const query = "SELECT * FROM users WHERE deletedAt IS NOT NULL";
		const parsedQuery = sqlParser.parse(query);
		expect(parsedQuery.query.search).toEqual({
			$not: {
				deletedAt: null,
			},
		});
	});

	test("10. should parse NOT ANY operator (alias for NOT IN)", () => {
		const query = "SELECT * FROM users WHERE status NOT ANY (1, 2)";
		const parsedQuery = sqlParser.parse(query);
		expect(parsedQuery.query.search).toEqual({
			$nin: {
				status: [
					1,
					2,
				],
			},
		});
	});

	test("11. should parse ILIKE operator (case insensitive LIKE)", () => {
		const query = "SELECT * FROM users WHERE name ILIKE '%john%'";
		const parsedQuery = sqlParser.parse(query);
		expect(parsedQuery.query.search).toEqual({
			$regex: {
				name: /^.*john.*$/i,
			},
		});
	});

	test("11b. should parse NOT ILIKE operator", () => {
		const query = "SELECT * FROM users WHERE name NOT ILIKE '%john%'";
		const parsedQuery = sqlParser.parse(query);
		expect(parsedQuery.query.search).toEqual({
			$not: {
				$regex: {
					name: /^.*john.*$/i,
				},
			},
		});
	});

	test("12. should parse BETWEEN operator", () => {
		const query = "SELECT * FROM users WHERE age BETWEEN 18 AND 30";
		const parsedQuery = sqlParser.parse(query);
		expect(parsedQuery.query.search).toEqual({
			$between: {
				age: [
					18,
					30,
				],
			},
		});
	});

	test("12b. should parse NOT BETWEEN operator", () => {
		const query = "SELECT * FROM users WHERE age NOT BETWEEN 18 AND 30";
		const parsedQuery = sqlParser.parse(query);
		expect(parsedQuery.query.search).toEqual({
			$not: {
				$between: {
					age: [
						18,
						30,
					],
				},
			},
		});
	});

	test("13. should parse ORDER BY with default ascending sort", () => {
		const query = "SELECT * FROM users ORDER BY name";
		const parsedQuery = sqlParser.parse(query);

		expect(parsedQuery.query.search).toEqual({});
		expect(parsedQuery.query.dbFindOpts).toEqual({
			sortBy: "name",
			sortAsc: true,
		});
	});

	test("13b. should parse ORDER BY DESC", () => {
		const query = "SELECT * FROM users ORDER BY age DESC";
		const parsedQuery = sqlParser.parse(query);

		expect(parsedQuery.query.dbFindOpts).toEqual({
			sortBy: "age",
			sortAsc: false,
		});
	});

	test("14. should parse LIMIT", () => {
		const query = "SELECT * FROM users LIMIT 10";
		const parsedQuery = sqlParser.parse(query);

		expect(parsedQuery.query.dbFindOpts).toEqual({
			limit: 10,
		});
	});

	test("15. should parse OFFSET", () => {
		const query = "SELECT * FROM users OFFSET 20";
		const parsedQuery = sqlParser.parse(query);

		expect(parsedQuery.query.dbFindOpts).toEqual({
			offset: 20,
		});
	});

	test("16. should parse WHERE with ORDER BY, LIMIT and OFFSET", () => {
		const query =
			"SELECT * FROM users WHERE active = 1 ORDER BY name DESC LIMIT 10 OFFSET 20";
		const parsedQuery = sqlParser.parse(query);

		expect(parsedQuery.query.search).toEqual({
			active: 1,
		});
		expect(parsedQuery.query.dbFindOpts).toEqual({
			sortBy: "name",
			sortAsc: false,
			limit: 10,
			offset: 20,
		});
	});

	test("17. should keep projection separate from dbFindOpts", () => {
		const query = "SELECT name FROM users ORDER BY name LIMIT 5";
		const parsedQuery = sqlParser.parse(query);

		expect(parsedQuery.query.findOpts).toEqual({
			select: [
				"name",
			],
		});
		expect(parsedQuery.query.dbFindOpts).toEqual({
			sortBy: "name",
			sortAsc: true,
			limit: 5,
		});
	});

	test("18. should pass dbFindOpts to relation-find", () => {
		const query =
			"SELECT posts.*, users.name FROM posts JOIN users ON posts.userId = users.id WHERE posts.id = 1 ORDER BY posts.createdAt DESC LIMIT 5 OFFSET 10";
		const parsedQuery = sqlParser.parse(query, {
			defaultDbKey: "db",
		});

		expect(parsedQuery.method).toBe("relation-find");
		expect(parsedQuery.relation?.[4]).toEqual({
			sortBy: "posts.createdAt",
			sortAsc: false,
			limit: 5,
			offset: 10,
		});
	});

	test("18b. should not treat limit or offset fields in WHERE as clauses", () => {
		const query =
			"SELECT * FROM users WHERE limit = 1 AND offset = 2 LIMIT 5 OFFSET 10";
		const parsedQuery = sqlParser.parse(query);

		expect(parsedQuery.query.search).toEqual({
			limit: 1,
			offset: 2,
		});
		expect(parsedQuery.query.dbFindOpts).toEqual({
			limit: 5,
			offset: 10,
		});
	});

	test("19. should throw for invalid LIMIT", () => {
		expect(() => sqlParser.parse("SELECT * FROM users LIMIT abc")).toThrow(
			"Invalid LIMIT value",
		);
		expect(() => sqlParser.parse("SELECT * FROM users LIMIT -1")).toThrow(
			"Invalid LIMIT value",
		);
	});

	test("20. should throw for invalid OFFSET", () => {
		expect(() => sqlParser.parse("SELECT * FROM users OFFSET abc")).toThrow(
			"Invalid OFFSET value",
		);
	});

	test("21. should throw for invalid ORDER BY", () => {
		expect(() => sqlParser.parse("SELECT * FROM users ORDER BY")).toThrow(
			"Invalid ORDER BY syntax",
		);
	});

	test("22. should parse ORDER BY random()", () => {
		const query = "SELECT * FROM users ORDER BY random()";
		const parsedQuery = sqlParser.parse(query);

		expect(parsedQuery.query.dbFindOpts).toEqual({
			sortBy: "random()",
		});
	});

	test("23. should parse REVERSE", () => {
		const query = "SELECT * FROM users REVERSE LIMIT 5";
		const parsedQuery = sqlParser.parse(query);

		expect(parsedQuery.query.dbFindOpts).toEqual({
			reverse: true,
			limit: 5,
		});
	});

	test("24. should parse aggregate select functions", () => {
		const query =
			"SELECT MIN(age) AS minAge, MAX(age) AS maxAge, AVG(score) AS avgScore, COUNT(email) AS emailCount FROM users";
		const parsedQuery = sqlParser.parse(query);

		expect(parsedQuery.query.findOpts).toEqual({});
		expect(parsedQuery.query.dbFindOpts).toEqual({
			min: {
				minAge: "age",
			},
			max: {
				maxAge: "age",
			},
			avg: {
				avgScore: "score",
			},
			count: {
				emailCount: "email",
			},
		});
	});

	test("25. should parse aggregate select functions without aliases", () => {
		const query =
			"SELECT MIN(age), MAX(user.score), AVG(profile.rating), COUNT(email) FROM users";
		const parsedQuery = sqlParser.parse(query);

		expect(parsedQuery.query.dbFindOpts).toEqual({
			min: {
				min_age: "age",
			},
			max: {
				max_user_score: "user.score",
			},
			avg: {
				avg_profile_rating: "profile.rating",
			},
			count: {
				count_email: "email",
			},
		});
	});

	test("26. should parse GROUP BY", () => {
		const query = "SELECT COUNT(email) AS usersCount FROM users GROUP BY city";
		const parsedQuery = sqlParser.parse(query);

		expect(parsedQuery.query.dbFindOpts).toEqual({
			count: {
				usersCount: "email",
			},
			groupBy: "city",
		});
	});

	test("27. should parse multiple GROUP BY fields with ORDER BY, LIMIT and OFFSET", () => {
		const query =
			"SELECT COUNT(email) AS usersCount, AVG(age) AS avgAge FROM users WHERE active = 1 GROUP BY city, status ORDER BY avgAge DESC LIMIT 10 OFFSET 20";
		const parsedQuery = sqlParser.parse(query);

		expect(parsedQuery.query.search).toEqual({
			active: 1,
		});
		expect(parsedQuery.query.dbFindOpts).toEqual({
			count: {
				usersCount: "email",
			},
			avg: {
				avgAge: "age",
			},
			groupBy: [
				"city",
				"status",
			],
			sortBy: "avgAge",
			sortAsc: false,
			limit: 10,
			offset: 20,
		});
	});

	test("28. should pass aggregate dbFindOpts to relation-find", () => {
		const query =
			"SELECT COUNT(posts.id) AS postsCount FROM posts JOIN users ON posts.userId = users.id GROUP BY posts.userId ORDER BY postsCount DESC LIMIT 10";
		const parsedQuery = sqlParser.parse(query, {
			defaultDbKey: "db",
		});

		expect(parsedQuery.method).toBe("relation-find");
		expect(parsedQuery.relation?.[3]).toEqual({});
		expect(parsedQuery.relation?.[4]).toEqual({
			count: {
				postsCount: "posts.id",
			},
			groupBy: "posts.userId",
			sortBy: "postsCount",
			sortAsc: false,
			limit: 10,
		});
	});

	test("29. should throw for invalid GROUP BY", () => {
		expect(() =>
			sqlParser.parse("SELECT COUNT(id) FROM users GROUP BY"),
		).toThrow("Invalid GROUP BY syntax");
	});

	test("30. should explain missing SELECT list", () => {
		expect(() => sqlParser.parse("SELECT FROM users")).toThrow(
			"Invalid SELECT syntax: missing select list before FROM",
		);
	});

	test("31. should explain WHERE key with missing value", () => {
		expect(() => sqlParser.parse("SELECT * FROM users WHERE name =")).toThrow(
			"Invalid WHERE condition for key 'name': missing value",
		);
	});

	test("32. should explain unsupported WHERE operator for key", () => {
		expect(() =>
			sqlParser.parse("SELECT * FROM users WHERE name CONTAINS 'John'"),
		).toThrow("Unsupported WHERE operator 'CONTAINS' for key 'name'");
	});

	test("33. should explain invalid WHERE value for key", () => {
		expect(() =>
			sqlParser.parse("SELECT * FROM users WHERE name === 'John'"),
		).toThrow("Invalid value for WHERE key 'name'");
	});

	test("34. should explain dangling WHERE operator", () => {
		expect(() =>
			sqlParser.parse("SELECT * FROM users WHERE active = 1 AND"),
		).toThrow("Dangling WHERE operator 'AND'");
	});

	test("35. should explain unmatched opening parenthesis in WHERE", () => {
		expect(() =>
			sqlParser.parse("SELECT * FROM users WHERE (active = 1"),
		).toThrow("Unmatched opening parenthesis in WHERE clause");
	});

	test("36. should explain invalid aggregate expression", () => {
		expect(() => sqlParser.parse("SELECT COUNT() FROM users")).toThrow(
			"Invalid aggregate expression 'COUNT()'",
		);
	});

	test("37. should parse SELECT COUNT(*) as count", () => {
		const query = "SELECT COUNT(*) FROM users";
		const parsedQuery = sqlParser.parse(query);

		expect(parsedQuery.method).toBe("count");
		expect(parsedQuery.query.collection).toBe("users");
		expect(parsedQuery.query.search).toEqual({});
	});

	test("38. should parse SELECT COUNT(*) with WHERE as count", () => {
		const query = "SELECT COUNT(*) FROM users WHERE active = 1 AND age > 30";
		const parsedQuery = sqlParser.parse(query);

		expect(parsedQuery.method).toBe("count");
		expect(parsedQuery.query.collection).toBe("users");
		expect(parsedQuery.query.search).toEqual({
			active: 1,
			$gt: {
				age: 30,
			},
		});
	});

	test("39. should parse SELECT count( * ) with spaces", () => {
		const query = "SELECT count( * ) FROM users";
		const parsedQuery = sqlParser.parse(query);

		expect(parsedQuery.method).toBe("count");
		expect(parsedQuery.query.collection).toBe("users");
		expect(parsedQuery.query.search).toEqual({});
	});

	test("40. should throw for COUNT(*) with GROUP BY", () => {
		expect(() =>
			sqlParser.parse("SELECT COUNT(*) FROM users GROUP BY city"),
		).toThrow("COUNT(*) does not support GROUP BY");
	});

	test("41. should throw for COUNT(*) mixed with other columns", () => {
		expect(() => sqlParser.parse("SELECT COUNT(*), name FROM users")).toThrow(
			"COUNT(*) must be used alone, not with other columns",
		);
	});

	test("42. should throw for COUNT(*) with JOIN", () => {
		expect(() =>
			sqlParser.parse(
				"SELECT COUNT(*) FROM posts JOIN users ON posts.userId = users.id",
			),
		).toThrow("COUNT(*) does not support JOIN");
	});

	test("43. should throw for COUNT(*) with LIMIT", () => {
		expect(() => sqlParser.parse("SELECT COUNT(*) FROM users LIMIT 5")).toThrow(
			"COUNT(*) does not support LIMIT",
		);
	});

	test("44. should throw for COUNT(*) with ORDER BY", () => {
		expect(() =>
			sqlParser.parse("SELECT COUNT(*) FROM users ORDER BY name"),
		).toThrow("COUNT(*) does not support ORDER BY");
	});

	test("45. should keep find for LIMIT 1 (SQL returns a set)", () => {
		const query = "SELECT * FROM users WHERE id = 1 LIMIT 1";
		const parsedQuery = sqlParser.parse(query);

		expect(parsedQuery.method).toBe("find");
		expect(parsedQuery.query.collection).toBe("users");
		expect(parsedQuery.query.search).toEqual({
			id: 1,
		});
		expect(parsedQuery.query.dbFindOpts).toEqual({
			limit: 1,
		});
	});

	test("46. should strip backticks from quoted identifiers", () => {
		const parsedQuery = sqlParser.parse("SELECT `name` FROM `users`;");

		expect(parsedQuery.method).toBe("find");
		expect(parsedQuery.query.collection).toBe("users");
		expect(parsedQuery.query.findOpts).toEqual({
			select: [
				"name",
			],
		});
	});

	test("47. should strip quotes from WHERE, ORDER BY and GROUP BY fields", () => {
		const query =
			"SELECT `city` FROM `users` WHERE `status` = 'active' ORDER BY `name` DESC";
		const parsedQuery = sqlParser.parse(query);

		expect(parsedQuery.query.search).toEqual({
			status: "active",
		});
		expect(parsedQuery.query.dbFindOpts).toEqual({
			sortBy: "name",
			sortAsc: false,
		});
	});

	test("48. should drop table qualifier and AS alias from select list", () => {
		const parsedQuery = sqlParser.parse(
			"SELECT `users`.`name` AS n, email FROM users",
		);

		expect(parsedQuery.query.findOpts).toEqual({
			select: [
				"name",
				"email",
			],
		});
	});

	test("49. should keep quoted keys with dots and spaces", () => {
		const parsedQuery = sqlParser.parse(
			"SELECT name FROM users WHERE `a.b` = 1 AND `first name` = 'John'",
		);

		expect(parsedQuery.query.search).toEqual({
			"a.b": 1,
			"first name": "John",
		});
	});

	test("50. should parse quoted aggregate fields and aliases", () => {
		const parsedQuery = sqlParser.parse(
			"SELECT MIN(`age`) AS `minAge` FROM `users` GROUP BY `city`",
		);

		expect(parsedQuery.query.dbFindOpts).toEqual({
			min: {
				minAge: "age",
			},
			groupBy: "city",
		});
	});

	test("51. should parse quoted identifiers in JOIN", () => {
		const parsedQuery = sqlParser.parse(
			"SELECT posts.*, users.name FROM posts JOIN `users` ON `posts`.`userId` = `users`.`id`",
			{
				defaultDbKey: "db",
			},
		);

		expect(parsedQuery.method).toBe("relation-find");
		expect(parsedQuery.relation?.[2]).toEqual({
			users: {
				type: "1n",
				path: [
					"db",
					"users",
				],
				pk: "userId",
				fk: "id",
				as: "users",
			},
		});
	});
});
