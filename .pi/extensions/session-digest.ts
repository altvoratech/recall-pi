import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

import { findNearestProjectSettings, readSettings } from "./shared/settings.ts";

const SESSION_DIGEST_STATE_TYPE = "session-digest-state";

interface SessionDigestConfig {
	enabled: boolean;
	notifyAfterTurns: number;
	remindEveryTurns: number;
	recentWithinTurns: number;
}

interface PersistedSessionDigestState {
	version: 1;
	turnCount: number;
	lastNotifiedTurn: number;
	updatedAt: string;
}

interface DigestArtifactState {
	turnCountAtDigest?: number;
	updatedAt?: string;
	source?: string;
}

interface DigestPresence {
	exists: boolean;
	recent: boolean;
	state?: DigestArtifactState;
}

const DEFAULT_CONFIG: SessionDigestConfig = {
	enabled: true,
	notifyAfterTurns: 24,
	remindEveryTurns: 12,
	recentWithinTurns: 8,
};

function asObject(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function asNonNegativeInt(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function loadConfig(cwd: string): SessionDigestConfig {
	const { settings } = readSettings(cwd);
	const raw = asObject(settings.sessionDigest);
	return {
		enabled: typeof raw?.enabled === "boolean" ? raw.enabled : DEFAULT_CONFIG.enabled,
		notifyAfterTurns: asNonNegativeInt(raw?.notifyAfterTurns, DEFAULT_CONFIG.notifyAfterTurns),
		remindEveryTurns: asNonNegativeInt(raw?.remindEveryTurns, DEFAULT_CONFIG.remindEveryTurns),
		recentWithinTurns: asNonNegativeInt(raw?.recentWithinTurns, DEFAULT_CONFIG.recentWithinTurns),
	};
}

function getProjectRoot(cwd: string): string {
	const settingsPath = findNearestProjectSettings(cwd);
	return settingsPath ? path.dirname(path.dirname(settingsPath)) : cwd;
}

function getSessionId(ctx: ExtensionContext): string | undefined {
	const sessionFile = ctx.sessionManager.getSessionFile();
	if (!sessionFile) return undefined;
	return path.basename(sessionFile, path.extname(sessionFile));
}

function countAssistantTurns(ctx: ExtensionContext): number {
	let count = 0;
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "message" && entry.message.role === "assistant") count++;
	}
	return count;
}

function restorePersistedState(ctx: ExtensionContext): PersistedSessionDigestState {
	let restored: PersistedSessionDigestState | undefined;
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type !== "custom" || entry.customType !== SESSION_DIGEST_STATE_TYPE) continue;
		const data = asObject(entry.data) as Partial<PersistedSessionDigestState> | undefined;
		if (!data) continue;
		restored = {
			version: 1,
			turnCount: asNonNegativeInt(data.turnCount, 0),
			lastNotifiedTurn: asNonNegativeInt(data.lastNotifiedTurn, 0),
			updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date(0).toISOString(),
		};
	}

	if (restored) return restored;
	return {
		version: 1,
		turnCount: countAssistantTurns(ctx),
		lastNotifiedTurn: 0,
		updatedAt: new Date(0).toISOString(),
	};
}

function readDigestPresence(ctx: ExtensionContext, turnCount: number, config: SessionDigestConfig): DigestPresence {
	const sessionId = getSessionId(ctx);
	if (!sessionId) return { exists: false, recent: false };

	const statePath = path.join(getProjectRoot(ctx.cwd), ".pi", "harness", "digests", sessionId, "state.json");
	if (!fs.existsSync(statePath)) return { exists: false, recent: false };

	try {
		const raw = JSON.parse(fs.readFileSync(statePath, "utf8")) as DigestArtifactState;
		const digestTurn = asNonNegativeInt(raw.turnCountAtDigest, -1);
		const delta = digestTurn >= 0 ? Math.max(0, turnCount - digestTurn) : Number.POSITIVE_INFINITY;
		const recent = digestTurn >= 0 && delta <= config.recentWithinTurns;
		return {
			exists: true,
			recent,
			state: {
				turnCountAtDigest: digestTurn >= 0 ? digestTurn : undefined,
				updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
				source: typeof raw.source === "string" ? raw.source : undefined,
			},
		};
	} catch {
		return { exists: false, recent: false };
	}
}

function renderDigestStatus(ctx: ExtensionContext, turnCount: number, digest: DigestPresence, config: SessionDigestConfig): string {
	const theme = ctx.ui.theme;
	const overThreshold = config.notifyAfterTurns > 0 && turnCount >= config.notifyAfterTurns;
	const turnsColor = overThreshold && !digest.recent ? "warning" : "text";
	const turns = theme.fg(turnsColor, `${turnCount}t`);
	const label = theme.fg("accent", "sd");
	const digestIcon = digest.exists
		? digest.recent
			? theme.fg("success", "●")
			: theme.fg("warning", "◐")
		: theme.fg("dim", "○");
	return `${label} ${turns} ${digestIcon}`;
}

function persistState(pi: ExtensionAPI, state: PersistedSessionDigestState): void {
	pi.appendEntry<PersistedSessionDigestState>(SESSION_DIGEST_STATE_TYPE, {
		version: 1,
		turnCount: state.turnCount,
		lastNotifiedTurn: state.lastNotifiedTurn,
		updatedAt: state.updatedAt,
	});
}

function shouldNotify(state: PersistedSessionDigestState, digest: DigestPresence, config: SessionDigestConfig): boolean {
	if (digest.recent) return false;
	if (config.notifyAfterTurns <= 0) return false;
	if (state.turnCount < config.notifyAfterTurns) return false;
	if (state.lastNotifiedTurn === 0) return true;
	if (config.remindEveryTurns <= 0) return false;
	return state.turnCount - state.lastNotifiedTurn >= config.remindEveryTurns;
}

export default function (pi: ExtensionAPI) {
	let config = DEFAULT_CONFIG;
	let state: PersistedSessionDigestState = {
		version: 1,
		turnCount: 0,
		lastNotifiedTurn: 0,
		updatedAt: new Date(0).toISOString(),
	};
	let digest: DigestPresence = { exists: false, recent: false };

	const refreshFromSession = (ctx: ExtensionContext) => {
		config = loadConfig(ctx.cwd);
		state = restorePersistedState(ctx);
		digest = readDigestPresence(ctx, state.turnCount, config);
	};

	const updateStatus = (ctx: ExtensionContext) => {
		if (!config.enabled) {
			ctx.ui.setStatus("session-digest", undefined);
			return;
		}
		ctx.ui.setStatus("session-digest", renderDigestStatus(ctx, state.turnCount, digest, config));
	};

	pi.on("session_start", async (_event, ctx) => {
		refreshFromSession(ctx);
		updateStatus(ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		refreshFromSession(ctx);
		updateStatus(ctx);
	});

	pi.on("turn_end", async (_event, ctx) => {
		if (!config.enabled) return;
		state = {
			...state,
			turnCount: state.turnCount + 1,
			updatedAt: new Date().toISOString(),
		};
		digest = readDigestPresence(ctx, state.turnCount, config);

		if (shouldNotify(state, digest, config)) {
			ctx.ui.notify(`Sessão longa (${state.turnCount} turns). Considere gerar um session digest.`, "warning");
			state = { ...state, lastNotifiedTurn: state.turnCount, updatedAt: new Date().toISOString() };
		}

		persistState(pi, state);
		updateStatus(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		ctx.ui.setStatus("session-digest", undefined);
	});
}
