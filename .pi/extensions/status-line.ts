/**
 * Status Line Extension
 *
 * Shows persistent turn progress + active model in the footer.
 *
 * Enhancements over upstream:
 * - Distinguishes idle (session start/end) vs working (agent_start)
 * - During agent execution, replaces "Working" with the current tool name
 *   (e.g. "⟳ bash", "⟳ subagent (2)")
 * - Tracks subagent spawn count for the running turn — surfaced as a
 *   suffix in turn_end / agent_end status ("✓ Turn 3 · 2 sub")
 * - Model label always dim-suffixed
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

function formatModelLabel(ctx: ExtensionContext): string {
	const model = ctx.model;
	if (!model) return "default model";
	return `${model.provider}/${model.id}`;
}

function renderStatus(
	ctx: ExtensionContext,
	icon: string,
	message: string,
	subCount: number,
): string {
	const theme = ctx.ui.theme;
	const sub = subCount > 0 ? theme.fg("dim", ` · ${subCount} sub`) : "";
	return (
		`${theme.fg("accent", icon)} ${theme.fg("text", message)}` +
		sub +
		` ${theme.fg("dim", `· ${formatModelLabel(ctx)}`)}`
	);
}

function renderCompactStatus(ctx: ExtensionContext, icon: string, message: string, subCount: number): string {
	const theme = ctx.ui.theme;
	const sub = subCount > 0 ? theme.fg("dim", ` ${subCount}x`) : "";
	return `${theme.fg("accent", icon)} ${theme.fg("text", message)}${sub}`;
}

export default function (pi: ExtensionAPI) {
	let turnCount = 0;
	let subagentCount = 0;

	const setStatus = (ctx: ExtensionContext, icon: string, message: string, compactMessage = message) => {
		ctx.ui.setStatus("status-line", renderStatus(ctx, icon, message, subagentCount));
		ctx.ui.setStatus("run-state", renderCompactStatus(ctx, icon, compactMessage, subagentCount));
	};

	pi.on("session_start", async (_event, ctx) => {
		turnCount = 0;
		subagentCount = 0;
		setStatus(ctx, "●", "Ready", "ready");
	});

	pi.on("turn_start", async (_event, ctx) => {
		turnCount++;
		setStatus(ctx, "●", `Turn ${turnCount}`, `turn ${turnCount}`);
	});

	pi.on("turn_end", async (_event, ctx) => {
		setStatus(ctx, "✓", `Turn ${turnCount} complete`, "done");
	});

	pi.on("agent_start", async (_event, ctx) => {
		setStatus(ctx, "⟳", "Working", "working");
	});

	pi.on("agent_end", async (_event, ctx) => {
		setStatus(ctx, "●", "Ready", "ready");
	});

	pi.on("tool_execution_start", async (event, ctx) => {
		if (event.toolName === "subagent") subagentCount++;
		setStatus(ctx, "⟳", event.toolName, event.toolName);
	});

	pi.on("tool_execution_end", async (_event, ctx) => {
		// Return to generic working state; agent_end / turn_end will overwrite to Ready/Complete.
		setStatus(ctx, "⟳", "Working", "working");
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		ctx.ui.setStatus("status-line", undefined);
		ctx.ui.setStatus("run-state", undefined);
	});
}
