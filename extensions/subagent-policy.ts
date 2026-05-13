/**
 * Subagent Policy Extension
 *
 * Decide quando injetar a delegation policy e quando reescrever o input com
 * AUTO-DELEGATION ROUTER, usando um classifier LLM em vez de regex lexical.
 *
 * Config em ~/.pi/agent/settings.json:
 *   "subagentPolicy": {
 *     "classifierProvider": "kilo",
 *     "classifierModel": "gpt-4.1-mini"
 *   }
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { type AgentConfig, discoverAgents } from "./subagent-env/agents.ts";

type Tier = "skip" | "inject" | "auto";

const SETTINGS_PATH = join(homedir(), ".pi/agent/settings.json");
const MODELS_PATH = join(homedir(), ".pi/agent/models.json");

const DEFAULT_PROVIDER = "kilo";
const DEFAULT_MODEL = "gpt-4.1-mini";
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

interface ProviderCreds {
	baseUrl: string;
	apiKey: string;
	model: string;
}

function readJson<T>(path: string): T | null {
	try {
		return JSON.parse(readFileSync(path, "utf8")) as T;
	} catch {
		return null;
	}
}

function resolveClassifier(): ProviderCreds | null {
	const settings = readJson<any>(SETTINGS_PATH) ?? {};
	const policy = settings.subagentPolicy ?? {};
	const providerName: string = policy.classifierProvider ?? DEFAULT_PROVIDER;
	const model: string = policy.classifierModel ?? DEFAULT_MODEL;

	const models = readJson<any>(MODELS_PATH);
	const provider = models?.providers?.[providerName];
	if (!provider?.baseUrl || !provider?.apiKey) return null;
	return { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model };
}

const cache = new Map<string, { tier: Tier; ts: number }>();

async function classify(prompt: string): Promise<Tier> {
	const key = prompt.trim().slice(0, 500);
	if (!key) return "skip";

	const hit = cache.get(key);
	if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.tier;

	const creds = resolveClassifier();
	if (!creds) return "inject"; // fallback conservador se config faltar

	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), CLASSIFIER_TIMEOUT_MS);

	try {
		const r = await fetch(`${creds.baseUrl}/v1/chat/completions`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${creds.apiKey}`,
			},
			signal: ctl.signal,
			body: JSON.stringify({
				model: creds.model,
				temperature: 0,
				max_tokens: 4,
				messages: [
					{ role: "system", content: CLASSIFIER_SYSTEM },
					{ role: "user", content: prompt.slice(0, 2000) },
				],
			}),
		});
		const j: any = await r.json();
		const word = String(j?.choices?.[0]?.message?.content ?? "").toLowerCase().trim();
		const tier: Tier = word.startsWith("complex")
			? "auto"
			: word.startsWith("moder")
				? "inject"
				: "skip";
		cache.set(key, { tier, ts: Date.now() });
		return tier;
	} catch {
		return "inject";
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

		const tier = await classify(text);
		if (tier !== "auto") return { action: "continue" };

		const agents = discoverForPolicy(getCwd(ctx));
		ctx.ui.notify("Auto-delegating complex request via subagents", "info");
		return { action: "transform", text: autoDelegationPrefix(text, agents) };
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const tier = await classify(event.prompt ?? "");
		if (tier === "skip") return undefined;

		const agents = discoverForPolicy(getCwd(ctx));
		const base = event.systemPrompt?.trim() ?? "";
		const policy = delegationPolicy(agents);
		return {
			systemPrompt: base ? `${base}\n\n${policy}` : policy,
		};
	});
}
