/**
 * Subagent Policy Extension
 *
 * Decide quando injetar a delegation policy e quando reescrever o input com
 * AUTO-DELEGATION ROUTER, usando um classifier LLM em vez de regex lexical.
 *
 * Config em ~/.pi/agent/settings.json:
 *   "subagentPolicy": {
 *     "classifierProvider": "opencode-go",
 *     "classifierModel": "qwen3.6-plus"
 *   }
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { type AgentConfig, discoverAgents } from "./subagent-env/agents.ts";
import { classifierWordToTier, lexicalComplexityTier, normalizeText, type ComplexityTier } from "./shared/intent.ts";
import { readGlobalSettings } from "./shared/settings.ts";

type Tier = ComplexityTier;

const SETTINGS_PATH = join(homedir(), ".pi/agent/settings.json");

const DEFAULT_PROVIDER = "opencode-go";
const DEFAULT_MODEL = "qwen3.6-plus";
const CLASSIFIER_TIMEOUT_MS = 2500;
const CACHE_TTL_MS = 5 * 60_000;

const CLASSIFIER_SYSTEM = [
	"Classifique a complexidade da tarefa do usuário.",
	"Responda APENAS uma palavra: trivial, moderada ou complexa.",
	"",
	"- trivial: pergunta única, resposta direta, conceitual curta, small talk.",
	"- moderada: precisa ler/explorar antes de responder, ou toca poucos arquivos.",
	"- complexa: cross-layer, multi-arquivo, investigação ampla, refactor, design, audit.",
].join("\n");

function readJson<T>(path: string): T | null {
	try {
		return JSON.parse(readFileSync(path, "utf8")) as T;
	} catch {
		return null;
	}
}

function resolveProviderModel(): { provider: string; model: string } {
	const settings = readGlobalSettings() ?? {};
	const policy = (settings as any).subagentPolicy ?? {};
	return {
		provider: typeof policy.classifierProvider === "string" ? policy.classifierProvider : DEFAULT_PROVIDER,
		model: typeof policy.classifierModel === "string" ? policy.classifierModel : DEFAULT_MODEL,
	};
}

interface ProviderCreds {
	baseUrl: string;
	apiKey: string;
	model: string;
	extraHeaders?: Record<string, string>;
}

const MODELS_PATH = join(homedir(), ".pi/agent/models.json");

async function resolveClassifierCreds(
	providerName: string,
	modelId: string,
	ctx?: ExtensionContext,
): Promise<ProviderCreds | null> {
	// Caminho preferido: usar o modelRegistry do Pi (le auth.json + models.json + built-ins)
	if (ctx?.modelRegistry) {
		const model = ctx.modelRegistry.find(providerName, modelId);
		if (model) {
			const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
			if (auth.ok !== false && auth.apiKey) {
				const baseUrl = (model as any).baseUrl ?? (model as any).provider?.baseUrl;
				if (baseUrl) {
					return { baseUrl, apiKey: auth.apiKey, model: modelId, extraHeaders: auth.headers };
				}
			}
		}
	}
	// Fallback: ler models.json direto (usado em testes / configs legadas)
	const models = readJson<any>(MODELS_PATH);
	const provider = models?.providers?.[providerName];
	if (provider?.baseUrl && provider?.apiKey) {
		return { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: modelId };
	}
	return null;
}

const cache = new Map<string, { tier: Tier; ts: number }>();

// Anti-silent-failure: if the classifier breaks, auto-delegation silently degrades.
// Make that visible to the operator via footer status + notify (throttled).
const CLASSIFIER_ERROR_THROTTLE_MS = 60_000;
let lastClassifierErrorTs = 0;
let lastClassifierError = "";

function reportClassifierFailure(ctx: ExtensionContext | undefined, message: string): void {
	const now = Date.now();
	const normalized = message.trim();
	const shouldEmit =
		!normalized
			? true
			: normalized !== lastClassifierError || now - lastClassifierErrorTs > CLASSIFIER_ERROR_THROTTLE_MS;

	if (shouldEmit) {
		lastClassifierErrorTs = now;
		lastClassifierError = normalized;
	}

	// UI: footer status + toast. Non-UI modes: stderr (so CI/piping sees it).
	const hasUiSurface = Boolean(ctx?.hasUI && (ctx as any)?.ui);
	const ui = hasUiSurface ? (ctx as any).ui : undefined;
	const theme = ui?.theme;
	const setStatus = typeof ui?.setStatus === "function" ? (ui.setStatus as (k: string, v: string | undefined) => void) : undefined;
	const notify = typeof ui?.notify === "function" ? (ui.notify as (t: string, tone: any) => void) : undefined;
	const fg = typeof theme?.fg === "function" ? (theme.fg as (c: any, t: string) => string) : undefined;

	if (hasUiSurface && fg && setStatus) {
		if (normalized) {
			setStatus("subagent-classifier", fg("error", "sub:auto ✗"));
			if (shouldEmit && notify) {
				notify(`Subagent classifier failed — auto-delegation degraded.\n${normalized}`, "error");
			}
		} else {
			setStatus("subagent-classifier", undefined);
		}
		return;
	}

	if (normalized && shouldEmit) {
		try {
			process.stderr.write(`[subagent-policy] classifier failed; auto-delegation degraded: ${normalized}\n`);
		} catch {
			// ignore
		}
	}
}

async function classify(prompt: string, ctx?: ExtensionContext): Promise<Tier> {
	const trimmed = prompt.trim();
	const key = trimmed.slice(0, 500);
	if (!key) return "skip";

	// Deterministic short-circuits:
	// - if the prompt already has the router prefix (injected by our input hook),
	//   do not re-classify (avoids redundant classifier calls + tier drift).
	const normalized = normalizeText(trimmed);
	if (normalized.startsWith("auto delegation router") || normalized.includes("[auto-delegation router]")) {
		return "auto";
	}

	const hit = cache.get(key);
	if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.tier;

	const { provider, model: modelId } = resolveProviderModel();
	const creds = await resolveClassifierCreds(provider, modelId, ctx);
	// If the classifier can't be used (missing creds / registry), fall back to a
	// conservative lexical heuristic so auto-delegation still works for obvious cases.
	if (!creds) return lexicalComplexityTier(trimmed);

	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), CLASSIFIER_TIMEOUT_MS);

	try {
		const r = await fetch(`${creds.baseUrl}/v1/chat/completions`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${creds.apiKey}`,
				...creds.extraHeaders,
			},
			signal: ctl.signal,
			body: JSON.stringify({
				model: creds.model,
				temperature: 0,
				// Kilo/Azure gateway enforces min output tokens (>=16). Lower values hard-fail with HTTP 400.
				max_tokens: 16,
				messages: [
					{ role: "system", content: CLASSIFIER_SYSTEM },
					{ role: "user", content: prompt.slice(0, 2000) },
				],
			}),
		});
		if (!r.ok) {
			const raw = (await r.text()).slice(0, 800);
			throw new Error(`HTTP ${r.status} from classifier gateway: ${raw}`);
		}

		const j: any = await r.json();
		const word = String(j?.choices?.[0]?.message?.content ?? "");
		const tier: Tier = classifierWordToTier(word);
		cache.set(key, { tier, ts: Date.now() });

		// Classifier healthy again.
		reportClassifierFailure(ctx, "");
		return tier;
	} catch (error) {
		reportClassifierFailure(ctx, (error as Error)?.message || String(error));
		// Preserve skip/auto behavior when classifier is flaky (network, 401, timeout, etc).
		return lexicalComplexityTier(trimmed);
	} finally {
		clearTimeout(timer);
	}
}

function formatAgentRoster(agents: AgentConfig[]): string {
	if (agents.length === 0) return "(no subagents discovered)";
	return agents
		.map((a) => {
			const model = a.model ? ` [${a.model}]` : "";
			const desc = a.description ? ` — ${a.description}` : "";
			return `- ${a.name}${model}${desc}`;
		})
		.join("\n");
}

function delegationPolicy(agents: AgentConfig[]): string {
	const roster = formatAgentRoster(agents);
	return [
		"[SUBAGENT POLICY]",
		"Use subagents when the request is multi-step, touches multiple files, needs exploration, or needs a final review.",
		"",
		"Available subagents (discovered now from ~/.pi/agent/agents and bundled):",
		roster,
		"",
		"Automatic delegation:",
		"- When the criteria are met, autonomously delegate to the subagents above. Do not ask the user for permission first.",
		"- Use the 'subagent' tool. Single mode for one task, parallel for independent fan-out, chain for sequential with {previous}.",
		"- Only prompt the user when an action is potentially destructive or requires explicit user approval.",
		"- When invoking project-local agents, honor project-agent confirmations unless required to complete the work.",
		"",
		"Default flow (when uncertain): scout → planner → worker → reviewer.",
		"Avoid subagents for tiny, direct tasks where coordination overhead would cost more tokens than it saves.",
	].join("\n");
}

function autoDelegationPrefix(prompt: string, agents: AgentConfig[]): string {
	const names = agents.map((a) => a.name).join(", ") || "scout, planner, worker, reviewer";
	return [
		"[AUTO-DELEGATION ROUTER]",
		`Use subagents automatically. Available: ${names}.`,
		"Pick the right combination: scout for recon, planner for design, worker for execution, reviewer for verification.",
		"Do not ask the user for permission to delegate when the task is clearly complex.",
		"User request:",
		prompt.trim(),
	].join("\n");
}

function getCwd(ctx: any): string {
	return (ctx && typeof ctx.cwd === "string" && ctx.cwd) || process.cwd();
}

function discoverForPolicy(cwd: string): AgentConfig[] {
	try {
		return discoverAgents(cwd, "user").agents;
	} catch {
		return [];
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("input", async (event, ctx) => {
		if (event.source === "extension") return { action: "continue" };
		const text = event.text?.trim() ?? "";
		if (!text || text.startsWith("/")) return { action: "continue" };

		const tier = await classify(text, ctx);
		if (tier !== "auto") return { action: "continue" };

		const agents = discoverForPolicy(getCwd(ctx));
		ctx.ui.notify("Auto-delegating complex request via subagents", "info");
		return { action: "transform", text: autoDelegationPrefix(text, agents) };
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const tier = await classify(event.prompt ?? "", ctx);
		if (tier === "skip") return undefined;

		const agents = discoverForPolicy(getCwd(ctx));
		const base = event.systemPrompt?.trim() ?? "";
		const policy = delegationPolicy(agents);
		return {
			systemPrompt: base ? `${base}\n\n${policy}` : policy,
		};
	});
}
