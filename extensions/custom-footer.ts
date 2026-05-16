/**
 * Custom Footer Extension
 *
 * Replaces the default single-line stats footer with a 3-row layout:
 *
 *   ~/recall-core (main)                          opencode-go/qwen3.6-plus · medium
 *   ↑13M ↓56k cache R3.5M
 *   $7.033 · ctx 26.0%/262k · auto
 *
 * Toggle with /footer.
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import * as os from "node:os";

function shortenPath(p: string): string {
	const home = os.homedir();
	return p.startsWith(home) ? `~${p.slice(home.length)}` : p;
}

function fmtTokens(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
	if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
	return `${(n / 1_000_000).toFixed(1)}M`;
}

export default function (pi: ExtensionAPI) {
	let enabled = false;

	const install = () => {
		pi.registerCommand("footer", {
			description: "Toggle the 3-row custom footer (default off)",
			handler: async (_args, ctx) => {
				enabled = !enabled;
				if (!enabled) {
					ctx.ui.setFooter(undefined);
					ctx.ui.notify("Default footer restored", "info");
					return;
				}

				ctx.ui.setFooter((tui, theme, footerData) => {
					const unsub = footerData.onBranchChange(() => tui.requestRender());

					return {
						dispose: unsub,
						invalidate() {},
						render(width: number): string[] {
							// Aggregate usage from the current branch
							let input = 0,
								output = 0,
								cacheRead = 0,
								cost = 0;
							for (const e of ctx.sessionManager.getBranch()) {
								if (e.type === "message" && e.message.role === "assistant") {
									const m = e.message as AssistantMessage;
									input += m.usage.input;
									output += m.usage.output;
									cacheRead += m.usage.cacheRead ?? 0;
									cost += m.usage.cost?.total ?? 0;
								}
							}

							const branch = footerData.getGitBranch();
							const cwd = shortenPath(ctx.cwd);
							const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "no-model";
							const thinking = pi.getThinkingLevel?.();
							const usage = ctx.getContextUsage();
							const statuses = footerData.getExtensionStatuses();

							const branchStr = branch ? theme.fg("muted", ` (${branch})`) : "";
							const thinkStr = thinking ? theme.fg("dim", ` · ${thinking}`) : "";

							// Compact status pills (important when subagents/classifier are active).
							const statusText = (() => {
								if (!statuses || statuses.size === 0) return "";
								const priority = ["subagent", "subagent-hud", "subagent-classifier", "recall-context", "status-line"];
								const parts: string[] = [];
								for (const key of priority) {
									const v = statuses.get(key);
									if (v) parts.push(v);
								}
								for (const [k, v] of Array.from(statuses.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
									if (!v) continue;
									if (priority.includes(k)) continue;
									parts.push(v);
								}
								return parts.length ? parts.join(theme.fg("dim", "  ")) : "";
							})();

							// Row 1: cwd + branch ............................ model · thinking
							const l1L = theme.fg("text", cwd) + branchStr;
							const l1R = theme.fg("muted", model) + thinkStr;
							const l1Pad = " ".repeat(Math.max(1, width - visibleWidth(l1L) - visibleWidth(l1R)));
							const line1 = truncateToWidth(l1L + l1Pad + l1R, width);

							// Row 2: tokens
							const tokensParts = [
								`${theme.fg("dim", "↑")}${theme.fg("text", fmtTokens(input))}`,
								`${theme.fg("dim", "↓")}${theme.fg("text", fmtTokens(output))}`,
								`${theme.fg("dim", "cache R")}${theme.fg("text", fmtTokens(cacheRead))}`,
							];
							const line2 = truncateToWidth(tokensParts.join("  "), width);

							// Row 3: cost · ctx · statuses
							const ctxStr =
								usage && usage.percent !== null && usage.tokens !== null
									? `ctx ${usage.percent.toFixed(1)}%/${fmtTokens(usage.contextWindow)}`
									: "ctx —";
							const costStr = `$${cost.toFixed(3)}`;
							const line3Parts = [theme.fg("accent", costStr), theme.fg("text", ctxStr)];
							if (statusText) line3Parts.push(statusText);
							const line3 = truncateToWidth(line3Parts.join("  ·  "), width);

							return [line1, line2, line3];
						},
					};
				});
				ctx.ui.notify("Custom footer enabled (/footer to toggle)", "info");
			},
		});
	};

	pi.on("session_start", async () => {
		install();
	});

	// Also register the command at extension load so it's available before session_start fires
	install();
}
