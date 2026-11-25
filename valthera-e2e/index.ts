import { NativeActions } from "../src-ts/index";
import { vFileCpu } from "@wxn0brp/db-storage-dir";

const TEST_DIR = "/tmp/valthera-e2e-dir-c-test";

export default async () => {
	await Bun.$`rm -rf ${TEST_DIR}`.quiet();
	const actions = new NativeActions(
		TEST_DIR,
		{
			format: "json",
		},
		vFileCpu,
	);
	await actions.init();
	actions._inited = true;
	return actions;
};
