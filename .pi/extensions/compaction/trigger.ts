/**
 * Trigger Compact (domínio compaction)
 *
 * Expõe o comando manual `/trigger-compact`.
 *
 * IMPORTANTE: compaction automática por threshold é do runtime nativo do
 * Pi. Esta peça intencionalmente NÃO chama ctx.compact() em turn_end —
 * fazer isso como shim de auto-compaction aborta/reconecta a sessão e
 * interfere no fluxo pós-turn normal.
 *
 * Registrado pelo index.ts do domínio via registerTriggerCompact(pi).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function registerTriggerCompact(pi: ExtensionAPI) {
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
