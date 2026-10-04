import { RouteHandler } from "@wxn0brp/falcon-frame";
import { clearLogs, getLogEntries, logger } from "../logger";
import { Squirrel } from "../squirrel";

export function registerLogs(squirrel: Squirrel) {
	const adminToken = process.env.LOG_AUTH;

	if (!adminToken) {
		logger.warn("LOGS", "LOG_AUTH not set, log endpoints will be disabled");
		return;
	}

	const authMiddleware: RouteHandler = (req, res, next) => {
		const token =
			req.body?.auth || req.headers.authorization?.replace("Bearer ", "");

		if (!token)
			return res.status(401).json({
				err: true,
				msg: "Missing auth",
			});

		if (token !== adminToken)
			return res.status(401).json({
				err: true,
				msg: "Unauthorized",
			});

		next();
	};

	squirrel.app.get("/squirrel/logs", authMiddleware, async (req, res) => {
		const content = await getLogEntries();
		res.ct("text/plain").send(content);
	});

	squirrel.app.delete("/squirrel/logs", authMiddleware, async (req, res) => {
		await clearLogs();
		return {
			err: false,
		};
	});
}
