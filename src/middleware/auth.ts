import type { Request, Response, NextFunction } from "express";
import { config } from "../config.js";
import logger from "../logger.js";

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
	const requestId = (req as any).requestId || res.locals.requestId;

	const rawAuth = req.headers["authorization"];
	const authHeader = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth || "";

	const match = /^Bearer\s+(.+)$/i.exec(authHeader);
	const clientToken = match?.[1]?.trim();

	if (!clientToken) {
		logger.warn("Missing or invalid Authorization header", {
			requestId,
			method: req.method,
			url: req.originalUrl,
		});
		return res.status(403).json({ error: "Forbidden" });
	}

	const allowed = config.ALLOWED_TOKENS;
	if (allowed.length > 0 && !allowed.includes(clientToken)) {
		logger.warn("Authorization token not allowed", {
			requestId,
			method: req.method,
			url: req.originalUrl,
		});
		return res.status(403).json({ error: "Forbidden" });
	}

	res.locals.clientToken = clientToken;

	logger.debug("Client token authorized", {
		requestId,
		method: req.method,
		url: req.originalUrl,
	});

	next();
}
