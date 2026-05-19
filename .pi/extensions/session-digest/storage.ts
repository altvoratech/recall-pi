import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { findNearestProjectSettings } from "../shared/settings.ts";
import type { DigestArtifactState, DigestPaths, DigestPresence, SessionDigestConfig } from "./types.ts";

function asNonNegativeInt(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function readJson<T>(file: string): T | null {
	try {
		return JSON.parse(fs.readFileSync(file, "utf8")) as T;
	} catch {
		return null;
	}
}

export function getProjectRoot(cwd: string): string {
	const settingsPath = findNearestProjectSettings(cwd);
	return settingsPath ? path.dirname(path.dirname(settingsPath)) : cwd;
}

export function resolveSessionId(ctx: ExtensionContext): string | undefined {
	const sessionFile = ctx.sessionManager.getSessionFile();
	if (sessionFile) return path.basename(sessionFile, path.extname(sessionFile));
	const fromHeader = (ctx.sessionManager as { getHeader?: () => { id?: string } | undefined }).getHeader?.()?.id;
	if (typeof fromHeader === "string" && fromHeader) return fromHeader;
	const fromCtx = (ctx as { sessionId?: string }).sessionId;
	if (typeof fromCtx === "string" && fromCtx) return fromCtx;
	return undefined;
}

export function getDigestPaths(ctx: ExtensionContext): DigestPaths {
	const sessionId = resolveSessionId(ctx);
	const rootDir = path.join(getProjectRoot(ctx.cwd), ".pi", "harness", "digests");
	if (!sessionId) return { rootDir };
	const dir = path.join(rootDir, sessionId);
	return {
		sessionId,
		rootDir,
		dir,
		latestPath: path.join(dir, "latest.md"),
		statePath: path.join(dir, "state.json"),
	};
}

export function readProjectId(cwd: string): string | undefined {
	const file = path.join(cwd, ".recall", "project.json");
	const data = readJson<{ id?: string }>(file);
	return typeof data?.id === "string" ? data.id : undefined;
}

export function readDigestState(ctx: ExtensionContext): DigestArtifactState | null {
	const paths = getDigestPaths(ctx);
	if (!paths.statePath || !fs.existsSync(paths.statePath)) return null;
	return readJson<DigestArtifactState>(paths.statePath);
}

export function readDigestMarkdown(ctx: ExtensionContext): string | null {
	const paths = getDigestPaths(ctx);
	if (!paths.latestPath || !fs.existsSync(paths.latestPath)) return null;
	try {
		return fs.readFileSync(paths.latestPath, "utf8");
	} catch {
		return null;
	}
}

export function readDigestPresence(
	ctx: ExtensionContext,
	turnCount: number,
	config: SessionDigestConfig,
): DigestPresence {
	const raw = readDigestState(ctx);
	if (!raw) return { exists: false, recent: false };

	const digestTurn = asNonNegativeInt(raw.turnCountAtDigest, -1);
	const delta = digestTurn >= 0 ? Math.max(0, turnCount - digestTurn) : Number.POSITIVE_INFINITY;
	return {
		exists: true,
		recent: digestTurn >= 0 && delta <= config.recentWithinTurns,
		state: raw,
	};
}

export function writeDigestArtifact(
	ctx: ExtensionContext,
	summary: string,
	statePatch: Omit<DigestArtifactState, "schemaVersion" | "sessionId" | "startedAt" | "updatedAt">,
): DigestArtifactState {
	const paths = getDigestPaths(ctx);
	if (!paths.sessionId || !paths.dir || !paths.latestPath || !paths.statePath) {
		throw new Error("No persistent session id available for session digest");
	}

	fs.mkdirSync(paths.dir, { recursive: true });
	const existing = readDigestState(ctx);
	const now = new Date().toISOString();
	const nextState: DigestArtifactState = {
		schemaVersion: 1,
		sessionId: paths.sessionId,
		startedAt: existing?.startedAt ?? now,
		updatedAt: now,
		...statePatch,
	};

	fs.writeFileSync(paths.latestPath, summary, "utf8");
	fs.writeFileSync(paths.statePath, JSON.stringify(nextState, null, 2), "utf8");
	return nextState;
}
