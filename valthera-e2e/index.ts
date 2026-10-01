import { EncryptedAction } from "../src/crypto";

const TEST_DIR = "/tmp/valthera-e2e-dir-test";

export default async () => {
	await Bun.$`rm -rf ${TEST_DIR}`.quiet();
	const actions = new EncryptedAction(TEST_DIR, {
		encryptionKey: "valthera",
		salt: "db",
	});
	await actions.init();
	actions._inited = true;
	return actions;
};
