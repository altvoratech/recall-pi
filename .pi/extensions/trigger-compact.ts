/**
 * Trigger Compact Extension
 *
 * Auto-compaction when context tokens cross threshold + manual /trigger-compact command.
 * Threshold is configurable via ~/.pi/agent/settings.json:
 *   "compaction": { "thresholdTokens": 100000 }
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const DEFAULT_THRESHOLD = 100_000;

import { readSettings } from "./shared/settings.ts";

function loadThreshold(cwd?: string): number {
	try {
		const { settings } = readSettings(cwd);
		const t = (settings as any)?.compaction?.thresholdTokens;
		if (typeof t === "number" && t > 0) return t;
	} catch {
		/* fallback */
	}
	return DEFAULT_THRESHOLD;
}

export default function (pi: ExtensionAPI) {
	let threshold = DEFAULT_THRESHOLD;
	let previousTokens: number | null | undefined;

	const triggerCompaction = (ctx: ExtensionContext, customInstructions?: string) => {
		if (ctx.hasUI) {
			ctx.ui.notify(`Compaction started (threshold: ${threshold.toLocaleString()} tokens)`, "info");
		}
		ctx.compact({
			customInstructions,
			onComplete: () => {
				if (ctx.hasUI) ctx.ui.notify("Compaction completed", "info");
			},
			onError: (error) => {
				if (ctx.hasUI) ctx.ui.notify(`Compaction failed: ${error.message}`, "error");
			},
		});
	};

	pi.on("session_start", (_event, ctx) => {
		threshold = loadThreshold(ctx.cwd);
		previousTokens = undefined;
	});

	pi.on("turn_end", (_event, ctx) => {
		const usage = ctx.getContextUsage();
		const currentTokens = usage?.tokens ?? null;
		if (currentTokens === null) return;

		const crossedThreshold =
			previousTokens !== undefined && previousTokens !== null && previousTokens <= threshold;
		previousTokens = currentTokens;
		if (!crossedThreshold || currentTokens <= threshold) return;

		triggerCompaction(ctx);
	});

	pi.registerCommand("trigger-compact", {
		description: "Trigger compaction immediately (optional: pass custom instructions)",
		handler: async (args, ctx) => {
			const instructions = args.trim() || undefined;
			triggerCompaction(ctx, instructions);
		},
	});
}
