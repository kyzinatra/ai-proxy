import fs from "fs/promises";
import logger from "./logger.js";
import { config } from "./config.js";
import type { NormalizedUsage } from "./billing.js";

type ModelStats = {
	usd: number;
	input: number;
	output: number;
	total: number;
	requests: number;
};

type TokenStats = {
	totalUsd: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalTokens: number;
	byModel: Record<string, ModelStats>;
};

type StatsFile = Record<string, TokenStats>;

async function readStatsFile(): Promise<StatsFile> {
	try {
		const buf = await fs.readFile(config.STATS_FILE, "utf8");
		const json = JSON.parse(buf);
		if (json && typeof json === "object") {
			return json as StatsFile;
		}
		return {};
	} catch (err: any) {
		if (err?.code === "ENOENT") {
			return {};
		}
		logger.warn("Failed to read stats file", {
			error: String(err?.message || err),
			file: config.STATS_FILE,
		});
		return {};
	}
}

async function writeStatsFile(data: StatsFile): Promise<void> {
	const json = JSON.stringify(data, null, 2) + "\n";
	await fs.writeFile(config.STATS_FILE, json, "utf8");
}

let writeQueue: Promise<void> = Promise.resolve();

export function updateStats(
	token: string,
	model: string | undefined | null,
	usage: NormalizedUsage | null,
	usd: number
): Promise<void> {
	const safeUsd = Number.isFinite(usd) && usd > 0 ? usd : 0;
	const u = usage || { input: 0, output: 0, total: 0 };

	writeQueue = writeQueue
		.then(async () => {
			const stats = await readStatsFile();

			if (!stats[token]) {
				stats[token] = {
					totalUsd: 0,
					totalInputTokens: 0,
					totalOutputTokens: 0,
					totalTokens: 0,
					byModel: {},
				};
			}

			const tokenStats = stats[token];
			tokenStats.totalUsd = round6(tokenStats.totalUsd + safeUsd);
			tokenStats.totalInputTokens += u.input;
			tokenStats.totalOutputTokens += u.output;
			tokenStats.totalTokens += u.total;

			const key = (model || "unknown").toString();
			if (!tokenStats.byModel[key]) {
				tokenStats.byModel[key] = {
					usd: 0,
					input: 0,
					output: 0,
					total: 0,
					requests: 0,
				};
			}
			const ms = tokenStats.byModel[key];
			ms.usd = round6(ms.usd + safeUsd);
			ms.input += u.input;
			ms.output += u.output;
			ms.total += u.total;
			ms.requests += 1;

			await writeStatsFile(stats);
			logger.info("Stats updated", {
				tokenSuffix: token.slice(-4),
				model: key,
				usd: safeUsd,
				input: u.input,
				output: u.output,
				total: u.total,
				file: config.STATS_FILE,
			});
		})
		.catch((err) => {
			logger.error("Failed to update stats", {
				error: String((err as Error)?.message || err),
				file: config.STATS_FILE,
			});
		});

	return writeQueue;
}

function round6(n: number): number {
	return Math.round(n * 1_000_000) / 1_000_000;
}
