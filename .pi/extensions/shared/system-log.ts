import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const LOG_DIR = path.join(REPO_ROOT, "logs");
const LOG_PATH = path.join(LOG_DIR, "system-log.jsonl");
const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_ROTATED_FILES = 5;

let writeQueue: Promise<void> = Promise.resolve();

function safeSerialize(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return JSON.stringify({ note: "unserializable_payload" });
	}
}

function rotatedPath(index: number): string {
	return path.join(LOG_DIR, `system-log.${index}.jsonl`);
}

async function exists(filePath: string): Promise<boolean> {
	try {
		await fs.promises.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function rotateIfNeeded(incomingBytes: number): Promise<void> {
	await fs.promises.mkdir(LOG_DIR, { recursive: true }).catch(() => undefined);
	let currentSize = 0;
	try {
		currentSize = (await fs.promises.stat(LOG_PATH)).size;
	} catch {
		return;
	}

	if (currentSize + incomingBytes <= MAX_LOG_BYTES) return;

	const oldest = rotatedPath(MAX_ROTATED_FILES);
	if (await exists(oldest)) {
		await fs.promises.unlink(oldest).catch(() => undefined);
	}

	for (let i = MAX_ROTATED_FILES - 1; i >= 1; i--) {
		const src = rotatedPath(i);
		const dst = rotatedPath(i + 1);
		if (!(await exists(src))) continue;
		if (await exists(dst)) await fs.promises.unlink(dst).catch(() => undefined);
		await fs.promises.rename(src, dst).catch(() => undefined);
	}

	if (await exists(LOG_PATH)) {
		const first = rotatedPath(1);
		if (await exists(first)) await fs.promises.unlink(first).catch(() => undefined);
		await fs.promises.rename(LOG_PATH, first).catch(() => undefined);
	}
}

export function appendSystemLog(source: string, event: string, payload?: Record<string, unknown>): void {
	const line = safeSerialize({
		ts: new Date().toISOString(),
		source,
		event,
		payload: payload ?? {},
	});
	const rendered = `${line}\n`;

	writeQueue = writeQueue
		.then(async () => {
			await fs.promises.mkdir(LOG_DIR, { recursive: true }).catch(() => undefined);
			await rotateIfNeeded(Buffer.byteLength(rendered, "utf8"));
			await fs.promises.appendFile(LOG_PATH, rendered, { encoding: "utf8" });
		})
		.catch(() => {
			// never break runtime because of logging
		});
}

export function getSystemLogPath(): string {
	return LOG_PATH;
}

// ── Policy feedback (delegation efficiency tracking) ──────────────────

const FEEDBACK_PATH = path.join(REPO_ROOT, ".pi", "harness", "policy-feedback.jsonl");
const MAX_FEEDBACK_BYTES = 2 * 1024 * 1024; // 2 MB

export function appendPolicyFeedback(
	event: string,
	payload?: Record<string, unknown>,
): void {
	const line = safeSerialize({
		ts: new Date().toISOString(),
		event,
		...payload,
	});
	const rendered = `${line}\n`;

	writeQueue = writeQueue
		.then(async () => {
			const dir = path.dirname(FEEDBACK_PATH);
			await fs.promises.mkdir(dir, { recursive: true }).catch(() => undefined);
			let currentSize = 0;
			try { currentSize = (await fs.promises.stat(FEEDBACK_PATH)).size; } catch { /* new file */ }
			if (currentSize + Buffer.byteLength(rendered, "utf8") > MAX_FEEDBACK_BYTES) {
				// truncate: rename old → .1, start fresh
				const backup = `${FEEDBACK_PATH}.1`;
				try {
					if ((await fs.promises.stat(backup)).isFile()) await fs.promises.unlink(backup);
				} catch { /* ok */ }
				await fs.promises.rename(FEEDBACK_PATH, backup).catch(() => undefined);
			}
			await fs.promises.appendFile(FEEDBACK_PATH, rendered, { encoding: "utf8" });
		})
		.catch(() => {
			// never break runtime because of feedback logging
		});
}
