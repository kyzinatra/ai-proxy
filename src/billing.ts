export interface NormalizedUsage {
	input: number;
	output: number;
	total: number;
}

export function normalizeUsage(raw: any): NormalizedUsage | null {
	if (!raw || typeof raw !== "object") return null;

	if (
		typeof raw.input_tokens === "number" ||
		typeof raw.output_tokens === "number" ||
		typeof raw.total_tokens === "number"
	) {
		const input = Number(raw.input_tokens || 0);
		const output = Number(raw.output_tokens || 0);
		const total = Number(raw.total_tokens || input + output);
		return { input, output, total };
	}

	if (
		typeof raw.prompt_tokens === "number" ||
		typeof raw.completion_tokens === "number" ||
		typeof raw.total_tokens === "number"
	) {
		const input = Number(raw.prompt_tokens || 0);
		const output = Number(raw.completion_tokens || 0);
		const total = Number(raw.total_tokens || input + output);
		return { input, output, total };
	}

	return null;
}

type Pricing = { inputPer1K: number; outputPer1K: number };

const PRICING: Record<string, Pricing> = {
	// 4o family
	"gpt-4o": { inputPer1K: 0.005, outputPer1K: 0.015 },
	"gpt-4o-2024-05-13": { inputPer1K: 0.005, outputPer1K: 0.015 },
	"gpt-4o-2024-08-06": { inputPer1K: 0.005, outputPer1K: 0.015 },

	// 4o-mini
	"gpt-4o-mini": { inputPer1K: 0.00015, outputPer1K: 0.0006 },
	"gpt-4o-mini-2024-07-18": { inputPer1K: 0.00015, outputPer1K: 0.0006 },

	// 3.5 family (legacy)
	"gpt-3.5-turbo": { inputPer1K: 0.0005, outputPer1K: 0.0015 },
	"gpt-3.5-turbo-0125": { inputPer1K: 0.0005, outputPer1K: 0.0015 },

	// 5
	"gpt-5-2025-08-07": { inputPer1K: 1.25 / 1000, outputPer1K: 10 / 1000 },
	"gpt-5.1-2025-11-13": { inputPer1K: 1.25 / 1000, outputPer1K: 10 / 1000 },
	"gpt-5-mini-2025-08-07": { inputPer1K: 0.25 / 1000, outputPer1K: 2 / 1000 },
	"gpt-5-nano-2025-08-07": { inputPer1K: 0.05 / 1000, outputPer1K: 0.4 / 1000 },
};

function resolvePricingKey(model: string | undefined | null): string | null {
	if (!model || typeof model !== "string") return null;
	const m = model.toLowerCase();

	if (PRICING[m]) return m;

	if (m.startsWith("gpt-4o-mini")) return "gpt-4o-mini";
	if (m.startsWith("gpt-4o")) return "gpt-4o";
	if (m.startsWith("gpt-3.5-turbo")) return "gpt-3.5-turbo";

	return null;
}

export function computeCostUSD(model: string | undefined | null, usage: NormalizedUsage | null): number {
	if (!usage) return 0;
	const key = resolvePricingKey(model);
	if (!key) return 0;
	const prices = PRICING[key];
	const cost = (usage.input / 1000) * prices.inputPer1K + (usage.output / 1000) * prices.outputPer1K;

	return Math.round(cost * 1_000_000) / 1_000_000;
}
