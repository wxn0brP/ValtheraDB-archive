import { LogAdapter } from "../src/adapter.ts";
import { rm } from "fs/promises";

export default async () => {
	const testDir = "/tmp/valthera-e2e-log-test";
	await rm(testDir, {
		recursive: true,
		force: true,
	});

	const adapter = new LogAdapter(testDir);
	await adapter.init();
	return adapter;
};
