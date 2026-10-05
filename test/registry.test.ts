import { describe, expect, test } from "bun:test";
import { mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { DbRegistry } from "../src/daemon/registry";

describe("DbRegistry", () => {
	test("opens a dir db and runs CRUD", async () => {
		const registry = new DbRegistry();
		const dir = await mkdtemp(join(tmpdir(), "valthera-conduit-"));

		await registry.init("main", dir);
		await registry.execute("main", "add", {
			collection: "users",
			data: {
				name: "Ada",
			},
		});

		const users = await registry.execute("main", "find", {
			collection: "users",
			search: {
				name: "Ada",
			},
		});
		expect(users).toHaveLength(1);
		expect(users[0].name).toBe("Ada");

		await registry.closeAll();
	});
});
