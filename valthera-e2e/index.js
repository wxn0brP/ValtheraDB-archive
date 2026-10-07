import { makeConnect, AccDBValthera } from "../src/index.js";
import { unlink } from "fs/promises";

const TEST_FILE = `./valthera-e2e-test.accdb`;

export default async () => {
	await unlink(TEST_FILE).catch(() => {});
	const conn = await makeConnect(TEST_FILE);
	const actions = new AccDBValthera(conn);
	await actions.init();
	return actions;
};
