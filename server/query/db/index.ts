import { FFRequest, RouteHandler, Router } from "@wxn0brp/falcon-frame";
import { dbLogic } from "./logic";

const router = new Router();

function getQuery(req: FFRequest) {
	const { query, params } = req.body;
	if (query) return query;
	if (params) return {};
	const data = Array.isArray(params) ? params[0] : params;
	return data || {};
}

router.post("/:type", async (req, res) => {
	const result = await dbLogic({
		type: req.params.type,
		dbName: req.body.db,
		userId: req.user._id,
		query: getQuery(req),
		keys: req.body.keys || [],
		undefinedPaths: req.body.undefinedPaths,
	});

	result.ff(res);
});

router.post("/:db/:type", async (req, res) => {
	const collection = req.query?.c || "";

	const result = await dbLogic({
		type: req.params.type,
		dbName: req.params.db,
		userId: req.user._id,
		query: {
			collection,
			...getQuery(req),
		},
		keys: req.body.keys || [],
		undefinedPaths: req.body.undefinedPaths,
	});

	result.ff(res);
});

export const rootRouter: RouteHandler = async (req, res) => {
	const result = await dbLogic({
		type: req.body.op,
		dbName: req.body.db,
		userId: req.user._id,
		query: getQuery(req),
		keys: req.body.keys || [],
		undefinedPaths: req.body.undefinedPaths,
	});

	result.ff(res);
};

export default router;
