import { NextFunction, Request, Response } from "express";
import logger from "../logger.js";

interface AppError extends Error {
	statusCode?: number;
}

export function errorHandler(err: AppError, req: Request, res: Response, _next: NextFunction) {
	const statusCode = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;

	const requestId = (req as any).requestId || res.locals.requestId;

	logger.error("Unhandled error", {
		requestId,
		method: req.method,
		url: req.originalUrl,
		statusCode,
		message: err.message,
		stack: err.stack,
	});

	if (res.headersSent) {
		return res.end();
	}

	const body =
		statusCode === 500 ? { error: "Internal Server Error" } : { error: err.message || "Request failed" };

	res.status(statusCode).json(body);
}
