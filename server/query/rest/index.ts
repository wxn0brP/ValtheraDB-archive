import { Router } from "@wxn0brp/falcon-frame";
import { dbLogic } from "../db/logic";
import { VQueryT } from "@wxn0brp/db-core/types/query";

const router = new Router();

router.get("/:db/:collection", async (req, res) => {
	const { db, collection } = req.params;
	const search = req.query || {};

	const query: VQueryT.Find = {
		collection,
		search: Object.keys(search).length > 0 ? search : undefined,
	};

	const result = await dbLogic({
		type: "find",
		dbName: db,
		userId: req.user._id,
		query,
	});

	result.ff(res);
});

router.post("/:db/:collection", async (req, res) => {
	const { db, collection } = req.params;
	const data = req.body;

	const query: VQueryT.Add = {
		collection,
		data,
	};

	const result = await dbLogic({
		type: "add",
		dbName: db,
		userId: req.user._id,
		query,
	});

	result.ff(res);
});

router.patch("/:db/:collection", async (req, res) => {
	const { db, collection } = req.params;
	const { search, updater, data } = req.body;

	const query: VQueryT.Update = {
		collection,
		search: search || {},
		updater: updater || data || {},
	};

	const result = await dbLogic({
		type: "update",
		dbName: db,
		userId: req.user._id,
		query,
	});

	result.ff(res);
});

router.delete("/:db/:collection", async (req, res) => {
	const { db, collection } = req.params;
	const search = req.body?.search || req.query || {};

	const query: VQueryT.Remove = {
		collection,
		search,
	};

	const result = await dbLogic({
		type: "remove",
		dbName: db,
		userId: req.user._id,
		query,
	});

	result.ff(res);
});

router.get("/one/:db/:collection", async (req, res) => {
	const { db, collection } = req.params;
	const search = req.query || {};

	const query: VQueryT.FindOne = {
		collection,
		search: Object.keys(search).length > 0 ? search : {},
	};

	const result = await dbLogic({
		type: "findOne",
		dbName: db,
		userId: req.user._id,
		query,
	});

	result.ff(res);
});

router.patch("/one/:db/:collection", async (req, res) => {
	const { db, collection } = req.params;
	const { search, updater, data } = req.body;

	const query: VQueryT.Update = {
		collection,
		search: search || {},
		updater: updater || data || {},
	};

	const result = await dbLogic({
		type: "updateOne",
		dbName: db,
		userId: req.user._id,
		query,
	});

	result.ff(res);
});

router.delete("/one/:db/:collection", async (req, res) => {
	const { db, collection } = req.params;
	const search = req.body?.search || req.query || {};

	const query: VQueryT.Remove = {
		collection,
		search,
	};

	const result = await dbLogic({
		type: "removeOne",
		dbName: db,
		userId: req.user._id,
		query,
	});

	result.ff(res);
});

export default router;
