/**
 * Protected Paths Extension
 *
 * Intercepts write/edit on sensitive paths and asks for confirmation via modal
 * instead of blocking outright. User can approve case-by-case.
 *
 * Configurable via ~/.pi/agent/settings.json:
 *   "protectedPaths": ["pattern1", "pattern2"]   // extra patterns to match
 *
 * Defaults cover the obvious sensitive files: env files, .git internals,
 * node_modules, and the Pi agent's own credential/auth files.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DEFAULT_PROTECTED: string[] = [
	".env",
	".env.",
	".git/",
	"node_modules/",
	".pi/agent/settings.json",
	".pi/agent/auth.json",
	".pi/agent/models.json",
];

function loadExtraProtected(): string[] {
	try {
		const raw = readFileSync(join(homedir(), ".pi/agent/settings.json"), "utf8");
		const settings = JSON.parse(raw);
		const extras = settings?.protectedPaths;
		if (Array.isArray(extras)) return extras.filter((p): p is string => typeof p === "string");
	} catch {
		/* fall through */
	}
	return [];
}

export default function (pi: ExtensionAPI) {
	const protectedPaths = [...DEFAULT_PROTECTED, ...loadExtraProtected()];

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "write" && event.toolName !== "edit") return undefined;

		const input = event.input as Record<string, unknown>;
		const path = (input.file_path ?? input.path) as string | undefined;
		if (!path) return undefined;

		const matched = protectedPaths.find((p) => path.includes(p));
		if (!matched) return undefined;

		if (!ctx.hasUI) {
			return { block: true, reason: `Protected path "${path}" (no UI to confirm)` };
		}

		const approved = await ctx.ui.confirm(
			"Modify protected path?",
			`Tool: ${event.toolName}\nPath: ${path}\nMatched pattern: ${matched}\n\nApprove this change?`,
		);

		if (!approved) {
			ctx.ui.notify(`Blocked write to ${path}`, "warning");
			return { block: true, reason: "User denied edit to protected path" };
		}

		return undefined;
	});
}
