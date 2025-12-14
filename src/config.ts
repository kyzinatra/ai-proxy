import dotenv from "dotenv";

dotenv.config();

export type NodeEnv = "development" | "production" | "test";

export interface AppConfig {
	PORT: number;
	OPENAI_API_URL: string;
	OPENAI_API_TOKEN: string;

	ANTHROPIC_API_URL: string;
	ANTHROPIC_API_TOKEN: string;

	NODE_ENV: NodeEnv;
	FETCH_TIMEOUT_MS: number;
	ALLOWED_TOKENS: string[];
	STATS_FILE: string;
}

const parseNodeEnv = (value: string | undefined): NodeEnv => {
	if (value === "production" || value === "test" || value === "development") {
		return value;
	}
	return "development";
};

const parseNumber = (value: string | undefined, fallback: number): number => {
	if (!value) return fallback;
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? n : fallback;
};

const validateUrl = (name: string, value: string | undefined, fallback: string): string => {
	const url = value || fallback;
	try {
		// eslint-disable-next-line no-new
		new URL(url);
		return url;
	} catch {
		throw new Error(`Invalid ${name}: ${url}`);
	}
};

export const config: AppConfig = (() => {
	const NODE_ENV = parseNodeEnv(process.env.NODE_ENV);
	const PORT = parseNumber(process.env.PORT, 3000);
	const OPENAI_API_URL = validateUrl(
		"OPENAI_API_URL",
		process.env.OPENAI_API_URL,
		"https://api.openai.com/v1"
	);
	const OPENAI_API_TOKEN = process.env.OPENAI_API_TOKEN;
	if (!OPENAI_API_TOKEN) {
		throw new Error("OPENAI_API_TOKEN is required but not provided");
	}

	const ANTHROPIC_API_URL = validateUrl(
		"ANTHROPIC_API_URL",
		process.env.ANTHROPIC_API_URL,
		"https://api.anthropic.com/v1"
	);
	const ANTHROPIC_API_TOKEN = process.env.ANTHROPIC_API_TOKEN;
	if (!ANTHROPIC_API_TOKEN) {
		throw new Error("ANTHROPIC_API_TOKEN is required but not provided");
	}

	const FETCH_TIMEOUT_MS = parseNumber(process.env.FETCH_TIMEOUT_MS, 240_000);

	const ALLOWED_TOKENS = (process.env.ALLOWED_TOKENS || "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);

	const STATS_FILE = process.env.STATS_FILE || "stats.json";

	return {
		PORT,
		OPENAI_API_URL,
		OPENAI_API_TOKEN,
		ANTHROPIC_API_URL,
		ANTHROPIC_API_TOKEN,
		NODE_ENV,
		FETCH_TIMEOUT_MS,
		ALLOWED_TOKENS,
		STATS_FILE,
	};
})();
