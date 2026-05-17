/**
 * Trigger Compact Extension
 *
 * Exposes a manual `/trigger-compact` command.
 *
 * Important: automatic threshold-based compaction is handled by Pi itself.
 * This extension intentionally does NOT trigger `ctx.compact()` from `turn_end`,
 * because manual compaction semantics abort/reconnect the agent session and can
 * interfere with the normal post-turn flow when used as an auto-compaction shim.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("trigger-compact", {
		description: "Trigger compaction immediately (optional: pass custom instructions)",
		handler: async (args, ctx) => {
			const instructions = args.trim() || undefined;
			if (ctx.hasUI) {
				ctx.ui.notify("Manual compaction started", "info");
			}
			ctx.compact({
				customInstructions: instructions,
				onComplete: () => {
					if (ctx.hasUI) ctx.ui.notify("Manual compaction completed", "info");
				},
				onError: (error) => {
					if (ctx.hasUI) ctx.ui.notify(`Manual compaction failed: ${error.message}`, "error");
				},
			});
		},
	});
}
