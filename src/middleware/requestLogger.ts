import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import logger from "../logger.js";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
	const requestId = uuidv4();
	const start = Date.now();

	(req as any).requestId = requestId;
	res.locals.requestId = requestId;

	res.on("finish", () => {
		const duration = Date.now() - start;
		const { method, originalUrl } = req;
		const status = res.statusCode;

		logger.info("Request completed", {
			requestId,
			method,
			url: originalUrl,
			status,
			durationMs: duration,
			userAgent: req.headers["user-agent"],
			ip: req.ip,
		});
	});

	logger.http("Incoming request", {
		requestId,
		method: req.method,
		url: req.originalUrl,
	});

	next();
}
