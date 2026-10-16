#!/usr/bin/env bun

import { ValtheraClass } from "@wxn0brp/db-core";
import { isValtheraError } from "@wxn0brp/db-core/errors";
import { Command } from "commander";
import { existsSync, readFileSync } from "fs";
import { collectionOperations, operations } from "./operations";
import { parseData } from "./utils";
import { createAdapter } from "@wxn0brp/db-resolver";
import { Opts } from "@wxn0brp/db-resolver/types";

const program = new Command();
const v = JSON.parse(
	readFileSync(import.meta.dirname + "/../package.json", "utf-8"),
).version;

function printResult(result: any, json?: boolean) {
	console.log(json ? JSON.stringify(result) : result);
}

function fail(err: any, json?: boolean) {
	const payload: Record<string, any> = isValtheraError(err)
		? err.toJSON()
		: {
				message: err?.message ?? String(err),
			};

	if (json) {
		console.error(JSON.stringify(payload));
	} else {
		console.error(
			payload.code ? `[${payload.code}] ${payload.message}` : payload.message,
		);
		if (payload.suggestion) console.error("Suggestion:", payload.suggestion);
		if (payload.context) console.error("Context:", payload.context);
	}

	process.exitCode = 1;
}

interface Cfg {
	dbs: Record<string, Opts>;
}

async function getValthera(options: {
	"config-path": string;
	config: string;
	dir: string;
}) {
	let cfg: Cfg = {
		dbs: {},
	};

	const cfgPath = options["config-path"];
	if (cfgPath && existsSync(cfgPath))
		cfg = Bun.YAML.parse(readFileSync(cfgPath, "utf-8")) as any;

	const currentConfig: Opts = cfg?.dbs?.[options.dir] || {
		def: "dir",
		opts: [
			options.dir || ".",
			{
				format: "json5:x",
			},
		],
	};

	if (options.config) {
		const data = options.config
			.split(",")
			.map(data => data.split("="))
			.reduce(
				(acc, [key, value]) => {
					acc[key] = value;
					return acc;
				},
				{} as Record<string, any>,
			);
		Object.assign(currentConfig, data);
	}

	const adapter = await createAdapter(currentConfig);

	return new ValtheraClass({
		adapter,
	});
}

program
	.version(v)
	.description("ValtheraDB CLI")
	.option("-d, --dir <path>", "Directory of the database", process.cwd())
	.option("-j, --json", "Use JSON format")
	.option("-c, --config <data>", "Config data")
	.option(
		"-p, --config-path <path>",
		"Path to the config file",
		"./valthera.cli.yml",
	);

program
	.command("server [port]")
	.description("Start the server")
	.action(async port => {
		const opts = program.opts();
		process.env.DB_DIR = opts.dir;
		if (port) process.env.PORT = port;
		await import("./server");
	});

program
	.command("upgrade")
	.description("Upgrade cli")
	.action(async () => {
		await Bun.$`bun add -g github:wxn0brP/ValtheraDB-cli#master --force`;
	});

operations.forEach(operation => {
	program
		.command(operation.name)
		.description(operation.description)
		.allowUnknownOption(true)
		.action(async (...argsRaw) => {
			const options = program.opts();
			const db = await getValthera(options as any);
			const name = operation.name.split(" ")[0];

			try {
				// commander appends the options object and the Command instance
				const raw = argsRaw.slice(0, -2);

				if (typeof raw[1] === "string" && raw[1].startsWith("=")) {
					const [, id, data] = raw[1].split("=");
					raw[1] = {
						[id]: data,
					};
				}

				const args = raw.map((data, i) => {
					const type = operation.args[i] || "string";
					return parseData(data, type);
				});

				const collection = args.shift();

				const result = await db.c(collection)[name](...args);
				printResult(result, options.json);
			} catch (err) {
				fail(err, options.json);
			}
		});
});

collectionOperations.forEach(operation => {
	program
		.command(operation.name)
		.description(operation.description)
		.allowUnknownOption(false)
		.action(async (...argsRaw) => {
			const options = program.opts();
			const db = await getValthera(options as any);
			const name = operation.name.split(" ")[0];

			try {
				const collection = argsRaw.shift();

				const result = await db[name](collection);
				printResult(result, options.json);
			} catch (err) {
				fail(err, options.json);
			}
		});
});

program
	.command("format [path] [format]")
	.description("Format the data in the db-storage-dir")
	.action(async (path, formatName) => {
		const { formatDB } = await import("./format");
		await formatDB(path || ".", formatName || "json5:x");
		console.log("Formatted Successfully");
	});

program.on("command:*", async operands => {
	console.log(`Unrecognized command: ${operands.join(" ")}`);
	const options = program.opts();
	try {
		const db = await getValthera(options as any);
		const result = await db.c(operands[1])[operands[0]](...operands.slice(2));
		printResult(result, options.json);
	} catch (err) {
		fail(err, options.json);
	}
});

program.parse();
