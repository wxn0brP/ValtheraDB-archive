import { describe, expect, it } from "bun:test";
import { resolveSearch } from "../src/utils/update";

function mockCollection(docs: any[]) {
	return {
		find: () => ({
			toArray: () => Promise.resolve(docs),
		}),
	} as any;
}

describe("resolveSearch", () => {
	const docs = [
		{
			_id: "1",
			name: "Alice",
			age: 30,
			tags: [
				"a",
				"b",
			],
		},
		{
			_id: "2",
			name: "Bob",
			age: 25,
			tags: [
				"b",
			],
		},
		{
			_id: "3",
			name: "Charlie",
			age: 35,
			tags: [
				"a",
				"c",
			],
		},
		{
			_id: "4",
			name: "Diana",
			age: 28,
			tags: [],
		},
	];

	describe("object search with JS fallback", () => {
		it("1. filters using hasFieldsAdvanced for $subset", async () => {
			const search = {
				$subset: {
					tags: [
						"a",
					],
				},
			};
			const { filter, allData } = await resolveSearch(
				search,
				mockCollection(docs),
			);

			expect(filter).toBeNull();
			expect(allData).toHaveLength(2);
			expect(allData!.map((d: any) => d.name).sort()).toEqual([
				"Alice",
				"Charlie",
			]);
		});

		it("2. $subset with no match returns empty", async () => {
			const search = {
				$subset: {
					tags: [
						"x",
					],
				},
			};
			const { allData } = await resolveSearch(search, mockCollection(docs));

			expect(allData).toEqual([]);
		});

		it("3. returns filter null when JS fallback", async () => {
			const search = {
				$subset: {
					tags: [
						"b",
					],
				},
			};
			const { filter } = await resolveSearch(search, mockCollection(docs));

			expect(filter).toBeNull();
		});
	});

	describe("object search (native)", () => {
		it("1. returns translated mongo query as filter", async () => {
			const { filter, allData } = await resolveSearch(
				{
					name: "Alice",
				},
				mockCollection(docs),
			);

			expect(allData).toBeNull();
			expect(filter).toEqual({
				name: "Alice",
			});
		});

		it("2. works with operators", async () => {
			const { filter } = await resolveSearch(
				{
					$gt: {
						age: 25,
					},
				},
				mockCollection(docs),
			);

			expect(filter).toEqual({
				age: {
					$gt: 25,
				},
			});
		});

		it("3. works with compound query", async () => {
			const { filter } = await resolveSearch(
				{
					name: "Alice",
					$gt: {
						age: 20,
					},
				},
				mockCollection(docs),
			);

			expect(filter).not.toBeNull();
			expect(filter.name).toBe("Alice");
		});

		it("4. works with translated nested operators (Bug 4 fix)", async () => {
			const { filter } = await resolveSearch(
				{
					name: {
						$regex: "^A",
					},
				},
				mockCollection(docs),
			);

			expect(filter).toEqual({
				name: {
					$regex: "^A",
				},
			});
		});
	});

	describe("edge cases", () => {
		it("1. handles empty collection with object search", async () => {
			const { filter, allData } = await resolveSearch(
				{
					name: "X",
				},
				mockCollection([]),
			);

			expect(allData).toBeNull();
			expect(filter).toEqual({
				name: "X",
			});
		});

		it("2. handles empty collection with JS fallback search", async () => {
			const search = {
				$subset: {
					tags: [
						"a",
					],
				},
			};
			const { allData } = await resolveSearch(search, mockCollection([]));

			expect(allData).toEqual([]);
		});
	});
});
