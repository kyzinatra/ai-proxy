import type { Request } from "express";
import { config } from "./config.js";
import logger from "./logger.js";

const HOP_BY_HOP_HEADERS = [
	"host",
	"content-length",
	"transfer-encoding",
	"connection",
	"keep-alive",
	"upgrade",
	"expect",
];

export interface NormalizedHeadersResult {
	headers: Record<string, string>;
}

export function normalizeRequestHeaders(req: Request): NormalizedHeadersResult {
	const headers: Record<string, string> = {};

	for (const [key, value] of Object.entries(req.headers)) {
		if (typeof value === "undefined") continue;
		const lowerKey = key.toLowerCase();
		if (HOP_BY_HOP_HEADERS.includes(lowerKey)) continue;

		headers[lowerKey] = Array.isArray(value) ? value.join(", ") : String(value);
	}

	// Перезаписываем авторизацию на наш ключ
	headers["authorization"] = `Bearer ${config.OPEN_API_TOKEN}`;

	const requestId = (req as any).requestId;
	logger.debug("Authorization header overridden", {
		requestId,
		method: req.method,
		url: req.originalUrl,
	});

	// Логируем ключевые безопасные заголовки
	const safeMeta: Record<string, unknown> = {
		requestId,
		method: req.method,
		url: req.originalUrl,
	};

	const important = ["x-request-id", "openai-organization", "user-agent", "x-forwarded-for"];

	for (const name of important) {
		const v = headers[name];
		if (v) {
			safeMeta[name] = v;
		}
	}

	logger.debug("Request headers (safe subset)", safeMeta);

	return { headers };
}
