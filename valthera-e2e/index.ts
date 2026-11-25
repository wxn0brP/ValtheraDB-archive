import { DbStorageXlsx } from "../src/adapter.js";

const TEST_DIR = "/tmp/valthera-e2e-xlsx-test";

export default async () => {
    await Bun.$`rm -rf ${TEST_DIR}`.quiet();
    const actions = new DbStorageXlsx({ dir: TEST_DIR });
    await actions.init();
    actions._inited = true;
    return actions;
}
