import { Router } from "@wxn0brp/falcon-frame";
import { PluginSystem } from "@wxn0brp/falcon-frame-plugin";
import { createRateLimiterPlugin } from "@wxn0brp/falcon-frame-plugin/plugins/rateLimit";
import { authMiddleware } from "../auth/auth";
import { auditMiddleware } from "../middleware/audit";
import csvRouter from "../query/csvFile";
import dbRouter, { rootRouter } from "../query/db";
import queryRouter from "../query/query";
import { relationRouter } from "../query/relation";
import restRouter from "../query/rest";
import sqlRouter from "../query/sqlFile";

const apiLimiter = new PluginSystem();
apiLimiter.register(
	createRateLimiterPlugin({
		maxRequests: parseInt(process.env.RATE_LIMIT_API_MAX) || 100,
		windowMs: parseInt(process.env.RATE_LIMIT_API_WINDOW) || 60_000,
		id: req => req.ip,
		onLimitReached: (req, res) => {
			res.status(429).json({
				err: true,
				msg: "Too many requests",
			});
		},
	}),
);

export const apiRouter = new Router();
apiRouter.use(apiLimiter.getRouteHandler());
apiRouter.use(authMiddleware);
apiRouter.use(auditMiddleware);
apiRouter.use((req, res, next) => {
	res.setHeader("Connection", "keep-alive");
	res.setHeader(
		"Cache-Control",
		"no-store, no-cache, must-revalidate, max-age=0",
	);
	res.setHeader("Pragma", "no-cache");
	next();
});
apiRouter.use("/db", dbRouter);
apiRouter.use("/q", queryRouter);
apiRouter.use("/r", relationRouter);
apiRouter.use("/rest", restRouter);
apiRouter.use("/sql", sqlRouter);
apiRouter.use("/csv", csvRouter);
apiRouter.post("/", rootRouter);
