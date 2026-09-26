import { ValtheraCreate } from "@wxn0brp/db";
import { VQuery } from "@wxn0brp/db-core/types/query";
import FalconFrame from "@wxn0brp/falcon-frame";
import { deserializeFunctions } from "@wxn0brp/wts-run-fn";
import path from "path";

const app = new FalconFrame();
const dbDir = process.env.DB_DIR || process.cwd();
const port = parseInt(process.env.PORT) || 3333;
const db = ValtheraCreate(dbDir);

app.setOrigin([
	"*",
]);

app.post("/db/:type", async (req, res) => {
	const { type } = req.params;
	const { keys, query } = req.body as {
		keys: string[][];
		query: VQuery;
	};

	if (!type || typeof db[type] !== "function") {
		res.status(400);
		return {
			err: true,
			msg: "Invalid type",
		};
	}
	const str = type + "(" + Bun.JSON5.stringify(query) + ")";
	console.log(str);

	try {
		let result: any = null;

		if (type === "getCollections") {
			result = await db.getCollections();
		} else if (type.includes("Collection")) {
			result = await db[type](query.collection);
		} else {
			const parsedParams = deserializeFunctions(query, keys || []);
			result = await db[type](parsedParams);
		}

		return {
			err: false,
			result,
		};
	} catch (e: any) {
		console.error(e);
		res.status(500);
		return {
			err: true,
			msg: e.message,
		};
	}
});

app.listen(port, () => {
	console.log(`ValtheraDB dev server running at http://localhost:${port}`);
	console.log(`Using database at: ${path.resolve(dbDir)}`);
	console.log();
	console.warn(
		"    \x1b[33mWARNING: This is a development server and should not be used in production.\x1b[0m",
	);
	console.log();
});
