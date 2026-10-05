import { Opts, ResolvedConfig } from "./types";
import { InvalidOptsError } from "./errors";

const adapterAliases: Record<string, string> = {
	client: "@wxn0brp/db-client",
};

const noNpmAdapter = [
	"accdb",
	"length",
	"crypt",
	"xlsx",
].reduce((acc, key) => {
	acc[`@wxn0brp/db-storage-${key}`] = `wxn0brP/ValtheraDB-storage-${key}`;
	return acc;
}, {});

export function parsePkgSource(pkg: string): string {
	if (pkg.startsWith("@") && pkg.includes("/")) return pkg;

	if (pkg.startsWith("@")) return pkg.slice(1);

	if (adapterAliases[pkg]) return adapterAliases[pkg];

	return `@wxn0brp/db-storage-${pkg}`;
}

export function parseId(id: string) {
	if (!id || !id.trim())
		throw new InvalidOptsError(
			"id",
			'must be a non-empty string in format "package:variant"',
		);

	const idx = id.indexOf(":");
	if (idx === 0)
		throw new InvalidOptsError("id", `package name is empty in "${id}"`);
	if (idx === id.length - 1)
		throw new InvalidOptsError("id", `variant is empty in "${id}"`);

	const [pkg, variant] = id.split(":");
	return {
		pkg,
		variant: variant ?? pkg,
	};
}

export function getConfig(opts: Opts): ResolvedConfig {
	if (opts.force) {
		if (typeof opts.force !== "string" || !opts.force.trim())
			throw new InvalidOptsError("force", "must be a non-empty string");
		return {
			...parseId(opts.force),
			opts: opts.opts ?? [],
		};
	}

	let { name } = opts;

	if (name) {
		const envName = `VALTHERA_${name.toUpperCase()}`;

		if (process.env[envName]) {
			const envValue = process.env[envName]!;
			if (!envValue.trim())
				throw new InvalidOptsError(
					`env:${envName}`,
					"environment variable is empty",
				);

			const optsEnv = process.env[`${envName}_OPTS`];
			const dbOpts: any[] = optsEnv ? JSON.parse(optsEnv) : (opts.opts ?? []);

			return {
				...parseId(envValue),
				opts: dbOpts,
			};
		}
	}

	if (opts.def) {
		if (typeof opts.def !== "string" || !opts.def.trim())
			throw new InvalidOptsError("def", "must be a non-empty string");
		return {
			...parseId(opts.def),
			opts: opts.opts ?? [],
		};
	}

	name ||= "master";
	return {
		pkg: "dir",
		variant: "dir",
		opts: opts.opts ?? [
			`./vdb-data/${name}`,
		],
	};
}

export function getInstallName(name: string) {
	if (noNpmAdapter[name]) return "github:" + noNpmAdapter[name];
	return name;
}
