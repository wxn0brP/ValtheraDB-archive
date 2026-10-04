import { appendFile, readFile, writeFile } from "node:fs/promises";
import { Executor } from "@wxn0brp/db-core/helpers/executor";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

const consoleLevel: LogLevel = (
	process.env.LOG_LEVEL || "info"
).toLowerCase() as LogLevel;

const fileLevel: LogLevel = (
	process.env.LOG_LEVEL_FILE || "info"
).toLowerCase() as LogLevel;

const filePath: string | null = process.env.LOG_FILE || null;
const timestampEnabled = process.env.LOG_TIMESTAMP !== "false";
const executor = filePath ? new Executor() : null;

function shouldLog(level: LogLevel, targetLevel: LogLevel) {
	return LOG_LEVELS[level] >= LOG_LEVELS[targetLevel];
}

function formatLine(level: LogLevel, category: string, args: any[]) {
	const parts: string[] = [];
	if (timestampEnabled) parts.push(`[${new Date().toISOString()}]`);
	parts.push(`[${level.toUpperCase()}]`);
	parts.push(`[${category}]`);
	parts.push(
		args
			.map(a => (typeof a === "object" ? JSON.stringify(a) : String(a)))
			.join(" "),
	);
	return parts.join(" ");
}

function log(level: LogLevel, category: string, args: any[]) {
	const line = formatLine(level, category, args);

	if (shouldLog(level, consoleLevel)) {
		if (level === "error") console.error(line);
		else console.log(line);
	}

	if (filePath && executor && shouldLog(level, fileLevel)) {
		executor.addOp(() => appendFile(filePath, line + "\n", "utf-8"), null);
	}
}

export async function getLogEntries() {
	if (!filePath) return "";
	try {
		return await readFile(filePath, "utf-8");
	} catch {
		return "";
	}
}

export async function clearLogs() {
	if (!filePath) return;
	await writeFile(filePath, "");
}

export const logger = {
	debug: (category: string, ...args: any[]) => log("debug", category, args),
	info: (category: string, ...args: any[]) => log("info", category, args),
	warn: (category: string, ...args: any[]) => log("warn", category, args),
	error: (category: string, ...args: any[]) => log("error", category, args),
};

logger.warn("LOGGER", "Console:", consoleLevel, "File:", fileLevel);
