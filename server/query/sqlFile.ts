import { isKnownOp } from "@wxn0brp/db-core/utils/opKind";
import { Router } from "@wxn0brp/falcon-frame";
import { runtime_dir } from "../init/vars";
import { isPathSafe } from "../utils/path";
import logger from "../utils/logger";
import { checkPermission } from "../utils/perm";
import { SQLFileCreator } from "../utils/sqlFileExport";
import sqlSplitter from "../utils/sqlFileImport";
import { getDb, ValtheraParsers } from "./query/utils";

const router = new Router();

function decodeInsert(
	querySql: string,
	data: Record<string, unknown>,
	jsonColumns: Set<string>,
) {
	const match = querySql.match(/\bVALUES\s*\(([\s\S]*)\)\s*$/i);
	if (!match) return data;
	const tokens: string[] = [];
	let token = "";
	let quote = "";
	for (let i = 0; i < match[1].length; i++) {
		const ch = match[1][i];
		if (quote) {
			token += ch;
			if (ch === "\\" && match[1][i + 1]) token += match[1][++i];
			else if (ch === quote && match[1][i + 1] === quote)
				token += match[1][++i];
			else if (ch === quote) quote = "";
		} else if (ch === "'" || ch === '"') {
			quote = ch;
			token += ch;
		} else if (ch === ",") {
			tokens.push(token.trim());
			token = "";
		} else token += ch;
	}
	if (quote) throw new Error("SQL: unterminated insert value");
	tokens.push(token.trim());
	const keys = Object.keys(data);
	if (tokens.length !== keys.length) return data;
	return Object.fromEntries(
		keys.map((key, index) => {
			const raw = tokens[index];
			if (/^NULL$/i.test(raw))
				return [
					key,
					null,
				];
			if (/^TRUE$/i.test(raw))
				return [
					key,
					true,
				];
			if (/^FALSE$/i.test(raw))
				return [
					key,
					false,
				];
			if (/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw))
				return [
					key,
					Number(raw),
				];
			if (raw.startsWith("'") && raw.endsWith("'")) {
				const value = raw
					.slice(1, -1)
					.replace(/''/g, "'")
					.replace(
						/\\([\\0nrtZ])/g,
						(_, escapedChar) =>
							({
								"\\": "\\",
								"0": "\0",
								n: "\n",
								r: "\r",
								t: "\t",
								Z: "\x1a",
							})[escapedChar],
					);
				return [
					key,
					jsonColumns.has(key) ? JSON.parse(value) : value,
				];
			}
			return [
				key,
				data[key],
			];
		}),
	);
}

router.post("/import", async (req, res) => {
	const dbName = req.body.db;
	const sqlContent = req.body.content;
	const dryRun = req.body.dryRun === true;

	if (!dbName || !sqlContent) {
		return res.status(400).json({
			err: true,
			msg: "db and content are required",
		});
	}

	const dbGet = getDb(dbName);
	if (!dbGet) {
		return res.status(400).json({
			err: true,
			msg: "Invalid data center.",
		});
	}

	const { db, dir } = dbGet;

	try {
		const parser = ValtheraParsers["sql"];
		if (!parser) {
			return res.status(400).json({
				err: true,
				msg: "SQL parser not available.",
			});
		}

		let queries: ReturnType<typeof parser.parse>[];
		try {
			const queriesSQL = sqlSplitter.parse(sqlContent);
			const jsonByCollection = new Map<string, Set<string>>();
			queries = queriesSQL.map(querySQL => {
				const query = parser.parse(querySQL);
				const create = querySQL.match(
					/^CREATE TABLE (?:IF NOT EXISTS )?"?([^"\s(]+)"?\s*\(([^)]*)\)/i,
				);
				if (create)
					jsonByCollection.set(
						create[1],
						new Set(
							[
								...create[2].matchAll(/"?([^",\s]+)"?\s+JSON\b/gi),
							].map(match => match[1]),
						),
					);
				if (query.method === "add" && query.query?.data)
					query.query.data = decodeInsert(
						querySQL,
						query.query.data,
						jsonByCollection.get(query.query.collection) ?? new Set(),
					);
				return query;
			});
		} catch (err) {
			return res.status(400).json({
				err: true,
				msg: err.message,
			});
		}

		for (const query of queries) {
			const type = query.method;

			if (!isKnownOp(type)) {
				return res.status(400).json({
					err: true,
					msg: `Invalid query type: ${type}`,
				});
			}

			if (!db[type] || typeof db[type] !== "function") {
				return res.status(400).json({
					err: true,
					msg: `Invalid query type: ${type}`,
				});
			}

			if (!(await checkPermission(req.user._id, type, dbName))) {
				return res.status(403).json({
					err: true,
					msg: "Access denied for query type: " + type,
				});
			}

			const collection = query.query.collection;
			if (collection && !isPathSafe(runtime_dir, dir, collection)) {
				return res.status(400).json({
					err: true,
					msg: "Invalid collection: " + collection,
				});
			}
		}

		if (dryRun)
			return res.json({
				err: false,
				count: queries.length,
			});

		const results = [];
		for (const [index, query] of queries.entries()) {
			try {
				results.push(await db[query.method](query.query));
			} catch (err) {
				logger.error(err);
				return res.status(500).json({
					err: true,
					msg: err.message,
					statement: index + 1,
					imported: results.length,
				});
			}
		}

		return res.json({
			err: false,
			results,
		});
	} catch (err) {
		logger.error(err);
		return res.status(500).json({
			err: true,
			msg: err.message,
		});
	}
});

router.post("/export", async (req, res) => {
	const dbName = req.body.db;
	const collections = (req.body.collections as string[]) || [];
	const opts = req.body.opts || {};

	if (!dbName) {
		return res.status(400).json({
			err: true,
			msg: "db is required",
		});
	}

	const dbGet = getDb(dbName);
	if (!dbGet) {
		return res.status(400).json({
			err: true,
			msg: "Invalid data center.",
		});
	}

	const { db, dir } = dbGet;

	try {
		if (!(await checkPermission(req.user._id, "find", dbName)))
			return res.status(403).json({
				err: true,
				msg: "Access denied for query type: find",
			});
		const creator = new SQLFileCreator(db, opts);

		if (collections.length > 0) {
			for (const collection of collections) {
				if (!isPathSafe(runtime_dir, dir, collection)) {
					return res.status(400).json({
						err: true,
						msg: "Invalid collection: " + collection,
					});
				}
			}
		}

		const result = await creator.create(collections);
		return res.json({
			err: false,
			result,
		});
	} catch (err) {
		logger.error(err);
		return res.status(500).json({
			err: true,
			msg: err.message,
		});
	}
});

export default router;
