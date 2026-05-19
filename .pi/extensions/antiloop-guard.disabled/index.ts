/**
 * Antiloop Guard Extension
 *
 * Prevents agents from entering infinite tool call loops by enforcing
 * configurable limits per agent role. When limit is reached, blocks
 * further tool calls and forces the agent to produce output.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { detectAgentRole, getLimitForAgent, type AgentLimits } from "./config.ts";
import { counter } from "./counter.ts";
import { buildBlockResponse, WARNING_NEAR_LIMIT } from "./message.ts";
import { appendSystemLog } from "../shared/system-log.ts";

// Tools that should never be blocked (always allowed)
const ALLOWED_TOOLS = new Set(["subagent", "yield", "ask_followup"]);

export default function antiloopGuard(pi: ExtensionAPI): void {
	// Reset counter at start of each agent run
	pi.on("before_agent_start", async (event, _ctx) => {
		const prompt = event.prompt ?? event.systemPrompt ?? "";
		const role = detectAgentRole(prompt);
		const limit = getLimitForAgent(role);

		counter.reset(role, limit);

		appendSystemLog("antiloop-guard", "agent_start", {
			role,
			limit,
			promptPreview: prompt.slice(0, 100),
		});

		return undefined;
	});

	// Count and enforce limits on tool calls
	pi.on("tool_call", async (event, ctx) => {
		const toolName = event.toolName;
		const toolCallId = event.toolCallId;

		// Always allow certain tools
		if (ALLOWED_TOOLS.has(toolName)) {
			return undefined;
		}

		// Skip if counter not active
		if (!counter.isActive()) {
			return undefined;
		}

		// Increment (with dedup)
		const isNew = counter.increment(toolCallId);
		if (!isNew) {
			return undefined; // Duplicate event, ignore
		}

		const count = counter.getCount();
		const limit = counter.getLimit();
		const agent = counter.getAgentRole();
		const remaining = counter.getRemaining();

		// Warn when near limit
		if (remaining === 2 || remaining === 1) {
			appendSystemLog("antiloop-guard", "near_limit", {
				agent,
				count,
				limit,
				remaining,
				tool: toolName,
			});

			if (ctx.hasUI) {
				ctx.ui.notify(WARNING_NEAR_LIMIT(agent, remaining), "warning");
			}
		}

		// Block if limit reached
		if (counter.isLimitReached()) {
			appendSystemLog("antiloop-guard", "limit_reached", {
				agent,
				count,
				limit,
				blockedTool: toolName,
			});

			if (ctx.hasUI) {
				ctx.ui.notify(
					`[antiloop] ${agent} hit ${limit} tool limit. Blocking ${toolName}.`,
					"error"
				);
			}

			return buildBlockResponse(agent, count, limit);
		}

		return undefined;
	});

	// Cleanup on agent end
	pi.on("agent_end", async (_event, _ctx) => {
		const count = counter.getCount();
		const limit = counter.getLimit();
		const agent = counter.getAgentRole();

		if (count > 0) {
			appendSystemLog("antiloop-guard", "agent_end", {
				agent,
				toolCallsUsed: count,
				limit,
				hitLimit: count >= limit,
			});
		}

		// Reset for next run
		counter.reset("default", 10);

		return undefined;
	});
}
