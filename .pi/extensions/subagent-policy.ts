/**
 * Subagent Policy Extension
 *
 * Decide quando injetar a delegation policy e quando reescrever o input com
 * AUTO-DELEGATION ROUTER, usando heurística léxica (zero tokens, zero latência).
 *
 * Tiers:
 * - skip:   small talk, não faz nada
 * - inject: injeta [SUBAGENT POLICY] no system prompt, agente decide
 * - auto:   transforma prompt + bloqueia write/edit/bash → força delegação
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type AgentConfig, discoverAgents } from "./subagent-env/agents.ts";
import { lexicalComplexityTier } from "./shared/intent.ts";
import { appendSystemLog, getSystemLogPath } from "./shared/system-log.ts";

// ── Tool blocking (defense in depth para tier "auto") ──────────────────

const MUTATING_TOOLS = new Set(["write", "edit"]);

const BASH_MUTATION_PATTERNS = [
	/\brm\s+-/i, /\bmv\s+/i, /\bcp\s+/i, /\btouch\s+/i, /\bmkdir\s+/i,
	/\btee\s+/i, /\bgit\s+(add|commit|push|reset|checkout|merge|rebase|cherry-pick|apply)\b/i,
	/\bnpm\s+(install|uninstall|ci)\b/i, /\bpnpm\s+(add|install|remove)\b/i,
	/\byarn\s+(add|install|remove)\b/i, /\bsed\s+-i\b/i, /\bperl\s+-i\b/i,
];

function isMutatingBash(command: string): boolean {
	return BASH_MUTATION_PATTERNS.some((p) => p.test(command));
}

/** Sessions where tier === "auto" — mutating tools blocked until delegation. */
const autoSessions = new Set<string>();

function sessionIdFromCtx(ctx: any): string | undefined {
	try {
		return ctx?.cwd ? String(ctx.cwd) : undefined;
	} catch {
		return undefined;
	}
}

// ── Policy text builders ───────────────────────────────────────────────

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
		`This request is complex. You MUST delegate to subagents. Available: ${names}.`,
		"",
		"RULES (non-negotiable):",
		"- You are FORBIDDEN from handling this request directly.",
		"- Your ONLY job is to pick the right subagent combination and call the 'subagent' tool.",
		"- Pick: scout for recon, planner for design, worker for execution, reviewer for verification.",
		"- Default flow: scout → planner → worker → reviewer.",
		"- Do NOT use write, edit, or mutating bash commands yourself.",
		"- Do NOT ask the user for permission — just delegate.",
		"",
		"User request:",
		prompt.trim(),
	].join("\n");
}

function autoBlockPolicy(agents: AgentConfig[]): string {
	const roster = formatAgentRoster(agents);
	return [
		"[AUTO-DELEGATION LOCKDOWN]",
		"This prompt was classified as complex. You MUST delegate to a subagent.",
		"",
		"BLOCKED TOOLS (do NOT call these yourself):",
		"- write / edit — blocked. Let subagents handle file changes.",
		"- bash (mutating): rm, mv, cp, git add/commit/push, npm install, etc — blocked.",
		"- bash (read-only): ls, grep, cat, git log/status/diff — ALLOWED for reconnaissance only.",
		"",
		"Available subagents:",
		roster,
		"",
		"Flow: scout → planner → worker → reviewer.",
		"Do not ask for permission. Delegate now.",
	].join("\n");
}

// ── Helpers ────────────────────────────────────────────────────────────

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

// ── Extension ──────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		appendSystemLog("subagent-policy", "session_start", {
			cwd: ctx.cwd,
			mode: "lexical",
			logPath: getSystemLogPath(),
		});
		if (!ctx.hasUI) return;
		const fg = ctx.ui.theme?.fg?.bind(ctx.ui.theme);
		if (fg) ctx.ui.setStatus("subagent-classifier", fg("muted", "sub:auto …"));
	});

	// ── input: reescreve prompt com AUTO-DELEGATION ROUTER ──────────
	pi.on("input", async (event, ctx) => {
		if (event.source === "extension") return { action: "continue" };
		const text = event.text?.trim() ?? "";
		if (!text || text.startsWith("/")) return { action: "continue" };

		const tier = lexicalComplexityTier(text);
		if (tier !== "auto") return { action: "continue" };

		const agents = discoverForPolicy(getCwd(ctx));
		appendSystemLog("subagent-policy", "auto_delegation_transform", {
			cwd: ctx.cwd,
			tier,
			agentNames: agents.map((a) => a.name),
			promptPreview: text.slice(0, 200),
		});
		if (ctx.hasUI) ctx.ui.notify("Complex request — forcing auto-delegation", "warning");
		return { action: "transform", text: autoDelegationPrefix(text, agents) };
	});

	// ── before_agent_start: injeta política + lockdown ──────────────
	pi.on("before_agent_start", async (event, ctx) => {
		const prompt = event.prompt ?? "";
		const tier = lexicalComplexityTier(prompt);
		if (tier === "skip") return undefined;

		const sid = sessionIdFromCtx(ctx);
		const agents = discoverForPolicy(getCwd(ctx));

		if (tier === "auto") {
			if (sid) autoSessions.add(sid);
			appendSystemLog("subagent-policy", "auto_lockdown", {
				cwd: ctx.cwd,
				tier,
				agentNames: agents.map((a) => a.name),
				promptPreview: prompt.slice(0, 200),
			});
			const base = event.systemPrompt?.trim() ?? "";
			const lockdown = autoBlockPolicy(agents);
			return {
				systemPrompt: base ? `${base}\n\n${lockdown}` : lockdown,
			};
		}

		if (sid) autoSessions.delete(sid);
		appendSystemLog("subagent-policy", "policy_injected", {
			cwd: ctx.cwd,
			tier,
			agentNames: agents.map((a) => a.name),
			promptPreview: prompt.slice(0, 200),
		});
		const base = event.systemPrompt?.trim() ?? "";
		const policy = delegationPolicy(agents);
		return {
			systemPrompt: base ? `${base}\n\n${policy}` : policy,
		};
	});

	// ── tool_call: bloqueia write/edit/bash no tier "auto" ──────────
	pi.on("tool_call", async (event, ctx) => {
		const sid = sessionIdFromCtx(ctx);
		if (!sid || !autoSessions.has(sid)) return undefined;

		const toolName = event.toolName;

		// Always allow read-only tools and subagent itself
		if (toolName === "subagent") {
			autoSessions.delete(sid);
			return undefined;
		}
		if (toolName === "read" || toolName === "grep" || toolName === "find" ||
			toolName === "ls" || toolName === "search_tool" || toolName === "recall_mcp_load") {
			return undefined;
		}

		if (MUTATING_TOOLS.has(toolName)) {
			return {
				block: true,
				reason: `[subagent-policy] ${toolName} blocked: complex request requires delegation. Call 'subagent' first.`,
			};
		}

		if (toolName === "bash") {
			const command = String((event.input as any)?.command ?? "");
			if (command && isMutatingBash(command)) {
				return {
					block: true,
					reason: `[subagent-policy] Mutating bash blocked: complex request requires delegation. Call 'subagent' first.`,
				};
			}
		}

		return undefined;
	});

	// ── agent_end: limpa lockdown ───────────────────────────────────
	pi.on("agent_end", async (_event, ctx) => {
		const sid = sessionIdFromCtx(ctx);
		if (sid) autoSessions.delete(sid);
	});
}
