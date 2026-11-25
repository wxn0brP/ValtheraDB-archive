import { rm } from "fs/promises";
import { RocksAdapter } from "../src";

const TEST_ROOT = "/tmp/valthera-e2e-rocks-test";
let counter = 0;

export default async () => {
	const path = `${TEST_ROOT}-${process.pid}-${counter++}`;
	await rm(path, {
		recursive: true,
		force: true,
	});
	const actions = new RocksAdapter(path);
	await actions.init();
	return actions;
};
