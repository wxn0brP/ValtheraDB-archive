import { parseArgs } from "node:util";

export interface CliOptions {
	smallOnly: boolean;
	jsonOutput: boolean;
	jsonFile: string;
	adapterPathArg: string;
	noCloud: boolean;
	help: boolean;
}

export function printHelp() {
	console.log(`Usage: valthera-bench [adapter] [options]

Benchmark a ValtheraDB adapter.

Arguments:
  adapter               Path to adapter module
                        (default: ./valthera-e2e/index.ts)

Options:
  -s, --small           Run only the small collection benchmark
  -j, --json            Save results as JSON
  -f, --jsonFile <path> JSON output file (default: results.json)
      --no-cloud        Skip comparison with cloud results
  -h, --help            Show this help`);
}

export function parseCliOptions(): CliOptions {
	const { values, positionals } = parseArgs({
		options: {
			small: {
				type: "boolean",
				short: "s",
			},
			json: {
				type: "boolean",
				short: "j",
			},
			jsonFile: {
				type: "string",
				short: "f",
			},
			"no-cloud": {
				type: "boolean",
			},
			help: {
				type: "boolean",
				short: "h",
			},
		},
		allowPositionals: true,
	});

	return {
		smallOnly: values.small ?? false,
		jsonOutput: Boolean(values.json || values.jsonFile),
		jsonFile: values.jsonFile || "results.json",
		adapterPathArg: positionals[0] || "./valthera-e2e/index.ts",
		noCloud: values["no-cloud"] ?? false,
		help: values.help ?? false,
	};
}
