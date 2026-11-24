import type { TestDomain } from "../types";
import type { runTests } from "../runner";

const reset = "\x1b[0m";

function formatDuration(ms: number) {
	if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
	if (ms < 100) return `${ms.toFixed(2)}ms`;
	return `${ms.toFixed(1)}ms`;
}

function getIcon(status: "passed" | "failed" | "skipped") {
	switch (status) {
		case "passed":
			return "💜";
		case "failed":
			return "❌";
		case "skipped":
			return "⚙️ ";
	}
}

function getColor(status: "passed" | "failed" | "skipped") {
	switch (status) {
		case "passed":
			return "\x1b[32m";
		case "failed":
			return "\x1b[31m";
		case "skipped":
			return "\x1b[33m";
	}
}

export function printResults(result: Awaited<ReturnType<typeof runTests>>) {
	console.log("");
	console.log("=".repeat(60));
	console.log(" E2E Test Results");
	console.log("=".repeat(60));
	console.log("");

	// Group by domain
	const byDomain = new Map<TestDomain, typeof result.results>();
	for (const r of result.results) {
		if (!byDomain.has(r.domain)) byDomain.set(r.domain, []);
		byDomain.get(r.domain)!.push(r);
	}

	for (const [domain, domainResults] of byDomain) {
		console.log(` 📁 ${domain}`);

		for (const r of domainResults) {
			const icon = "  " + getIcon(r.status);
			const color = getColor(r.status);

			console.log(
				`  ${color}${icon} ${r.name}${reset} (${formatDuration(r.duration)})`,
			);

			if (r.status === "failed" && r.error) {
				const color = getColor("failed");
				const prefix = r.errorName ? `${r.errorName}: ` : "thrown: ";
				console.log(`    ${color}${prefix}${r.error}${reset}`);

				if (r.errorStack) {
					const lines = r.errorStack.split("\n");
					if (lines[0]?.trim() === `${r.errorName}: ${r.error}`.trim())
						lines.shift();
					for (const line of lines) console.log(`    ${color}${line}${reset}`);
					console.log("");
				}

				if (r.source)
					console.log(
						`    ${color}at: ${r.source === "test" ? "test fn" : "adapter setup"}${reset}`,
					);

				if (r.code) console.log(`    ${color}code: ${r.code}${reset}`);
				if (r.suggestion)
					console.log(`    ${color}suggestion: ${r.suggestion}${reset}`);
				console.log();
			}
		}

		console.log("");
	}

	console.log("=".repeat(60));
	console.log(
		`
Total: ${result.total} |
${getColor("passed")}Passed: ${result.passed}${reset} |
${getColor("failed")}Failed: ${result.failed}${reset} |
${getColor("skipped")}Skipped: ${result.skipped}${reset}`.replaceAll("\n", " "),
	);
	console.log("=".repeat(60));
	console.log("");
}
