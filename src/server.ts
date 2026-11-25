import { ValtheraCreate } from "@wxn0brp/db";
import { isValtheraError } from "@wxn0brp/db-core/errors";
import { VQuery } from "@wxn0brp/db-core/types/query";
import { getOpKind, isKnownOp } from "@wxn0brp/db-core/utils/opKind";
import FalconFrame from "@wxn0brp/falcon-frame";
import path from "path";
import { deserializeRegex } from "./serialize";

const app = new FalconFrame();
const dbDir = process.env.DB_DIR || process.cwd();
const port = parseInt(process.env.PORT) || 3333;
const db = ValtheraCreate(dbDir);

app.setOrigin([
	"*",
]);

app.post("/db/:type", async (req, res) => {
	const { type } = req.params;
	const { query } = req.body as {
		query: VQuery;
	};

	if (!type || !isKnownOp(type) || typeof db[type] !== "function") {
		res.status(400);
		return {
			err: true,
			msg: "Invalid type",
		};
	}
	const str = type + "(" + Bun.JSON5.stringify(query) + ")";
	console.log(str);

	const kind = getOpKind(type);

	try {
		let result: any = null;

		if (type === "getCollections") {
			result = await db.getCollections();
		} else if (type === "capabilities") {
			result = await db.capabilities();
		} else if (kind === "collection") {
			result = await db[type](query.collection);
		} else if (kind === "index") {
			result = await db.execute(type as any, deserializeRegex(query));
		} else {
			result = await db[type](deserializeRegex(query));
		}

		return {
			err: false,
			result,
		};
	} catch (e: any) {
		console.error(e);
		res.status(500);
		const payload: Record<string, any> = isValtheraError(e) ? e.toJSON() : {};
		return {
			err: true,
			msg: e?.message,
			...(payload.code
				? {
						code: payload.code,
					}
				: {}),
			...(payload.suggestion
				? {
						suggestion: payload.suggestion,
					}
				: {}),
			...(payload.context
				? {
						context: payload.context,
					}
				: {}),
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
