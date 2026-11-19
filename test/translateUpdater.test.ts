import { describe, expect, it } from "bun:test";
import { QueryValidationError } from "@wxn0brp/db-core/errors";
import { translateUpdater, isEmptyUpdate } from "../src/utils/update";

describe("translateUpdater", () => {
	it("1. wraps primitive value in $set", () => {
		expect(translateUpdater("hello")).toEqual({
			$set: "hello",
		});
	});

	it("2. wraps null in $set", () => {
		expect(translateUpdater(null)).toEqual({
			$set: null,
		});
	});

	it("3. wraps number in $set", () => {
		expect(translateUpdater(42)).toEqual({
			$set: 42,
		});
	});

	it("4. converts direct fields to $set", () => {
		expect(
			translateUpdater({
				name: "Alice",
				age: 30,
			}),
		).toEqual({
			$set: {
				name: "Alice",
				age: 30,
			},
		});
	});

	it("5. handles $inc", () => {
		expect(
			translateUpdater({
				$inc: {
					score: 5,
				},
			}),
		).toEqual({
			$inc: {
				score: 5,
			},
		});
	});

	it("6. handles $dec (converts to negative $inc)", () => {
		expect(
			translateUpdater({
				$dec: {
					score: 3,
				},
			}),
		).toEqual({
			$inc: {
				score: -3,
			},
		});
	});

	it("7. handles $push", () => {
		expect(
			translateUpdater({
				$push: {
					tags: "new",
				},
			}),
		).toEqual({
			$push: {
				tags: "new",
			},
		});
	});

	it("8. handles $pushset (converts to $addToSet)", () => {
		expect(
			translateUpdater({
				$pushset: {
					tags: "unique",
				},
			}),
		).toEqual({
			$addToSet: {
				tags: "unique",
			},
		});
	});

	it("9. handles $pull", () => {
		expect(
			translateUpdater({
				$pull: {
					tags: "old",
				},
			}),
		).toEqual({
			$pull: {
				tags: "old",
			},
		});
	});

	it("10. handles $pullall (converts to $pull with $in)", () => {
		expect(
			translateUpdater({
				$pullall: {
					tags: [
						"a",
						"b",
					],
				},
			}),
		).toEqual({
			$pull: {
				tags: {
					$in: [
						"a",
						"b",
					],
				},
			},
		});
	});

	it("11. handles $unset", () => {
		expect(
			translateUpdater({
				$unset: {
					obsolete: true,
				},
			}),
		).toEqual({
			$unset: {
				obsolete: "",
			},
		});
	});

	it("12. handles $rename", () => {
		expect(
			translateUpdater({
				$rename: {
					oldName: "newName",
				},
			}),
		).toEqual({
			$rename: {
				oldName: "newName",
			},
		});
	});

	it("13. handles explicit $set", () => {
		expect(
			translateUpdater({
				$set: {
					name: "Bob",
				},
			}),
		).toEqual({
			$set: {
				name: "Bob",
			},
		});
	});

	it("14. handles $merge (flattens one level)", () => {
		expect(
			translateUpdater({
				$merge: {
					address: {
						city: "NYC",
						zip: 10001,
					},
				},
			}),
		).toEqual({
			$set: {
				"address.city": "NYC",
				"address.zip": 10001,
			},
		});
	});

	it("15. handles $merge with non-object value", () => {
		expect(
			translateUpdater({
				$merge: {
					name: "Alice",
				},
			}),
		).toEqual({
			$set: {
				name: "Alice",
			},
		});
	});

	it("16. handles $deepmerge", () => {
		expect(
			translateUpdater({
				$deepmerge: {
					user: {
						profile: {
							name: "Alice",
						},
						age: 30,
					},
				},
			}),
		).toEqual({
			$set: {
				"user.profile.name": "Alice",
				"user.age": 30,
			},
		});
	});

	it("17. rejects unknown $ operators", () => {
		expect(() =>
			translateUpdater({
				$unknown: "val",
			} as any),
		).toThrow(QueryValidationError);
	});

	it("18. combines direct fields with operators", () => {
		expect(
			translateUpdater({
				name: "Alice",
				$inc: {
					score: 1,
				},
			}),
		).toEqual({
			$set: {
				name: "Alice",
			},
			$inc: {
				score: 1,
			},
		});
	});

	it("19. combines multiple operators", () => {
		expect(
			translateUpdater({
				$inc: {
					score: 1,
				},
				$push: {
					tags: "new",
				},
			}),
		).toEqual({
			$inc: {
				score: 1,
			},
			$push: {
				tags: "new",
			},
		});
	});

	it("20. handles empty object", () => {
		expect(translateUpdater({})).toEqual({});
	});

	it("21. rejects operator with non-object value", () => {
		expect(() =>
			translateUpdater({
				$inc: "invalid",
			} as any),
		).toThrow(QueryValidationError);
	});

	it("22. handles $dec with multiple fields", () => {
		expect(
			translateUpdater({
				$dec: {
					a: 1,
					b: 2,
				},
			}),
		).toEqual({
			$inc: {
				a: -1,
				b: -2,
			},
		});
	});
});

describe("isEmptyUpdate", () => {
	it("1. returns true for null", () => {
		expect(isEmptyUpdate(null)).toBeTrue();
	});

	it("2. returns true for undefined", () => {
		expect(isEmptyUpdate(undefined)).toBeTrue();
	});

	it("3. returns true for empty object", () => {
		expect(isEmptyUpdate({})).toBeTrue();
	});

	it("4. returns true for object with empty $set", () => {
		expect(
			isEmptyUpdate({
				$set: {},
			}),
		).toBeTrue();
	});

	it("5. returns false for object with non-empty $set", () => {
		expect(
			isEmptyUpdate({
				$set: {
					name: "Alice",
				},
			}),
		).toBeFalse();
	});

	it("6. returns false for object with $inc", () => {
		expect(
			isEmptyUpdate({
				$inc: {
					score: 1,
				},
			}),
		).toBeFalse();
	});

	it("7. returns true when all operators have empty objects", () => {
		expect(
			isEmptyUpdate({
				$set: {},
				$inc: {},
			}),
		).toBeTrue();
	});

	it("8. returns false when any operator has content", () => {
		expect(
			isEmptyUpdate({
				$set: {},
				$inc: {
					score: 1,
				},
			}),
		).toBeFalse();
	});
});
