import { Router } from "@wxn0brp/falcon-frame";
import { runtime_dir } from "../init/vars";
import { parseCSV } from "../utils/csvParser";
import { isPathSafe } from "../utils/path";
import logger from "../utils/logger";
import { checkPermission } from "../utils/perm";
import { getDb } from "./query/utils";

const router = new Router();

function csvField(value: unknown) {
	const text =
		value == null
			? ""
			: typeof value === "object"
				? JSON.stringify(value)
				: String(value);
	return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

router.post("/import", async (req, res) => {
	const dbName = req.body.db;
	const csvContent = req.body.content;
	const collection = (req.body.collection as string) || "";
	const dryRun = req.body.dryRun === true;

	if (!dbName || !csvContent || !collection) {
		return res.status(400).json({
			err: true,
			msg: "db, content, and collection are required",
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
		let parsed: ReturnType<typeof parseCSV>;
		try {
			parsed = parseCSV(csvContent);
		} catch (err) {
			return res.status(400).json({
				err: true,
				msg: err.message,
			});
		}

		const type = "add";
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

		if (collection && !isPathSafe(runtime_dir, dir, collection)) {
			return res.status(400).json({
				err: true,
				msg: "Invalid collection: " + collection,
			});
		}
		if (dryRun)
			return res.json({
				err: false,
				count: parsed.length,
			});

		const results = [];
		for (const [index, row] of parsed.entries()) {
			try {
				results.push(
					await db.add({
						collection,
						data: row,
					}),
				);
			} catch (err) {
				logger.error(err);
				return res.status(500).json({
					err: true,
					msg: err.message,
					row: index + 2,
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
	const collection = (req.body.collection as string) || "";

	if (!dbName || !collection) {
		return res.status(400).json({
			err: true,
			msg: "db and collection is required",
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

		if (collection && !isPathSafe(runtime_dir, dir, collection)) {
			return res.status(400).json({
				err: true,
				msg: "Invalid collection: " + collection,
			});
		}

		const data = await db.find({
			collection,
			search: {},
		});
		const keys = [
			...new Set(data.flatMap(item => Object.keys(item))),
		];
		const rows = data
			.map(item => keys.map(key => csvField(item[key])).join(","))
			.join("\n");
		const result = `${keys.map(csvField).join(",")}\n${rows}`;

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
