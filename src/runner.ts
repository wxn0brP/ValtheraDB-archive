import { isValtheraError, ValtheraClass } from "@wxn0brp/db-core";
import type { AdapterCapabilities } from "@wxn0brp/db-core";
import { tests } from "./tests";
import type {
	AdapterFactory,
	RunnerOptions,
	RunnerResult,
	TestDomain,
	TestResult,
} from "./types";
import { verbose } from "./verbose";

function shouldSkipTest(
	test: {
		domain: TestDomain;
		name: string;
	},
	opts?: RunnerOptions,
) {
	if (!opts?.config?.skip) return false;

	const skip = opts.config.skip;

	if (skip.domains?.includes(test.domain)) return true;
	if (skip.tests?.includes(test.name)) return true;

	return false;
}

function filterTests(opts?: RunnerOptions) {
	let filtered = tests;

	// Filter by domains if specified
	if (opts?.domains && opts.domains.length > 0) {
		filtered = filtered.filter(t => opts.domains!.includes(t.domain));
	}

	// Filter by test name prefixes if specified
	if (opts?.tests && opts.tests.length > 0) {
		filtered = filtered.filter(t =>
			opts.tests.some(prefix => t.name.startsWith(prefix)),
		);
	}

	return filtered;
}

async function getCapabilities(
	dbFactory: () => Promise<ValtheraClass>,
): Promise<AdapterCapabilities | null> {
	let db: ValtheraClass | null = null;
	try {
		db = await dbFactory();
		return await db.capabilities();
	} catch (err) {
		verbose(`Failed to read adapter capabilities: ${err}`);
		return null;
	} finally {
		if (db) await db.close().catch(() => {});
	}
}

export async function runTests(
	adapterFactory: AdapterFactory,
	opts: RunnerOptions,
): Promise<RunnerResult> {
	// Wrap adapter factory to return a ValtheraClass instance
	const dbFactory = async () => {
		const adapter = await adapterFactory();
		if (!adapter) throw new Error("Adapter factory returned null");
		const db = new ValtheraClass({
			adapter,
		});
		await db.init();
		return db;
	};

	const testList = filterTests(opts);
	const hasTransactionTests = testList.some(t => t.domain === "transaction");
	let transactionsSupported = false;

	if (hasTransactionTests) {
		const capabilities = await getCapabilities(dbFactory);
		transactionsSupported = capabilities?.transactions === true;
		if (!transactionsSupported) {
			verbose(
				"Adapter does not declare transaction support - transaction tests will be skipped",
			);
		}
	}

	const results: TestResult[] = [];
	let passed = 0;
	let failed = 0;
	let skipped = 0;

	for (const test of testList) {
		const skip = shouldSkipTest(test, opts);
		const skipTransaction =
			test.domain === "transaction" && !transactionsSupported;
		verbose(`- ${test.domain}.${test.name}`);

		if (skip || skipTransaction) {
			results.push({
				domain: test.domain,
				name: test.name,
				status: "skipped",
				duration: 0,
			});
			skipped++;
			verbose(`  Skipped`);
			continue;
		}

		const start = performance.now();
		let db: ValtheraClass = null;
		try {
			db = await dbFactory();
			await test.fn(db);
			const duration = performance.now() - start;
			results.push({
				domain: test.domain,
				name: test.name,
				status: "passed",
				duration,
			});
			passed++;
			verbose(`  Passed`);
		} catch (err: any) {
			const duration = performance.now() - start;
			results.push({
				domain: test.domain,
				name: test.name,
				status: "failed",
				error: err?.message ?? String(err),
				code: isValtheraError(err) ? err.code : undefined,
				suggestion: isValtheraError(err) ? err.suggestion : undefined,
				duration,
			});
			failed++;
			verbose(`  Failed: ${err?.message ?? String(err)}`);
		} finally {
			if (db) await db.close().catch(() => {});
		}
	}

	return {
		results,
		passed,
		failed,
		skipped,
		total: testList.length,
	};
}
