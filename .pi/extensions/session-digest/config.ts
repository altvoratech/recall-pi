import { readSettings } from "../shared/settings.ts";
import type { SessionDigestConfig } from "./types.ts";

const DEFAULT_SUMMARIZER_PROVIDER = "opencode-go";
const DEFAULT_SUMMARIZER_MODEL = "deepseek-v4-pro";

export const DEFAULT_CONFIG: SessionDigestConfig = {
	enabled: true,
	notifyAfterTurns: 24,
	remindEveryTurns: 12,
	recentWithinTurns: 8,
	summarizerProvider: DEFAULT_SUMMARIZER_PROVIDER,
	summarizerModel: DEFAULT_SUMMARIZER_MODEL,
	maxTokens: 8192,
};

function asObject(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function asNonNegativeInt(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

export function loadConfig(cwd: string): SessionDigestConfig {
	const { settings } = readSettings(cwd);
	const digest = asObject(settings.sessionDigest);
	const compaction = asObject(settings.compaction);

	return {
		enabled: typeof digest?.enabled === "boolean" ? digest.enabled : DEFAULT_CONFIG.enabled,
		notifyAfterTurns: asNonNegativeInt(digest?.notifyAfterTurns, DEFAULT_CONFIG.notifyAfterTurns),
		remindEveryTurns: asNonNegativeInt(digest?.remindEveryTurns, DEFAULT_CONFIG.remindEveryTurns),
		recentWithinTurns: asNonNegativeInt(digest?.recentWithinTurns, DEFAULT_CONFIG.recentWithinTurns),
		summarizerProvider:
			typeof digest?.summarizerProvider === "string"
				? digest.summarizerProvider
				: typeof compaction?.summarizerProvider === "string"
					? compaction.summarizerProvider
					: DEFAULT_CONFIG.summarizerProvider,
		summarizerModel:
			typeof digest?.summarizerModel === "string"
				? digest.summarizerModel
				: typeof compaction?.summarizerModel === "string"
					? compaction.summarizerModel
					: DEFAULT_CONFIG.summarizerModel,
		maxTokens: asNonNegativeInt(digest?.maxTokens, DEFAULT_CONFIG.maxTokens),
	};
}
