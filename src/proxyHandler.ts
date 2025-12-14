import { type Request, type Response, type NextFunction, raw } from "express";
import { config } from "./config.js";
import logger from "./logger.js";
import { normalizeRequestHeaders } from "./httpHeaders.js";
import { normalizeUsage, computeCostUSD } from "./billing.js";
import { updateStats } from "./stats.js";
import { TextDecoder } from "util";

const isBodylessMethod = (method: string) => ["GET", "HEAD"].includes(method.toUpperCase());

export async function proxyHandler(req: Request, res: Response, next: NextFunction) {
	const requestId = (req as any).requestId || res.locals.requestId;

	const originalUrl = req.originalUrl || "";
	const isAnthropic = originalUrl === "/anthropic" || originalUrl.startsWith("/anthropic/");
	const isOpenAI = originalUrl === "/openai" || originalUrl.startsWith("/openai/");

	const upstreamBase = isAnthropic ? config.ANTHROPIC_API_URL : config.OPENAI_API_URL;

	// Strip the provider prefix from the upstream path
	let upstreamPath = originalUrl;
	if (isAnthropic) upstreamPath = upstreamPath.replace(/^\/anthropic(?=\/|$)/, "");
	if (isOpenAI) upstreamPath = upstreamPath.replace(/^\/openai(?=\/|$)/, "");
	if (upstreamPath === "") upstreamPath = "/";

	const targetUrl = upstreamBase + upstreamPath;

	logger.debug("Computed upstream targetUrl", {
		requestId,
		method: req.method,
		url: req.originalUrl,
		targetUrl,
		provider: isAnthropic ? "anthropic" : "openai",
	});

	const abortController = new AbortController();
	const timeout = setTimeout(() => {
		abortController.abort();
	}, config.FETCH_TIMEOUT_MS);

	const start = Date.now();
	let bytesSent = 0;
	const clientToken: string | undefined = res.locals.clientToken;
	let lastModel: string | undefined;
	let lastUsage = null as ReturnType<typeof normalizeUsage> | null;

	try {
		const { headers } = normalizeRequestHeaders(req);

		let body: any | undefined;
		if (!isBodylessMethod(req.method)) {
			const rawBody: Buffer | undefined = req.body;
			if (rawBody && rawBody.length > 0) {
				const contentType = req.headers["content-type"];
				body = rawBody;
				logger.debug("Outgoing request body info", {
					requestId,
					method: req.method,
					url: req.originalUrl,
					contentType,
					bodyLength: rawBody.length,
				});
			}
		}

		logger.info("Proxying request to upstream", {
			requestId,
			method: req.method,
			url: req.originalUrl,
			targetUrl,
		});

		console.log(targetUrl, {
			method: req.method,
			headers,
			body,
			signal: abortController.signal,
		});

		const fetchResponse = await fetch(targetUrl, {
			method: req.method,
			headers,
			body,
			signal: abortController.signal,
		});

		clearTimeout(timeout);

		res.status(fetchResponse.status);

		fetchResponse.headers.forEach((value, key) => {
			const lower = key.toLowerCase();
			if (
				["content-length", "transfer-encoding", "connection", "keep-alive", "content-encoding"].includes(
					lower
				)
			) {
				return;
			}
			res.setHeader(key, value);
		});

		const contentType = fetchResponse.headers.get("content-type") || "";

		if (contentType.includes("text/event-stream")) {
			res.setHeader("Cache-Control", "no-cache");
			res.setHeader("Connection", "keep-alive");

			const bodyStream = fetchResponse.body;
			if (!bodyStream) {
				res.end();
				return;
			}

			const reader = bodyStream.getReader();
			const textDecoder = new TextDecoder();
			let sseBuffer = "";
			let aborted = false;

			const onClientClose = () => {
				if (aborted) return;
				aborted = true;
				abortController.abort();
				clearTimeout(timeout);
				reader.cancel().catch((err) => {
					logger.warn("Error cancelling upstream reader after client disconnect", {
						requestId,
						error: (err as Error).message,
					});
				});
				logger.warn("Client disconnected during stream", {
					requestId,
					method: req.method,
					url: req.originalUrl,
				});
			};

			req.on("close", onClientClose);

			logger.info("Stream started", {
				requestId,
				method: req.method,
				url: req.originalUrl,
			});

			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					if (value) {
						bytesSent += value.byteLength ?? value.length ?? 0;
						res.write(Buffer.from(value));

						try {
							const chunkText = textDecoder.decode(value, { stream: true });
							sseBuffer += chunkText;

							const lines = sseBuffer.split(/\r?\n/);
							sseBuffer = lines.pop() || "";

							for (const line of lines) {
								const m = /^data:\s*(.+)\s*$/i.exec(line);
								if (!m) continue;
								const payload = m[1];
								if (payload === "[DONE]") continue;

								try {
									const obj = JSON.parse(payload);

									const usageObj = obj?.usage || obj?.response?.usage;
									const modelVal =
										obj?.model ||
										obj?.response?.model ||
										(Array.isArray(obj?.data) && obj.data[0]?.model) ||
										undefined;

									const u = normalizeUsage(usageObj);
									if (u) lastUsage = u;
									if (typeof modelVal === "string") lastModel = modelVal;
								} catch {}
							}
						} catch {}
					}
				}
			} catch (err) {
				if ((err as any).name === "AbortError") {
					logger.warn("Upstream stream aborted", {
						requestId,
						method: req.method,
						url: req.originalUrl,
					});
				} else {
					logger.error("Stream error", {
						requestId,
						method: req.method,
						url: req.originalUrl,
						error: (err as Error).message,
					});
				}
			} finally {
				try {
					const usd = computeCostUSD(lastModel, lastUsage);
					if (clientToken) {
						void updateStats(clientToken, lastModel, lastUsage, usd);
					}
				} catch {}

				const durationMs = Date.now() - start;
				logger.info("Stream finished", {
					requestId,
					method: req.method,
					url: req.originalUrl,
					durationMs,
					bytesSent,
				});
				res.end();
			}

			return;
		}

		// Нестримающий ответ — буферизуем и отдаем целиком
		const arrayBuffer = await fetchResponse.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);
		bytesSent = buffer.length;

		// Try to extract usage/model for billing if JSON
		try {
			if (contentType.includes("application/json")) {
				const text = buffer.toString("utf8");
				const json = JSON.parse(text);

				const usageObj = json?.usage || json?.response?.usage;
				const modelVal =
					json?.model ||
					json?.response?.model ||
					(Array.isArray(json?.data) && json.data[0]?.model) ||
					undefined;

				lastUsage = normalizeUsage(usageObj);
				if (typeof modelVal === "string") lastModel = modelVal;

				const usd = computeCostUSD(lastModel, lastUsage);
				if (clientToken) {
					void updateStats(clientToken, lastModel, lastUsage, usd);
				}
			}
		} catch {
			// ignore billing parse errors
		}

		res.send(buffer);

		const durationMs = Date.now() - start;
		logger.info("Non-stream response sent", {
			requestId,
			method: req.method,
			url: req.originalUrl,
			status: fetchResponse.status,
			durationMs,
			bytesSent,
		});
	} catch (err) {
		clearTimeout(timeout);

		const anyErr = err as any;
		const isAbortError = anyErr?.name === "AbortError";

		if (isAbortError) {
			logger.warn("Upstream request aborted (timeout or client disconnect)", {
				requestId,
				method: req.method,
				url: req.originalUrl,
			});

			if (!res.headersSent) {
				res.status(504).json({ error: "Gateway Timeout" });
			} else {
				res.end();
			}
			return;
		}
		console.error(err);
		// Сетевые/прочие ошибки
		logger.error("Proxy handler error", {
			requestId,
			method: req.method,
			url: req.originalUrl,
			error: (err as Error).message,
			stack: (err as Error).stack,
		});

		if (!res.headersSent) {
			// Пусть глобальный errorHandler приведёт к единому формату
			(err as any).statusCode = (err as any).statusCode ?? 502;
			return next(err);
		}

		res.end();
	}
}
