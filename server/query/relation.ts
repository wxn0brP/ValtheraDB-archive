import { Id, Relation, RelationTypes, ValtheraCompatible } from "@wxn0brp/db";
import { RemoteConfig, ValtheraRemote } from "@wxn0brp/db-client";
import { Valthera } from "@wxn0brp/db/valthera";
import { Router } from "@wxn0brp/falcon-frame";
import { dataCenter } from "../init/initDataBases";
import { runtime_dir } from "../init/vars";
import { isPathSafe } from "../utils/path";
import logger from "../utils/logger";
import { checkPermission } from "../utils/perm";
import { deserializeRegex } from "../utils/regex";

export const relationRouter = new Router();

interface AccessCfg {
	[key: string]: RemoteConfig | string;
}

async function createRelation(
	accessCfg: AccessCfg,
	userId: Id,
	res: any,
): Promise<Relation | false> {
	const dbs: {
		[key: string]: ValtheraCompatible;
	} = {};

	for (const key in accessCfg) {
		const remote = accessCfg[key];
		if (typeof remote === "string") {
			if (!dataCenter[remote]) {
				res.status(400).json({
					err: true,
					msg: `remote ${remote} not found`,
				});
				return false;
			}

			dbs[key] = dataCenter[remote].db as Valthera;

			if (!(await checkPermission(userId, "find", remote))) {
				res.status(403).json({
					err: true,
					msg: `access denied to ${remote}`,
				});
				return false;
			}
		} else {
			dbs[key] = new ValtheraRemote(remote);
		}
	}

	const relation = new Relation(dbs);
	return relation;
}

function checkCollections(
	baseDir: string,
	accessCfg: AccessCfg,
	relation: RelationTypes.Relation,
): boolean | RelationTypes.Path {
	for (const cfg of Object.values(relation)) {
		if (!cfg || typeof cfg !== "object")
			return [
				"<invalid>",
				"entry",
			];
		const relPath = cfg.path;
		if (!Array.isArray(relPath) || relPath.length !== 2)
			return [
				"<invalid>",
				"path",
			];
		const [db, collection] = relPath;
		if (typeof db !== "string" || typeof collection !== "string")
			return [
				"<invalid>",
				"path",
			];
		if (!Object.hasOwn(accessCfg, db)) return relPath;

		const remote = accessCfg[db];
		const isRemote = typeof remote !== "string";
		if (!isRemote) {
			const dir = dataCenter[remote as string]?.dir;
			if (!dir || !isPathSafe(baseDir, dir, collection)) return relPath;
		}

		if (cfg.relations) {
			const res = checkCollections(baseDir, accessCfg, cfg.relations);
			if (res !== true) return res;
		}
	}
	return true;
}

relationRouter.post("/:type", async (req, res) => {
	const { type } = req.params as {
		type: string;
	};

	if (!req.body.accessCfg)
		return res.status(400).json({
			err: true,
			msg: "accessCfg is required",
		});

	try {
		const relation = await createRelation(
			req.body.accessCfg,
			req.user._id,
			res,
		);
		if (!relation) return;

		if (type !== "find" && type !== "findOne")
			return res.status(400).json({
				err: true,
				msg: "invalid type",
			});

		const params = req.body.params as (Object | string)[];
		if (!params || params.length <= 2)
			return res.status(400).json({
				err: true,
				msg: "params is required",
			});

		const collection = params.shift() as string[];
		if (
			!Array.isArray(collection) ||
			collection.length !== 2 ||
			typeof collection[0] !== "string" ||
			typeof collection[1] !== "string"
		)
			return res.status(400).json({
				err: true,
				msg: "collection is required",
			});

		const localName = req.body.accessCfg[collection[0]];
		if (localName === undefined)
			return res.status(400).json({
				err: true,
				msg: "unknown database in collection path",
			});
		if (typeof localName === "string") {
			const dir = dataCenter[localName]?.dir;
			if (!dir || !isPathSafe(runtime_dir, dir, collection[1]))
				return res.status(400).json({
					err: true,
					msg: "invalid collection",
				});
		}

		const check = checkCollections(
			runtime_dir,
			req.body.accessCfg,
			params[1] as any,
		);
		if (typeof check === "object")
			return res.status(400).json({
				err: true,
				msg: "invalid accessCfg collection " + JSON.stringify(check),
			});

		let search = params.shift();
		if (
			search !== undefined &&
			(search === null || typeof search !== "object" || Array.isArray(search))
		)
			return res.status(400).json({
				err: true,
				msg: "search must be an object",
			});
		if (search) search = deserializeRegex(search);

		const relationFn = relation[type] as (...args: any[]) => Promise<any>;
		const result = await relationFn(collection, search, ...(params as any[]));

		res.json({
			err: false,
			result,
		});
	} catch (err) {
		logger.error(err);
		res.status(500).json({
			err: true,
			msg: err.message,
		});
	}
});
