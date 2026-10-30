/** biome-ignore-all lint/suspicious/noExplicitAny: . */
import { RemoteActionsBase } from "@wxn0brp/db-client/actions";

const TEST_COLLECTIONS = ["users", "test", "items", "test_coll", "to_remove"];

declare const process: {
	env: {
		VALTHERA_PHP_URL?: string;
		VALTHERA_PHP_TOKEN?: string;
		VALTHERA_PHP_DB?: string;
	};
};

export default async () => {
	const url = process.env.VALTHERA_PHP_URL || "http://localhost:8085/php-db/";
	const token = process.env.VALTHERA_PHP_TOKEN || "test-token-789";
	const db = process.env.VALTHERA_PHP_DB || "vdb-test";

	const actions = new RemoteActionsBase({
		name: db,
		url,
		auth: token,
		headers: {
			Authorization: `Bearer ${token}`,
		},
	});

	actions.capabilities = {
		transactions: false,
		indexes: true,
		persistent: true,
	};

	actions._inited = true;

	for (const coll of TEST_COLLECTIONS) {
		try {
			await actions.removeCollection(coll);
		} catch {}
	}

	return actions;
};
