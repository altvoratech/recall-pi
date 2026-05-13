/**
 * Confirm Destructive Extension
 *
 * Asks for confirmation before clearing the current session (/new).
 * Fork is allowed without prompting — it's non-destructive (creates a new
 * session file, leaves the current one untouched).
 */

import type { ExtensionAPI, SessionBeforeSwitchEvent } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.on("session_before_switch", async (event: SessionBeforeSwitchEvent, ctx) => {
		if (!ctx.hasUI) return;
		if (event.reason !== "new") return;

		const confirmed = await ctx.ui.confirm(
			"Clear session?",
			"This will delete all messages in the current session. Proceed?",
		);

		if (!confirmed) {
			ctx.ui.notify("Clear cancelled", "info");
			return { cancel: true };
		}
	});
}
