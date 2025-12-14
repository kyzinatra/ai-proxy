import type { Request } from "express";
import { config } from "./config.js";
import logger from "./logger.js";

const HOP_BY_HOP_HEADERS = [
	"host",
	"content-length",
	"transfer-encoding",
	"content-encoding",
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

	const requestId = (req as any).requestId;

	const originalUrl = req.originalUrl || "";
	const isAnthropic = originalUrl === "/anthropic" || originalUrl.startsWith("/anthropic/");
	const isOpenAI = originalUrl === "/openai" || originalUrl.startsWith("/openai/");

	if (isAnthropic) {
		// Anthropic expects `x-api-key` + `anthropic-version`. Do not forward any client Authorization.
		delete headers["authorization"];
		headers["x-api-key"] = config.ANTHROPIC_API_TOKEN;
		headers["anthropic-version"] = headers["anthropic-version"] || "2023-06-01";
	} else if (isOpenAI) {
		headers["authorization"] = `Bearer ${config.OPENAI_API_TOKEN}`;
	} else {
		headers["authorization"] = `Bearer ${config.OPENAI_API_TOKEN}`;
	}

	logger.debug("Upstream auth injected", {
		requestId,
		method: req.method,
		url: req.originalUrl,
		provider: isAnthropic ? "anthropic" : "openai",
	});

	// Логируем ключевые безопасные заголовки
	const safeMeta: Record<string, unknown> = {
		requestId,
		method: req.method,
		url: req.originalUrl,
	};

	const important = [
		"x-request-id",
		"openai-organization",
		"anthropic-version",
		"user-agent",
		"x-forwarded-for",
	];

	for (const name of important) {
		const v = headers[name];
		if (v) {
			safeMeta[name] = v;
		}
	}

	logger.debug("Request headers (safe subset)", safeMeta);

	return { headers };
}
