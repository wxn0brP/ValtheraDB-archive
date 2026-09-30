import { ValtheraClass } from "@wxn0brp/db-core";

export type TestDomain =
	| "init"
	| "collection-management"
	| "crud-add"
	| "crud-read"
	| "crud-update"
	| "crud-remove"
	| "search-operators"
	| "update-operators"
	| "find-options"
	| "composite-operations"
	| "edge-cases"
	| "events"
	| "collection-api"
	| "lifecycle"
	| "transaction";

export interface TestResult {
	domain: TestDomain;
	name: string;
	status: "passed" | "failed" | "skipped";
	error?: string;
	duration: number;
}

export interface TestDefinition {
	domain: TestDomain;
	name: string;
	fn: (db: ValtheraClass) => Promise<void>;
}

export interface SuiteConfig {
	skip?: {
		domains?: TestDomain[];
		tests?: string[];
	};
}

export interface AdapterFactory {
	(): Promise<any>;
}

export interface RunnerOptions {
	domains: TestDomain[];
	tests: string[];
	config: SuiteConfig;
}

export interface RunnerResult {
	results: TestResult[];
	passed: number;
	failed: number;
	skipped: number;
	total: number;
}
