import { DbStorageCsv } from "../src/adapter.js";

const TEST_DIR = "/tmp/valthera-e2e-csv-test";

export default async () => {
	await Bun.$`rm -rf ${TEST_DIR}`.quiet();
	const actions = new DbStorageCsv({
		dir: TEST_DIR,
	});
	await actions.init();
	actions._inited = true;
	return actions;
};
