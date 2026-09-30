import { parseArgs } from "node:util";
import type { TestDomain } from "../types";
import { VALID_DOMAINS } from "./constants";
import { setVerbose } from "../verbose";

export interface ParsedArgs {
	adapterPath: string;
	domains?: TestDomain[];
	tests?: string[];
}

export function printHelp(): void {
	console.log(
		`
Usage: valthera-e2e [options] [adapter-path]

Options:
  -h, --help     		Show this help message
  -d, --domain <d>   	Run only specified domains (comma-separated)
	 Valid: ${VALID_DOMAINS.join(", ")}
  -t, --test <t>     	Run only tests matching given prefixes (comma-separated)
  -e, --exclude <e> 	Exclude specified domains (comma-separated)
  -v, --verbose      	Print debug logs

Examples:
  valthera-e2e ./valthera-e2e/index.ts
  valthera-e2e -d crud-add,crud-read ./valthera-e2e/index.ts
  valthera-e2e -t add-with-auto ./valthera-e2e/index.ts
  valthera-e2e -d crud-add -t add-with-auto-string-id ./valthera-e2e/index.ts
  valthera-e2e -h
`.trim(),
	);
}

export function getArgs(): ParsedArgs {
	const args = process.argv.slice(2);

	const { values, positionals } = parseArgs({
		args,
		options: {
			domain: {
				type: "string",
				short: "d",
			},
			test: {
				type: "string",
				short: "t",
			},
			help: {
				type: "boolean",
				short: "h",
			},
			exclude: {
				type: "string",
				short: "e",
			},
			verbose: {
				type: "boolean",
				short: "v",
			},
		},
		strict: true,
		allowPositionals: true,
	});

	if (values.help) {
		printHelp();
		process.exit(0);
	}

	let adapterPath = "./valthera-e2e/index.js";
	let domains: TestDomain[] | undefined;
	let tests: string[] | undefined;

	if (positionals.length > 0) adapterPath = positionals[0] as string;

	if (values.domain) {
		const domainValues = values.domain.split(",");
		const parsed: TestDomain[] = [];
		for (const d of domainValues) {
			const trimmed = d.trim() as TestDomain;
			if (!VALID_DOMAINS.includes(trimmed)) {
				console.error(
					`Error: Unknown domain "${trimmed}". Valid domains: ${VALID_DOMAINS.join(", ")}`,
				);
				process.exit(1);
			}
			parsed.push(trimmed);
		}
		domains = parsed;
	}

	if (values.exclude) {
		const excludeValues = values.exclude.split(",");
		const parsed: TestDomain[] = [];
		for (const d of excludeValues) {
			const trimmed = d.trim() as TestDomain;
			if (!VALID_DOMAINS.includes(trimmed)) {
				console.error(
					`Error: Unknown domain "${trimmed}". Valid domains: ${VALID_DOMAINS.join(", ")}`,
				);
				process.exit(1);
			}
			parsed.push(trimmed);
		}
		domains = (domains?.length ? domains : VALID_DOMAINS).filter(
			d => !parsed.includes(d),
		);
	}

	if (values.test) {
		tests = values.test
			.split(",")
			.map(t => t.trim())
			.filter(Boolean);
	}

	setVerbose(values.verbose);

	return {
		adapterPath,
		domains,
		tests,
	};
}
