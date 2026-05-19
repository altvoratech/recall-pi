/**
 * trace-recorder — IO append-only para events.jsonl e index.jsonl.
 */

import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getIndexPath, getRunsRoot } from "./paths.ts";
import { nowIso } from "./helpers.ts";

export async function ensureRunDir(runId: string): Promise<string> {
	const runDir = join(getRunsRoot(), runId);
	await mkdir(runDir, { recursive: true });
	return runDir;
}

export async function appendEvent(
	runId: string,
	payload: Record<string, unknown>,
): Promise<void> {
	const runDir = await ensureRunDir(runId);
	await appendFile(
		join(runDir, "events.jsonl"),
		`${JSON.stringify({ timestamp: nowIso(), ...payload })}\n`,
		"utf-8",
	);
}

export async function appendIndex(entry: Record<string, unknown>): Promise<void> {
	await mkdir(getRunsRoot(), { recursive: true });
	await appendFile(
		getIndexPath(),
		`${JSON.stringify({ timestamp: nowIso(), ...entry })}\n`,
		"utf-8",
	);
}
