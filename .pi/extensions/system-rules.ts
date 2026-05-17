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
import * as path from "node:path";
import { readProjectSettings, readSettings } from "./shared/settings.ts";

const DEFAULT_PATH = join(homedir(), ".pi/agent/GLOBAL_RULES.md");

function resolveConfiguredPath(raw: string, baseDir: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return DEFAULT_PATH;
	if (trimmed.startsWith("~")) return join(homedir(), trimmed.slice(1));
	if (path.isAbsolute(trimmed)) return trimmed;
	// Relative paths in project settings resolve relative to the .pi/ directory (per Pi docs).
	return path.resolve(baseDir, trimmed);
}

function resolvePath(cwd: string): string {
	try {
		// Respect Pi's settings precedence: project overrides global.
		const project = readProjectSettings(cwd);
		const projectPath = (project.settings as any)?.systemRules?.path;
		if (typeof projectPath === "string" && project.path) {
			return resolveConfiguredPath(projectPath, path.dirname(project.path));
		}

		const merged = readSettings(cwd).settings;
		const p = (merged as any)?.systemRules?.path;
		if (typeof p === "string" && p.length > 0) {
			// Global settings paths resolve relative to ~/.pi/agent (Pi docs). If user put a relative path here,
			// resolve it relative to that directory.
			const baseDir = join(homedir(), ".pi/agent");
			return resolveConfiguredPath(p, baseDir);
		}
	} catch {
		/* fall through */
	}
	return DEFAULT_PATH;
}

function loadRules(cwd: string): string | null {
	const rulesPath = resolvePath(cwd);
	if (!existsSync(rulesPath)) return null;
	try {
		return readFileSync(rulesPath, "utf8").trim();
	} catch {
		return null;
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event, ctx) => {
		const rules = loadRules(ctx.cwd);
		if (!rules) return undefined;

		const base = event.systemPrompt?.trim() ?? "";
		const block = `# Global Operator Rules (authoritative)\n\n${rules}`;
		return {
			systemPrompt: base ? `${base}\n\n${block}` : block,
		};
	});
}
