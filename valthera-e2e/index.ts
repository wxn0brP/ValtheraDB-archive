import { rm } from "fs/promises";
import { BinAdapter } from "../src/index";

const TEST_FILE = "/tmp/valthera-e2e-bin-test.val";

export default async () => {
	await rm(TEST_FILE, {
		force: true,
	});
	const mgr = new BinAdapter(TEST_FILE);
	await mgr.init();
	return mgr;
};
