import { describe, expect, it } from "bun:test";
import { QueryValidationError } from "@wxn0brp/db-core/errors";
import { translateQuery } from "../src/utils/index";

describe("translateQuery", () => {
	it("1. handles exact field match", () => {
		expect(
			translateQuery({
				name: "John",
			}),
		).toEqual({
			name: "John",
		});
	});

	it("2. handles number value", () => {
		expect(
			translateQuery({
				age: 30,
			}),
		).toEqual({
			age: 30,
		});
	});

	it("3. handles boolean value", () => {
		expect(
			translateQuery({
				active: true,
			}),
		).toEqual({
			active: true,
		});
	});

	it("4. handles null value", () => {
		expect(
			translateQuery({
				name: null,
			}),
		).toEqual({
			name: {
				$type: "null",
			},
		});
	});

	it("5. expands nested field with dot notation", () => {
		expect(
			translateQuery({
				address: {
					city: "NYC",
					zip: 10001,
				},
			}),
		).toEqual({
			"address.city": "NYC",
			"address.zip": 10001,
		});
	});

	it("6. deeply nests fields with dot notation", () => {
		expect(
			translateQuery({
				a: {
					b: {
						c: 1,
					},
				},
			}),
		).toEqual({
			"a.b.c": 1,
		});
	});

	it("7. preserves operator object at field level (Bug 4)", () => {
		expect(
			translateQuery({
				name: {
					$regex: "^foo",
				},
			}),
		).toEqual({
			name: {
				$regex: "^foo",
			},
		});
	});

	it("8. preserves multiple operators at field level", () => {
		expect(
			translateQuery({
				age: {
					$gt: 5,
					$lt: 10,
				},
			}),
		).toEqual({
			age: {
				$gt: 5,
				$lt: 10,
			},
		});
	});

	it("9. preserves $regex with RegExp value at field level", () => {
		const result = translateQuery({
			name: {
				$regex: /^foo/i,
			},
		});
		expect(result.name.$regex instanceof RegExp).toBeTrue();
		expect(result.name.$regex.source).toBe("^foo");
	});

	it("10. mixes field-level op and nested field", () => {
		expect(
			translateQuery({
				user: {
					name: "Alice",
				},
				score: {
					$gt: 10,
				},
			}),
		).toEqual({
			"user.name": "Alice",
			score: {
				$gt: 10,
			},
		});
	});

	it("11. handles $not with primitive string (Bug 3)", () => {
		expect(
			translateQuery({
				$not: {
					name: "John",
				},
			}),
		).toEqual({
			name: {
				$ne: "John",
			},
		});
	});

	it("12. handles $not with number value", () => {
		expect(
			translateQuery({
				$not: {
					age: 30,
				},
			}),
		).toEqual({
			age: {
				$ne: 30,
			},
		});
	});

	it("13. handles $not with boolean value", () => {
		expect(
			translateQuery({
				$not: {
					active: true,
				},
			}),
		).toEqual({
			active: {
				$ne: true,
			},
		});
	});

	it("14. handles $not with null value", () => {
		expect(
			translateQuery({
				$not: {
					deleted: null,
				},
			}),
		).toEqual({
			deleted: {
				$not: {
					$type: "null",
				},
			},
		});
	});

	it("15. handles $not with operator expression", () => {
		const result = translateQuery({
			$not: {
				age: {
					$gt: 5,
				},
			},
		});
		expect(result).toEqual({
			age: {
				$not: {
					$gt: 5,
				},
			},
		});
	});

	it("16. handles $not with compound operator", () => {
		const result = translateQuery({
			$not: {
				age: {
					$gte: 10,
					$lte: 20,
				},
			},
		});
		expect(result).toEqual({
			age: {
				$not: {
					$gte: 10,
					$lte: 20,
				},
			},
		});
	});

	it("17. handles $not with $and", () => {
		const result = translateQuery({
			$not: {
				$and: [
					{
						name: "John",
					},
				],
			},
		});
		expect(result.$and).toBeDefined();
		expect(result.$and[0]).toEqual({
			$nor: [
				{
					$and: [
						{
							name: "John",
						},
					],
				},
			],
		});
	});

	it("18. handles $not with $or", () => {
		const result = translateQuery({
			$not: {
				$or: [
					{
						name: "John",
					},
					{
						age: 30,
					},
				],
			},
		});
		expect(result.$and).toBeDefined();
		expect(result.$and[0]).toEqual({
			$nor: [
				{
					$or: [
						{
							name: "John",
						},
						{
							age: 30,
						},
					],
				},
			],
		});
	});

	it("19. combines $not with exact field in one query", () => {
		const result = translateQuery({
			name: "Alice",
			$not: {
				age: 30,
			},
		});
		expect(result.name).toBe("Alice");
		expect(result.age).toEqual({
			$ne: 30,
		});
	});

	it("20. combines $not operator with exact field at same field", () => {
		const result = translateQuery({
			age: 10,
			$not: {
				age: 30,
			},
		});
		expect(result.$and).toBeDefined();
		expect(result.$and).toContainEqual({
			age: 10,
		});
		expect(result.$and).toContainEqual({
			age: {
				$ne: 30,
			},
		});
	});

	it("21. handles $and", () => {
		expect(
			translateQuery({
				$and: [
					{
						name: "John",
					},
					{
						age: 30,
					},
				],
			}),
		).toEqual({
			$and: [
				{
					name: "John",
				},
				{
					age: 30,
				},
			],
		});
	});

	it("22. handles $and with recursion", () => {
		const result = translateQuery({
			$and: [
				{
					address: {
						city: "NYC",
					},
				},
				{
					$gt: {
						age: 18,
					},
				},
			],
		});
		expect(result.$and[0]).toEqual({
			"address.city": "NYC",
		});
		expect(result.$and[1]).toEqual({
			age: {
				$gt: 18,
			},
		});
	});

	it("23. handles $or", () => {
		expect(
			translateQuery({
				$or: [
					{
						name: "John",
					},
					{
						age: 30,
					},
				],
			}),
		).toEqual({
			$or: [
				{
					name: "John",
				},
				{
					age: 30,
				},
			],
		});
	});

	it("24. handles $or with recursion", () => {
		const result = translateQuery({
			$or: [
				{
					name: {
						$regex: "^A",
					},
				},
				{
					$gt: {
						age: 60,
					},
				},
			],
		});
		expect(result.$or[0]).toEqual({
			name: {
				$regex: "^A",
			},
		});
		expect(result.$or[1]).toEqual({
			age: {
				$gt: 60,
			},
		});
	});

	it("25. handles top-level $gt operator", () => {
		expect(
			translateQuery({
				$gt: {
					age: 5,
				},
			}),
		).toEqual({
			age: {
				$gt: 5,
			},
		});
	});

	it("26. handles top-level $gte operator", () => {
		expect(
			translateQuery({
				$gte: {
					age: 5,
				},
			}),
		).toEqual({
			age: {
				$gte: 5,
			},
		});
	});

	it("27. handles top-level $lt operator", () => {
		expect(
			translateQuery({
				$lt: {
					age: 10,
				},
			}),
		).toEqual({
			age: {
				$lt: 10,
			},
		});
	});

	it("28. handles top-level $lte operator", () => {
		expect(
			translateQuery({
				$lte: {
					age: 10,
				},
			}),
		).toEqual({
			age: {
				$lte: 10,
			},
		});
	});

	it("29. handles top-level $in operator", () => {
		expect(
			translateQuery({
				$in: {
					status: [
						"a",
						"b",
					],
				},
			}),
		).toEqual({
			status: {
				$in: [
					"a",
					"b",
				],
			},
		});
	});

	it("30. handles top-level $nin operator", () => {
		expect(
			translateQuery({
				$nin: {
					status: [
						"a",
						"b",
					],
				},
			}),
		).toEqual({
			status: {
				$nin: [
					"a",
					"b",
				],
			},
		});
	});

	it("31. handles top-level $exists operator", () => {
		expect(
			translateQuery({
				$exists: {
					email: true,
				},
			}),
		).toEqual({
			email: {
				$exists: true,
			},
		});
	});

	it("32. handles top-level $size operator", () => {
		expect(
			translateQuery({
				$size: {
					tags: 3,
				},
			}),
		).toEqual({
			tags: {
				$size: 3,
			},
		});
	});

	it("33. handles top-level $regex operator", () => {
		expect(
			translateQuery({
				$regex: {
					name: "^foo",
				},
			}),
		).toEqual({
			name: {
				$regex: "^foo",
			},
		});
	});

	it("34. handles top-level $regex with RegExp value", () => {
		const result = translateQuery({
			$regex: {
				name: /^foo/i,
			},
		});
		expect(result.name.$regex).toBe("^foo");
		expect(result.name.$options).toBe("i");
	});

	it("35. handles $between operator", () => {
		expect(
			translateQuery({
				$between: {
					age: [
						10,
						20,
					],
				},
			}),
		).toEqual({
			age: {
				$gte: 10,
				$lte: 20,
			},
		});
	});

	it("36. rejects $between with undefined bounds", () => {
		expect(() =>
			translateQuery({
				$between: {
					age: [
						10,
						undefined,
					],
				},
			}),
		).toThrow(QueryValidationError);
		expect(() =>
			translateQuery({
				$between: {
					age: [
						undefined,
						20,
					],
				},
			}),
		).toThrow(QueryValidationError);
	});

	it("37. handles $startswith operator", () => {
		expect(
			translateQuery({
				$startswith: {
					name: "foo",
				},
			}),
		).toEqual({
			name: {
				$regex: "^foo",
			},
		});
	});

	it("38. handles $endswith operator", () => {
		expect(
			translateQuery({
				$endswith: {
					name: "bar",
				},
			}),
		).toEqual({
			name: {
				$regex: "bar$",
			},
		});
	});

	it("39. escapes regex special chars in $startswith", () => {
		expect(
			translateQuery({
				$startswith: {
					name: "foo.bar",
				},
			}),
		).toEqual({
			name: {
				$regex: "^foo\\.bar",
			},
		});
	});

	it("40. escapes regex special chars in $endswith", () => {
		expect(
			translateQuery({
				$endswith: {
					name: "foo$",
				},
			}),
		).toEqual({
			name: {
				$regex: "foo\\$$",
			},
		});
	});

	it("40b. handles $iendswith operator", () => {
		expect(
			translateQuery({
				$iendswith: {
					name: "bar",
				},
			}),
		).toEqual({
			name: {
				$regex: "bar$",
				$options: "i",
			},
		});
	});

	it("40c. escapes regex special chars in $iendswith", () => {
		expect(
			translateQuery({
				$iendswith: {
					name: "foo$",
				},
			}),
		).toEqual({
			name: {
				$regex: "foo\\$$",
				$options: "i",
			},
		});
	});

	it("41. handles $type with known type", () => {
		expect(
			translateQuery({
				$type: {
					name: "string",
				},
			}),
		).toEqual({
			name: {
				$type: "string",
			},
		});
	});

	it("42. handles $type with mapped type", () => {
		expect(
			translateQuery({
				$type: {
					count: "number",
				},
			}),
		).toEqual({
			count: {
				$type: "number",
			},
		});
	});

	it("43. handles $type with boolean type", () => {
		expect(
			translateQuery({
				$type: {
					flag: "boolean",
				},
			}),
		).toEqual({
			flag: {
				$type: "bool",
			},
		});
	});

	it("44. handles $arrinc operator", () => {
		expect(
			translateQuery({
				$arrinc: {
					tags: [
						"urgent",
					],
				},
			}),
		).toEqual({
			tags: {
				$in: [
					"urgent",
				],
			},
		});
		expect(() =>
			translateQuery({
				$arrinc: {
					tags: "urgent",
				},
			}),
		).toThrow(QueryValidationError);
	});

	it("45. handles $arrincall operator", () => {
		expect(
			translateQuery({
				$arrincall: {
					tags: [
						"a",
						"b",
					],
				},
			}),
		).toEqual({
			tags: {
				$all: [
					"a",
					"b",
				],
			},
		});
	});

	it("46. combines multiple fields with exact match", () => {
		expect(
			translateQuery({
				name: "John",
				age: 30,
				city: "NYC",
			}),
		).toEqual({
			name: "John",
			age: 30,
			city: "NYC",
		});
	});

	it("47. merges multiple top-level operators on same field", () => {
		expect(
			translateQuery({
				$gt: {
					age: 5,
				},
				$lt: {
					age: 10,
				},
			}),
		).toEqual({
			age: {
				$gt: 5,
				$lt: 10,
			},
		});
	});

	it("48. combines exact field with same-field operator", () => {
		const result = translateQuery({
			age: 10,
			$gt: {
				age: 5,
			},
		});
		expect(result.$and).toBeDefined();
		expect(result.$and).toContainEqual({
			age: 10,
		});
		expect(result.$and).toContainEqual({
			age: {
				$gt: 5,
			},
		});
	});

	it("49. returns null for null input", () => {
		expect(translateQuery(null)).toBeNull();
	});

	it("50. returns undefined for undefined input", () => {
		expect(translateQuery(undefined)).toBeUndefined();
	});

	it("51. returns primitive values as-is", () => {
		expect(translateQuery("string" as any)).toBe("string");
		expect(translateQuery(42 as any)).toBe(42);
	});

	it("52. handles empty $and array", () => {
		expect(
			translateQuery({
				$and: [],
			}),
		).toEqual({});
	});

	it("53. handles empty $or array", () => {
		expect(
			translateQuery({
				$or: [],
			}),
		).toEqual({
			_id: null,
		});
	});

	it("54. returns empty object for empty input", () => {
		expect(translateQuery({})).toEqual({});
	});

	it("55. ignores JS-fallback operators at top level", () => {
		expect(
			translateQuery({
				$subset: {
					tags: [
						"a",
					],
				},
			}),
		).toEqual({});
	});
});
