/**
 * System Rules Extension
 *
 * Injects ~/.pi/agent/GLOBAL_RULES.md at the END of the system prompt,
 * so global operator rules take precedence over project-level AGENTS.md
 * (which lives earlier in the prompt under "Project Context").
 *
 * Rationale: AGENTS.md global was being treated as just another project
 * context entry — projects could shadow it. Moving it to the tail of the
 * prompt and labeling it as override-authoritative makes the model
 * respect it consistently.
 *
 * Config (~/.pi/agent/settings.json):
 *   "systemRules": {
 *     "path": "~/.pi/agent/GLOBAL_RULES.md"   // override file path
 *   }
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DEFAULT_PATH = join(homedir(), ".pi/agent/GLOBAL_RULES.md");

function resolvePath(): string {
	try {
		const settings = readGlobalSettings();
		const p = (settings as any)?.systemRules?.path;
		if (typeof p === "string" && p.length > 0) {
			return p.startsWith("~") ? join(homedir(), p.slice(1)) : p;
		}
	} catch {
		/* fall through */
	}
	return DEFAULT_PATH;
}

function loadRules(): string | null {
	const path = resolvePath();
	if (!existsSync(path)) return null;
	try {
		return readFileSync(path, "utf8").trim();
	} catch {
		return null;
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event) => {
		const rules = loadRules();
		if (!rules) return undefined;

		const base = event.systemPrompt?.trim() ?? "";
		const block = `# Global Operator Rules (authoritative)\n\n${rules}`;
		return {
			systemPrompt: base ? `${base}\n\n${block}` : block,
		};
	});
}
