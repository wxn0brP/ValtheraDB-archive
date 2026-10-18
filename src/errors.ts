export class ResolverError extends Error {
	constructor(
		message: string,
		public code: string,
		public suggestion?: string,
	) {
		super(message);
		this.name = "ResolverError";
	}
}

export class AdapterNotFoundError extends ResolverError {
	constructor(pkg: string) {
		super(
			`Adapter "${pkg}" not found`,
			"ADAPTER_NOT_FOUND",
			`Try: npm install ${pkg}`,
		);
		this.name = "AdapterNotFoundError";
	}
}

export class VariantNotFoundError extends ResolverError {
	constructor(pkg: string, variant: string, available?: string[]) {
		const msg = available?.length
			? `Available variants: ${available.join(", ")}`
			: undefined;
		super(
			`Adapter "${pkg}" has no variant "${variant}"`,
			"VARIANT_NOT_FOUND",
			msg,
		);
		this.name = "VariantNotFoundError";
	}
}

export class MissingDefaultError extends ResolverError {
	constructor(pkg: string, available?: string[]) {
		const suggestion =
			"Add `export const DYNAMIC = { def: ... }` to the adapter";
		super(
			`Adapter "${pkg}" has no default factory`,
			"MISSING_DEFAULT",
			available?.length
				? `${suggestion}\nAvailable exports: ${available.join(", ")}`
				: suggestion,
		);
		this.name = "MissingDefaultError";
	}
}

export class InvalidOptsError extends ResolverError {
	constructor(field: string, reason: string) {
		super(`Invalid option "${field}": ${reason}`, "INVALID_OPTS");
		this.name = "InvalidOptsError";
	}
}

export class MissingDynamicError extends ResolverError {
	constructor(pkg: string) {
		super(
			`Adapter "${pkg}" does not support resolver import: missing DYNAMIC export`,
			"MISSING_DYNAMIC",
			`The package "${pkg}" is installed but does not export DYNAMIC.\n` +
				"Make sure it's a ValtheraDB adapter with `export const DYNAMIC = { ... }`",
		);
		this.name = "MissingDynamicError";
	}
}
