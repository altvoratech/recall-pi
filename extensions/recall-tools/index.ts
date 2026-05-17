import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isSmallTalk } from "../shared/intent.ts";

type RecallSettings = {
	url: string;
	bearerToken: string;
	pythonPath: string;
	coreDir: string;
	// for diagnostics
	sources?: {
		url?: string;
		bearerToken?: string;
		pythonPath?: string;
		coreDir?: string;
		projectSettingsPath?: string | null;
	};
};

type RecallSearchHit = {
	session_id: string;
	content: string;
	score?: number;
	blended_score?: number;
	recency?: number;
	section_type?: string;
	title?: string;
	project_id?: string;
};

const DEFAULT_RECALL_URL = "http://127.0.0.1:18789/sse";
const DEFAULT_RECALL_CORE_DIR = "/home/g/recall-core";
const DEFAULT_RECALL_PYTHON = "/home/g/recall-core/.venv/bin/python";

const ENV_URL = "RECALL_URL";
const ENV_BEARER = "RECALL_BEARER_TOKEN";
const ENV_PYTHON = "RECALL_PYTHON";
const ENV_CORE_DIR = "RECALL_CORE_DIR";
const CLIENT_SCRIPT = fileURLToPath(new URL("./recall_mcp_client.py", import.meta.url));
const LOGS_DIR = path.join(path.dirname(CLIENT_SCRIPT), "logs");

// ─── Intent gate (client-side mirror of core/retrieval/intent.py) ─────────
// Secondary defense: saves an MCP round-trip for obvious small talk.
// Backend gate is authoritative; this is just a fast-path optimization.

function isRecallWorthy(query: string): boolean {
	const text = query.trim();
	if (!text) return false;
	return !isSmallTalk(text);
}

function ensureLogsDir(): void {
	fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function writeJsonLog(name: string, data: Record<string, unknown>): void {
	try {
		ensureLogsDir();
		const payload = {
			event: name,
			...data,
		};
		fs.writeFileSync(path.join(LOGS_DIR, "latest.json"), JSON.stringify(payload, null, 2), "utf8");
	} catch {
		// logging must never break recall injection
	}
}

function readJsonIfExists(filePath: string): Record<string, unknown> | undefined {
	try {
		if (!fs.existsSync(filePath)) return undefined;
		return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
	} catch {
		return undefined;
	}
}

function findNearestProjectSettings(cwd: string): string | null {
	let current = path.resolve(cwd);
	while (true) {
		const candidate = path.join(current, ".pi", "settings.json");
		if (fs.existsSync(candidate)) return candidate;
		const parent = path.dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

function normalizeRecallUrl(value: unknown): string {
	const raw = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_RECALL_URL;
	if (/\/sse$/i.test(raw)) return raw;
	return `${raw.replace(/\/+$/, "")}/sse`;
}

function isLoopbackHost(host: string): boolean {
	const h = host.toLowerCase();
	return h === "127.0.0.1" || h === "localhost" || h === "::1";
}

function validateRecallUrl(url: string): void {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error(`Invalid recall url: ${url}`);
	}
	// If recall is exposed beyond loopback, require https.
	if (parsed.protocol === "http:" && !isLoopbackHost(parsed.hostname)) {
		throw new Error(
			`Refusing insecure recall url over plain http for non-loopback host (${parsed.hostname}). Use https:// or bind to 127.0.0.1.`,
		);
	}
}

function readEnvRecall(): Record<string, unknown> {
	const env = process.env;
	const out: Record<string, unknown> = {};
	if (typeof env[ENV_URL] === "string" && env[ENV_URL]!.trim()) out.url = env[ENV_URL]!.trim();
	if (typeof env[ENV_BEARER] === "string" && env[ENV_BEARER]!.trim()) out.bearerToken = env[ENV_BEARER]!.trim();
	if (typeof env[ENV_PYTHON] === "string" && env[ENV_PYTHON]!.trim()) out.pythonPath = env[ENV_PYTHON]!.trim();
	if (typeof env[ENV_CORE_DIR] === "string" && env[ENV_CORE_DIR]!.trim()) out.coreDir = env[ENV_CORE_DIR]!.trim();
	return out;
}

function getRecallSettings(cwd: string): RecallSettings {
	const globalSettingsPath = path.join(os.homedir(), ".pi", "agent", "settings.json");
	const projectSettingsPath = findNearestProjectSettings(cwd);
	const globalSettings = readJsonIfExists(globalSettingsPath) ?? {};
	const projectSettings = projectSettingsPath ? readJsonIfExists(projectSettingsPath) ?? {} : {};
	const envRecall = readEnvRecall();

	// Precedence (first wins): env > project > global > defaults
	const globalRecall = ((globalSettings.recall as Record<string, unknown> | undefined) ?? {});
	const projectRecall = ((projectSettings.recall as Record<string, unknown> | undefined) ?? {});

	const pick = (key: string) => {
		const v = (envRecall as any)[key];
		if (typeof v === "string" && v.trim()) return { value: v.trim(), source: "env" as const };
		const pv = (projectRecall as any)[key];
		if (typeof pv === "string" && pv.trim()) return { value: pv.trim(), source: "project" as const };
		const gv = (globalRecall as any)[key];
		if (typeof gv === "string" && gv.trim()) return { value: gv.trim(), source: "global" as const };
		return { value: "", source: "default" as const };
	};

	const bearer = pick("bearerToken");
	const bearerToken = bearer.value;
	if (!bearerToken) {
		throw new Error(
			`Recall bearer token missing. Set ${ENV_BEARER} or configure settings.json with { "recall": { "bearerToken": "..." } } (project or global).`,
		);
	}

	const urlPick = (() => {
		const url = pick("url");
		if (url.value) return url;
		const baseUrl = pick("baseUrl");
		if (baseUrl.value) return baseUrl;
		const sseUrl = pick("sseUrl");
		if (sseUrl.value) return sseUrl;
		return { value: DEFAULT_RECALL_URL, source: "default" as const };
	})();
	const url = normalizeRecallUrl(urlPick.value);
	validateRecallUrl(url);

	const pyPick = pick("pythonPath");
	const corePick = pick("coreDir");

	return {
		url,
		bearerToken,
		pythonPath: pyPick.value || DEFAULT_RECALL_PYTHON,
		coreDir: corePick.value || DEFAULT_RECALL_CORE_DIR,
		sources: {
			url: urlPick.source,
			bearerToken: bearer.source,
			pythonPath: pyPick.source,
			coreDir: corePick.source,
			projectSettingsPath,
		},
	};
}

async function runRecallClient(
	pi: ExtensionAPI,
	settings: RecallSettings,
	mode: "load" | "save",
	payload: Record<string, unknown>,
	signal: AbortSignal | undefined,
) {
	const result = await pi.exec(
		settings.pythonPath,
		[CLIENT_SCRIPT, mode, JSON.stringify({ ...settings, ...payload })],
		{ signal, timeout: 120000 },
	);
	if (result.code !== 0) {
		throw new Error(result.stderr || result.stdout || `recall client exited with code ${result.code}`);
	}
	try {
		return JSON.parse(result.stdout);
	} catch (error) {
		throw new Error(`Invalid recall client JSON: ${(error as Error).message}\n${result.stdout}`);
	}
}

const DeltaDecision = Type.Object({
	key: Type.String(),
	content: Type.String(),
});
const DeltaTask = Type.Object({
	key: Type.String(),
	description: Type.String(),
});
const DeltaConcept = Type.Object({
	key: Type.String(),
	explanation: Type.String(),
});

const RECALL_CONTEXT_STATE_TYPE = "recall-context-state";
let recallContextEnabled = true;

function buildRecallContextMessage(query: string, hits: RecallSearchHit[]): string {
	const lines = [
		`## Recall contexto`,
		`Consulta: ${query}`,
		``,
	];

	for (const [idx, hit] of hits.entries()) {
		const title = hit.title ?? hit.session_id;
		const section = hit.section_type ? ` • ${hit.section_type}` : "";
		const score = typeof hit.blended_score === "number" ? hit.blended_score : hit.score;
		const scoreText = typeof score === "number" ? ` • score=${score.toFixed(3)}` : "";
		lines.push(`${idx + 1}. ${title}${section}${scoreText}`);
		lines.push(hit.content);
		lines.push("");
	}

	return lines.join("\n").trim();
}

function syncRecallContextState(ctx: { sessionManager: { getEntries(): Array<{ type: string; customType?: string; data?: unknown }> } }) {
	for (const entry of ctx.sessionManager.getEntries()) {
		if (entry.type === "custom" && entry.customType === RECALL_CONTEXT_STATE_TYPE) {
			const data = entry.data as { enabled?: boolean } | undefined;
			if (typeof data?.enabled === "boolean") {
				recallContextEnabled = data.enabled;
			}
		}
	}
}

function updateRecallStatus(ctx: { ui: { theme: { fg(color: string, text: string): string }; setStatus(id: string, value: string | undefined): void } }) {
	const label = ctx.ui.theme.fg("accent", "rcl");
	const icon = recallContextEnabled ? ctx.ui.theme.fg("success", "●") : ctx.ui.theme.fg("dim", "○");
	ctx.ui.setStatus("recall-context", `${label} ${icon}`);
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		syncRecallContextState(ctx);
		updateRecallStatus(ctx);
	});
	pi.on("session_tree", (_event, ctx) => {
		syncRecallContextState(ctx);
		updateRecallStatus(ctx);
	});
	pi.on("session_shutdown", (_event, ctx) => {
		ctx.ui.setStatus("recall-context", undefined);
	});

	pi.registerCommand("recall-doctor", {
		description: "Diagnostica configuração do Recall (precedência env/projeto/global) e valida URL",
		handler: async (_args, ctx) => {
			try {
				const settings = getRecallSettings(ctx.cwd);
				const s = settings.sources;
				const lines = [
					"Recall doctor:\n",
					`cwd: ${ctx.cwd}`,
					`project settings: ${s?.projectSettingsPath ?? "(none found)"}`,
					"",
					`url: ${settings.url}   (source: ${s?.url ?? "?"})`,
					`bearerToken: ${settings.bearerToken ? "(set)" : "(missing)"}   (source: ${s?.bearerToken ?? "?"})`,
					`pythonPath: ${settings.pythonPath}   (source: ${s?.pythonPath ?? "?"})`,
					`coreDir: ${settings.coreDir}   (source: ${s?.coreDir ?? "?"})`,
					"",
					"Env vars suportadas:",
					`- ${ENV_URL}, ${ENV_BEARER}, ${ENV_PYTHON}, ${ENV_CORE_DIR}`,
				].join("\n");
				ctx.ui.notify(lines, "info");
			} catch (e) {
				ctx.ui.notify(`Recall doctor error: ${(e as Error).message}`, "error");
			}
		},
	});

	pi.registerCommand("recall-context", {
		description: "Liga/desliga a injeção automática do Recall no prompt",
		handler: async (args, ctx) => {
			// NOTE: the context toggle state is persisted into the session tree via a custom entry.
			// This makes the behavior stable across compactions.

			const value = args.trim().toLowerCase();
			if (value === "on" || value === "enable") {
				recallContextEnabled = true;
			} else if (value === "off" || value === "disable") {
				recallContextEnabled = false;
			} else {
				recallContextEnabled = !recallContextEnabled;
			}

			pi.appendEntry(RECALL_CONTEXT_STATE_TYPE, { enabled: recallContextEnabled });
			updateRecallStatus(ctx);
			ctx.ui.notify(`Recall context: ${recallContextEnabled ? "on" : "off"}`, "info");
		},
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const prompt = String(event.prompt ?? "").trim();
		updateRecallStatus(ctx);
		writeJsonLog("prompt-start", {
			prompt,
			enabled: recallContextEnabled,
			injections: 0,
			cwd: ctx.cwd,
			timestamp: new Date().toISOString(),
		});

		if (!recallContextEnabled) return undefined;

		if (!prompt || prompt.startsWith("/")) return undefined;

		// Client-side intent gate — skip MCP round-trip for obvious small talk
		if (!isRecallWorthy(prompt)) return undefined;

		try {
			const settings = getRecallSettings(ctx.cwd);
			const signal = (ctx as { signal?: AbortSignal }).signal;
			const data = await runRecallClient(
				pi,
				settings,
				"load",
				{
					cwd: ctx.cwd,
					query: prompt,
					global: true,
					topK: 4,
					agent: "pi",
					agentModel: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "unknown",
				},
				signal,
			);

			const hits = Array.isArray(data?.results) ? (data.results as RecallSearchHit[]).filter((hit) => hit?.content) : [];
			const injectedHits = hits.slice(0, 4);
			if (injectedHits.length === 0) {
				updateRecallStatus(ctx);
				writeJsonLog("prompt-no-injection", {
					prompt,
					enabled: recallContextEnabled,
					injections: 0,
					cwd: ctx.cwd,
					timestamp: new Date().toISOString(),
				});
				return undefined;
			}

			updateRecallStatus(ctx);
			writeJsonLog("injection", {
				prompt,
				enabled: recallContextEnabled,
				injections: injectedHits.length,
				cwd: ctx.cwd,
				timestamp: new Date().toISOString(),
				hits: injectedHits.map((hit) => ({
					session_id: hit.session_id,
					title: hit.title,
					section_type: hit.section_type,
					score: hit.blended_score ?? hit.score,
					content: hit.content,
				})),
			});

			return {
				message: {
					customType: "recall-context",
					content: buildRecallContextMessage(prompt, injectedHits),
					display: false,
				},
			};
		} catch (error) {
			writeJsonLog("injection-error", {
				prompt,
				enabled: recallContextEnabled,
				cwd: ctx.cwd,
				timestamp: new Date().toISOString(),
				error: error instanceof Error ? error.message : String(error),
			});
			return undefined;
		}
	});

	pi.registerTool({
		name: "recall_mcp_load",
		label: "Recall MCP Load",
		description:
			"Load recall memory via the local recall MCP server. Can list sessions, fetch one session, search project memory, or search globally.",
		promptGuidelines: [
			"Use recall_mcp_load when the user asks to load memory, search past sessions, inspect recall memory, or query the recall MCP backend.",
		],
		parameters: Type.Object({
			query: Type.Optional(Type.String({ description: "Search query. If omitted, the tool lists sessions." })),
			index: Type.Optional(Type.Number({ description: "1-based session index from the project session list." })),
			sessionId: Type.Optional(Type.String({ description: "Specific session id to fetch directly." })),
			global: Type.Optional(Type.Boolean({ description: "Search/list across all projects instead of the current one." })),
			topK: Type.Optional(Type.Number({ description: "Maximum search results to return.", default: 5 })),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const settings = getRecallSettings(ctx.cwd);
			const data = await runRecallClient(pi, settings, "load", {
				cwd: ctx.cwd,
				query: params.query,
				index: params.index,
				sessionId: params.sessionId,
				global: params.global ?? false,
				topK: params.topK ?? 5,
				agent: "pi",
				agentModel: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "unknown",
			}, signal);
			return {
				content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
				details: data,
			};
		},
	});

	pi.registerTool({
		name: "recall_save",
		label: "Recall Save",
		description:
			"Save session memory to the local recall MCP server using the recall-core SessionDelta schema.",
		promptGuidelines: [
			"Use recall_save when the user asks to persist session knowledge into recall memory and you can provide a valid session title, notes, and any changed entities.",
		],
		parameters: Type.Object({
			sessionTitle: Type.String({ description: "Short session title (5-10 words)." }),
			sessionNotes: Type.String({ description: "What happened, why, and what remains open." }),
			projectName: Type.Optional(Type.String({ description: "Optional project display name." })),
			addFiles: Type.Optional(Type.Array(Type.String(), { description: "Files touched during the session." })),
			addDecisions: Type.Optional(Type.Array(DeltaDecision)),
			updateDecisions: Type.Optional(Type.Array(DeltaDecision)),
			removeDecisions: Type.Optional(Type.Array(Type.String())),
			addTasks: Type.Optional(Type.Array(DeltaTask)),
			completeTasks: Type.Optional(Type.Array(Type.String())),
			removeTasks: Type.Optional(Type.Array(Type.String())),
			addConcepts: Type.Optional(Type.Array(DeltaConcept)),
			updateConcepts: Type.Optional(Type.Array(DeltaConcept)),
			removeConcepts: Type.Optional(Type.Array(Type.String())),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const settings = getRecallSettings(ctx.cwd);
			const data = await runRecallClient(pi, settings, "save", {
				cwd: ctx.cwd,
				agent: "pi",
				agentModel: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "unknown",
				sessionTitle: params.sessionTitle,
				sessionNotes: params.sessionNotes,
				projectName: params.projectName,
				addFiles: params.addFiles ?? [],
				addDecisions: params.addDecisions ?? [],
				updateDecisions: params.updateDecisions ?? [],
				removeDecisions: params.removeDecisions ?? [],
				addTasks: params.addTasks ?? [],
				completeTasks: params.completeTasks ?? [],
				removeTasks: params.removeTasks ?? [],
				addConcepts: params.addConcepts ?? [],
				updateConcepts: params.updateConcepts ?? [],
				removeConcepts: params.removeConcepts ?? [],
			}, signal);
			return {
				content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
				details: data,
			};
		},
	});
}
