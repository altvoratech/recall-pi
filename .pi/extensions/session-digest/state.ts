import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import type { DigestPresence, PersistedSessionDigestState, SessionDigestConfig } from "./types.ts";

export function deriveCheckpointTurnCount(state: PersistedSessionDigestState, digest: DigestPresence): number {
	if (state.checkpointTurnCount > 0) return Math.min(state.checkpointTurnCount, state.turnCount);
	const digestTurn = digest.state?.turnCountAtDigest;
	if (typeof digestTurn === "number" && Number.isFinite(digestTurn) && digestTurn >= 0) {
		return Math.min(Math.floor(digestTurn), state.turnCount);
	}
	return 0;
}

export const SESSION_DIGEST_STATE_TYPE = "session-digest-state";

function asObject(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function asNonNegativeInt(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

export function countAssistantTurns(ctx: ExtensionContext): number {
	let count = 0;
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "message" && entry.message.role === "assistant") count++;
	}
	return count;
}

export function restorePersistedState(ctx: ExtensionContext): PersistedSessionDigestState {
	let restored: PersistedSessionDigestState | undefined;
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type !== "custom" || entry.customType !== SESSION_DIGEST_STATE_TYPE) continue;
		const data = asObject(entry.data) as Partial<PersistedSessionDigestState> | undefined;
		if (!data) continue;
		const turnCount = asNonNegativeInt(data.turnCount, 0);
		restored = {
			version: 2,
			turnCount,
			checkpointTurnCount: asNonNegativeInt(data.checkpointTurnCount, 0),
			lastNotifiedTurn: asNonNegativeInt(data.lastNotifiedTurn, 0),
			updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date(0).toISOString(),
		};
	}

	if (restored) return restored;
	return {
		version: 2,
		turnCount: countAssistantTurns(ctx),
		checkpointTurnCount: 0,
		lastNotifiedTurn: 0,
		updatedAt: new Date(0).toISOString(),
	};
}

export function persistSessionDigestState(pi: ExtensionAPI, state: PersistedSessionDigestState): void {
	pi.appendEntry<PersistedSessionDigestState>(SESSION_DIGEST_STATE_TYPE, {
		version: 2,
		turnCount: state.turnCount,
		checkpointTurnCount: state.checkpointTurnCount,
		lastNotifiedTurn: state.lastNotifiedTurn,
		updatedAt: state.updatedAt,
	});
}

export function getTurnsSinceCheckpoint(state: PersistedSessionDigestState): number {
	return Math.max(0, state.turnCount - state.checkpointTurnCount);
}

export function shouldNotify(
	state: PersistedSessionDigestState,
	digest: DigestPresence,
	config: SessionDigestConfig,
): boolean {
	if (digest.recent) return false;
	if (config.notifyAfterTurns <= 0) return false;
	if (getTurnsSinceCheckpoint(state) < config.notifyAfterTurns) return false;
	if (state.lastNotifiedTurn <= state.checkpointTurnCount) return true;
	if (config.remindEveryTurns <= 0) return false;
	return state.turnCount - state.lastNotifiedTurn >= config.remindEveryTurns;
}

export function renderDigestStatus(
	ctx: ExtensionContext,
	state: PersistedSessionDigestState,
	digest: DigestPresence,
	config: SessionDigestConfig,
	options: { pendingInject?: boolean } = {},
): string {
	const theme = ctx.ui.theme;
	const turnsSinceCheckpoint = getTurnsSinceCheckpoint(state);
	const overThreshold = config.notifyAfterTurns > 0 && turnsSinceCheckpoint >= config.notifyAfterTurns;
	const turnsColor = overThreshold && !digest.recent ? "warning" : "text";
	const turns = theme.fg(turnsColor, `+${turnsSinceCheckpoint}`);
	const label = theme.fg("accent", "sd");
	const digestIcon = options.pendingInject
		? theme.fg("accent", "↪")
		: digest.exists
			? digest.recent
				? theme.fg("success", "●")
				: theme.fg("warning", "◐")
			: theme.fg("dim", "○");
	return `${label} ${turns} ${digestIcon}`;
}
