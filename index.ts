import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { Agent, setGlobalDispatcher } from "undici";

import { config } from "./src/config.js";
import logger from "./src/logger.js";
import { requestLogger } from "./src/middleware/requestLogger.js";
import { errorHandler } from "./src/middleware/errorHandler.js";
import { proxyHandler } from "./src/proxyHandler.js";
import { authMiddleware } from "./src/middleware/auth.js";
setGlobalDispatcher(
	new Agent({
		connect: {
			timeout: +(process.env.FETCH_TIMEOUT_MS || 240_000),
		},
	})
);
const app = express();

app.enable("trust proxy");
app.use(
	express.raw({
		type: "*/*",
		limit: "200mb",
	})
);

app.use(requestLogger);

app.use(
	cors({
		origin: "*",
		methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
		allowedHeaders: [
			"Content-Type",
			"Authorization",
			"OpenAI-Organization",
			"X-Request-Id",
			"X-Forwarded-For",
			"User-Agent",
		],
		exposedHeaders: ["Content-Type"],
		maxAge: 600,
	})
);

const limiter = rateLimit({
	windowMs: 60_000,
	max: 60,
	standardHeaders: true,
	legacyHeaders: false,
	handler: (req, res) => {
		const requestId = (req as any).requestId || res.locals.requestId;
		logger.warn("Rate limit exceeded", {
			requestId,
			ip: req.ip,
			method: req.method,
			url: req.originalUrl,
		});
		res.status(429).json({ error: "Too Many Requests" });
	},
});
app.use(limiter);

app.get("/health", (req, res) => {
	res.status(200).json({
		status: "ok",
		uptime: process.uptime(),
		timestamp: Date.now(),
	});
});

app.use(authMiddleware);
app.use(proxyHandler);
app.use(errorHandler);

app.listen(config.PORT, () => {
	logger.info("Proxy server started", {
		port: config.PORT,
		env: config.NODE_ENV,
		upstream: config.OPEN_API_URL,
	});
});
