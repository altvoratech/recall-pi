/**
 * Subagent Policy (parte do subsistema subagent-env)
 *
 * Decide quando injetar a delegation policy e quando reescrever o input com
 * AUTO-DELEGATION ROUTER, usando heurística léxica (zero tokens, zero latência).
 *
 * Tiers:
 * - skip:   small talk, não faz nada
 * - inject: injeta [SUBAGENT POLICY] no system prompt, agente decide
 * - auto:   transforma prompt + bloqueia write/edit/bash → força delegação
 *
 * Registrado pelo index.ts do subagent-env via registerSubagentPolicy(pi),
 * mantendo o domínio de subagentes coeso num único diretório.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type AgentConfig, discoverAgents } from "./agents.ts";
import { type SessionMode, validateToolCall } from "./policy-engine.ts";
import { type ComplexityTier, lexicalComplexityTier, isTopicShift } from "../shared/intent.ts";
import { appendSystemLog, getSystemLogPath } from "../shared/system-log.ts";
import { appendPolicyFeedback } from "../shared/system-log.ts";

// ── Tool blocking (defense in depth para tier "auto") ──────────────────

/** Sessions where tier === "auto" — mutating tools blocked until delegation. */
const autoSessions = new Set<string>();
/** Sessions with policy bypass enabled via command (no reload needed). */
const bypassSessions = new Set<string>();
/** Session role tracking to enforce "only executor can mutate". */
const sessionRoles = new Map<string, "executor" | "main">();
/** Session mode escalation (balanced -> strict). */
const sessionModes = new Map<string, SessionMode>();

// ── Session state machine (prevents auto-delegation loops) ──────────

type SessionPolicyState = "idle" | "auto_once" | "policy_only";

interface SessionPolicyEntry {
	state: SessionPolicyState;
	lastPrompt: string;
	lastTier: ComplexityTier;
	/** How many times auto triggered in this session */
	autoCount: number;
}

const sessionPolicyStates = new Map<string, SessionPolicyEntry>();

function getOrCreatePolicyEntry(sid: string): SessionPolicyEntry {
	let entry = sessionPolicyStates.get(sid);
	if (!entry) {
		entry = { state: "idle", lastPrompt: "", lastTier: "skip", autoCount: 0 };
		sessionPolicyStates.set(sid, entry);
	}
	return entry;
}

function transitionState(sid: string, newState: SessionPolicyState): void {
	const entry = getOrCreatePolicyEntry(sid);
	const oldState = entry.state;
	entry.state = newState;
	if (oldState !== newState) {
		appendPolicyFeedback("state_transition", {
			session: sid,
			from: oldState,
			to: newState,
		});
	}
}

/**
 * Decide the effective tier for this prompt, considering session state.
 * - IDLE: lexical tier as-is (auto/inject/skip)
 * - AUTO_ONCE: downgrade "auto" to "inject" (cooldown after first auto)
 * - POLICY_ONLY: always "inject" unless topic shift resets to IDLE
 */
function effectiveTier(sid: string, prompt: string): ComplexityTier {
	const entry = getOrCreatePolicyEntry(sid);
	const lexical = lexicalComplexityTier(prompt);

	// Topic shift detection: if user changed subject, reset to IDLE
	if (entry.state !== "idle" && entry.lastPrompt) {
		if (isTopicShift(prompt, entry.lastPrompt)) {
			transitionState(sid, "idle");
			entry.autoCount = 0;
			appendPolicyFeedback("topic_shift_reset", {
				session: sid,
				previousPrompt: entry.lastPrompt.slice(0, 200),
				currentPrompt: prompt.slice(0, 200),
			});
			// After reset, use lexical tier directly
			entry.lastPrompt = prompt;
			entry.lastTier = lexical;
			return lexical;
		}
	}

	// Update prompt tracking
	entry.lastPrompt = prompt;
	entry.lastTier = lexical;

	switch (entry.state) {
		case "idle":
			// First auto in this session: allow it
			return lexical;

		case "auto_once":
			// Already auto-locked once this session. Downgrade to inject.
			if (lexical === "auto") {
				appendPolicyFeedback("auto_downgraded", {
					session: sid,
					reason: "cooldown",
					lexicalTier: lexical,
					promptPreview: prompt.slice(0, 200),
				});
				return "inject";
			}
			return lexical;

		case "policy_only":
			// Stable state. Never auto-lock again in this session.
			if (lexical === "auto") {
				appendPolicyFeedback("auto_downgraded", {
					session: sid,
					reason: "policy_only_cooldown",
					lexicalTier: lexical,
					promptPreview: prompt.slice(0, 200),
				});
				return "inject";
			}
			return lexical;

		default:
			return lexical;
	}
}

function sessionIdFromCtx(ctx: any): string | undefined {
	try {
		const sid = ctx?.sessionManager?.getSessionId?.();
		if (sid) return String(sid);
		return ctx?.cwd ? `cwd:${String(ctx.cwd)}` : undefined;
	} catch {
		return undefined;
	}
}

function isBypassed(ctx: any): boolean {
	const sid = sessionIdFromCtx(ctx);
	return !!sid && bypassSessions.has(sid);
}

function isExecutorPrompt(prompt: string): boolean {
	const p = (prompt || "").toLowerCase();
	return p.includes("you are the technical executor.") || p.includes("name: executor");
}

function setPolicyStatus(ctx: ExtensionContext): void {
	if (!ctx.hasUI) return;
	const sid = sessionIdFromCtx(ctx);
	const enabled = !!sid && !bypassSessions.has(sid);
	const fg = ctx.ui.theme?.fg?.bind(ctx.ui.theme);
	const text = enabled ? "pol:on" : "pol:off";
	ctx.ui.setStatus("subagent-policy", fg ? fg(enabled ? "muted" : "warning", text) : text);
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
		"Available project skills (use $skill_name before delegating):",
		"- $semantic-compression — compress context to reduce tokens for subagent tasks",
		"- $system-prompts — apply prompt engineering best practices when crafting subagent prompts",
		"",
		"Delegation guidelines:",
		"- Pick the subagent that best fits the request. One is often sufficient.",
		"- scout: reconnaissance/analysis. planner: design/architecture. executor: implementation. reviewer: verification.",
		"- Only chain multiple when the task truly spans phases (e.g., analyze + implement).",
		"- Use the 'subagent' tool. Single mode for one task, parallel for independent fan-out.",
		"- Only prompt the user when an action is potentially destructive or requires explicit user approval.",
		"- When invoking project-local agents, honor project-agent confirmations unless required to complete the work.",
		"",
		"Avoid subagents for tiny, direct tasks where coordination overhead would cost more tokens than it saves.",
	].join("\n");
}

function autoDelegationPrefix(prompt: string, agents: AgentConfig[]): string {
	const names = agents.map((a) => a.name).join(", ") || "scout, planner, executor, reviewer";
	return [
		"[AUTO-DELEGATION ROUTER]",
		`This request is complex. You MUST delegate to subagents. Available: ${names}.`,
		"",
		"Available project skills (use $skill_name to prepare before delegating):",
		"- $semantic-compression — compress context to reduce tokens for subagent tasks",
		"- $system-prompts — apply prompt engineering best practices when crafting subagent prompts",
		"",
		"RULES (non-negotiable):",
		"- You are FORBIDDEN from handling this request directly.",
		"- Your ONLY job is to pick the right subagent(s) for this request and call the 'subagent' tool.",
		"- Pick: scout for reconnaissance/analysis, planner for design, executor for implementation, reviewer for verification.",
		"- Pick ONLY the subagent(s) needed. If the request is analysis-only, scout alone is enough.",
		"- Do NOT chain all subagents just because they exist. One is often sufficient.",
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
		"Available project skills (use $skill_name to prepare context before delegating):",
		"- $semantic-compression — compress context to reduce tokens for subagent tasks",
		"- $system-prompts — apply prompt engineering best practices when crafting subagent prompts",
		"",
		"Pick the subagent that best fits the request. One is usually enough.",
		"Typical roles: scout=analysis, planner=design, executor=implementation, reviewer=verification.",
		"The full chain (scout→planner→executor→reviewer) is for large multi-phase work. Don't chain unnecessarily.",
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

// ── Registro ───────────────────────────────────────────────────────────

export function registerSubagentPolicy(pi: ExtensionAPI) {
	pi.registerCommand("subagent-policy", {
		description: "Toggle subagent policy for current session: /subagent-policy on|strict|off|status",
		handler: async (args, ctx) => {
			const action = (args || "status").trim().toLowerCase();
			const sid = sessionIdFromCtx(ctx);
			if (!sid) {
				ctx.ui.notify("subagent-policy: session id unavailable", "error");
				return;
			}

		if (action === "off" || action === "disable" || action === "bypass") {
			bypassSessions.add(sid);
			autoSessions.delete(sid);
			sessionModes.delete(sid);
			transitionState(sid, "policy_only");
			setPolicyStatus(ctx);
			ctx.ui.notify("subagent-policy OFF for this session", "warning");
			appendSystemLog("subagent-policy", "manual_bypass_on", { cwd: ctx.cwd, sid });
			appendPolicyFeedback("user_bypassed", {
				session: sid,
				reason: "manual_command",
			});
			return;
		}

			if (action === "strict") {
				bypassSessions.delete(sid);
				sessionModes.set(sid, "strict");
				setPolicyStatus(ctx);
				ctx.ui.notify("subagent-policy ON (strict) for this session", "info");
				appendSystemLog("subagent-policy", "manual_mode_set", { cwd: ctx.cwd, sid, mode: "strict" });
				return;
			}

			if (action === "on" || action === "enable") {
				bypassSessions.delete(sid);
				sessionModes.set(sid, "balanced");
				setPolicyStatus(ctx);
				ctx.ui.notify("subagent-policy ON (balanced) for this session", "info");
				appendSystemLog("subagent-policy", "manual_mode_set", { cwd: ctx.cwd, sid, mode: "balanced" });
				return;
			}

			const enabled = !bypassSessions.has(sid);
			setPolicyStatus(ctx);
			ctx.ui.notify(`subagent-policy is ${enabled ? "ON" : "OFF"} for this session`, "info");
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		const sid = sessionIdFromCtx(ctx);
		if (sid && !sessionModes.has(sid)) sessionModes.set(sid, "balanced");
		appendSystemLog("subagent-policy", "session_start", {
			cwd: ctx.cwd,
			mode: "lexical",
			logPath: getSystemLogPath(),
		});
		if (!ctx.hasUI) return;
		const fg = ctx.ui.theme?.fg?.bind(ctx.ui.theme);
		if (fg) ctx.ui.setStatus("subagent-classifier", fg("muted", "sub:auto …"));
		setPolicyStatus(ctx);
	});

	// ── input: reescreve prompt com AUTO-DELEGATION ROUTER ──────────
	pi.on("input", async (event, ctx) => {
		if (event.source === "extension") return { action: "continue" };
		const text = event.text?.trim() ?? "";
		if (!text || text.startsWith("/")) return { action: "continue" };
		if (isBypassed(ctx)) return { action: "continue" };

		const sid = sessionIdFromCtx(ctx) ?? `cwd:${getCwd(ctx)}`;
		const tier = effectiveTier(sid, text);
		if (tier !== "auto") return { action: "continue" };

		// Transition to AUTO_ONCE
		const entry = getOrCreatePolicyEntry(sid);
		entry.autoCount++;
		transitionState(sid, "auto_once");

		const agents = discoverForPolicy(getCwd(ctx));
		appendSystemLog("subagent-policy", "auto_delegation_transform", {
			cwd: ctx.cwd,
			tier,
			effectiveTier: tier,
			agentNames: agents.map((a) => a.name),
			promptPreview: text.slice(0, 200),
		});
		appendPolicyFeedback("auto_triggered", {
			session: sid,
			autoCount: entry.autoCount,
			promptPreview: text.slice(0, 200),
			agentNames: agents.map((a) => a.name),
		});
		if (ctx.hasUI) ctx.ui.notify("Complex request — forcing auto-delegation", "warning");
		return { action: "transform", text: autoDelegationPrefix(text, agents) };
	});

	// ── before_agent_start: injeta política + lockdown ──────────────
	pi.on("before_agent_start", async (event, ctx) => {
		const sid = sessionIdFromCtx(ctx);
		const prompt = event.prompt ?? "";
		if (sid) sessionRoles.set(sid, isExecutorPrompt(prompt) ? "executor" : "main");
		if (isBypassed(ctx)) {
			if (sid) autoSessions.delete(sid);
			return undefined;
		}

		const effectiveSid = sid ?? `cwd:${getCwd(ctx)}`;
		const tier = effectiveTier(effectiveSid, prompt);
		if (tier === "skip") return undefined;

		const agents = discoverForPolicy(getCwd(ctx));

		if (tier === "auto") {
			if (sid) autoSessions.add(sid);
			const entry = getOrCreatePolicyEntry(effectiveSid);
			entry.autoCount++;
			transitionState(effectiveSid, "auto_once");
			appendSystemLog("subagent-policy", "auto_lockdown", {
				cwd: ctx.cwd,
				tier,
				agentNames: agents.map((a) => a.name),
				promptPreview: prompt.slice(0, 200),
			});
			appendPolicyFeedback("auto_lockdown", {
				session: effectiveSid,
				autoCount: entry.autoCount,
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
		if (isBypassed(ctx)) return undefined;
		const sid = sessionIdFromCtx(ctx);
		const toolName = event.toolName;

		// Always allow recall MCP tools (main agent can read/save memory).
		if (toolName === "recall_mcp_load" || toolName === "recall_save") {
			return undefined;
		}

		const mode: SessionMode = sid ? (sessionModes.get(sid) ?? "balanced") : "balanced";
		const role = sid ? (sessionRoles.get(sid) ?? "main") : "main";

		const validation = validateToolCall({
			sessionMode: mode,
			sessionRole: role,
			toolName,
			toolInput: event.input,
		});
		if (!validation.allow) {
			if (sid && validation.escalateToStrict) {
				if (sessionModes.get(sid) !== "strict") {
					sessionModes.set(sid, "strict");
					appendSystemLog("subagent-policy", "policy_escalation", {
						cwd: ctx.cwd,
						sid,
						from: mode,
						to: "strict",
						toolName,
						actionClass: validation.actionClass,
					});
				}
			}
			return {
				block: true,
				reason: validation.reason ?? `[subagent-policy] ${toolName} blocked by deterministic policy.`,
			};
		}

		if (!sid || !autoSessions.has(sid)) return undefined;

		// Always allow subagent tool — and transition from auto lockdown to POLICY_ONLY
		if (toolName === "subagent") {
			if (sid && autoSessions.has(sid)) {
				autoSessions.delete(sid);
				transitionState(sid, "policy_only");
				appendPolicyFeedback("delegation_executed", {
					session: sid,
					subagentInput: String((event.input as any)?.agent ?? "unknown"),
				});
			}
			return undefined;
		}
		if (toolName === "read" || toolName === "grep" || toolName === "find" ||
			toolName === "ls" || toolName === "recall_mcp_load") {
			return undefined;
		}

		if (toolName === "write" || toolName === "edit") {
			return {
				block: true,
				reason: `[subagent-policy] ${toolName} blocked: complex request requires delegation. Call 'subagent' first.`,
			};
		}

		if (toolName === "bash") {
			const command = String((event.input as any)?.command ?? "");
			if (validation.actionClass === "mutating" || validation.actionClass === "privileged" || validation.actionClass === "destructive" || validation.actionClass === "unknown") {
				return {
					block: true,
					reason: `[subagent-policy] Mutating bash blocked: complex request requires delegation. Call 'subagent' first.`,
				};
			}
		}

		return undefined;
	});

	// ── agent_end: limpa lockdown operacional, mantém estado de sessão
	pi.on("agent_end", async (_event, ctx) => {
		const sid = sessionIdFromCtx(ctx);
		if (sid) {
			autoSessions.delete(sid);
			sessionRoles.delete(sid);
			sessionModes.delete(sid);
			// Keep sessionPolicyStates for topic shift detection across turns
		}
	});
}
