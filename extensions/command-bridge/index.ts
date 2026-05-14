/**
 * Command Bridge Extension
 *
 * Lê slash commands de outros ecossistemas (Claude Code, Codex, Opencode) e os
 * registra como comandos do Pi. O corpo do .md vira o template; argumentos do
 * usuário são interpolados via `$@` / `$ARGUMENTS`.
 *
 * Quando um comando externo é invocado, o body interpolado é enviado como
 * mensagem do usuário pro agente — mesmo efeito de digitar o conteúdo do
 * template manualmente.
 *
 * Comandos descobertos viram `/<source>:<name>` (namespacing por source pra
 * evitar colisão e deixar a origem visível ao operador):
 *   /claude:refactor
 *   /codex:test-gen
 *   /opencode:new-feature
 *
 * Settings (~/.pi/agent/settings.json):
 *   "commandBridge": {
 *     "enabled": true,                              // default true
 *     "sources": [                                  // default abaixo
 *       { "name": "claude",    "dir": "~/.claude/commands",  "priority": 80 },
 *       { "name": "claude-sk", "dir": "~/.claude/skills",    "priority": 70, "subdirMode": true },
 *       { "name": "codex",     "dir": "~/.codex/prompts",    "priority": 70 },
 *       { "name": "opencode",  "dir": "~/.opencode/commands","priority": 55 }
 *     ]
 *   }
 *
 * Frontmatter suportado em cada .md:
 *   ---
 *   name: <opcional, default = filename sem .md>
 *   description: <opcional>
 *   ---
 *   <corpo do template, com $@ ou $ARGUMENTS pra args>
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { readGlobalSettings } from "../shared/settings.ts";

interface SourceConfig {
	name: string;
	dir: string;
	priority: number;
	subdirMode?: boolean;
	// Se subdirMode=true, varre subdirs e procura SKILL.md (ou primeiro .md) em cada.
}

interface BridgeSettings {
	enabled: boolean;
	sources: SourceConfig[];
}

const DEFAULT_SOURCES: SourceConfig[] = [
	{ name: "claude", dir: "~/.claude/commands", priority: 80 },
	{ name: "claude-sk", dir: "~/.claude/skills", priority: 70, subdirMode: true },
	{ name: "codex", dir: "~/.codex/prompts", priority: 70 },
	{ name: "opencode", dir: "~/.opencode/commands", priority: 55 },
];

function expandHome(p: string): string {
	if (p.startsWith("~")) return path.join(os.homedir(), p.slice(1));
	return p;
}

function loadSettings(): BridgeSettings {
	try {
		const parsed = readGlobalSettings();
		const cfg = (parsed as any)?.commandBridge ?? {};
		return {
			enabled: cfg.enabled !== false, // default true
			sources: Array.isArray(cfg.sources) && cfg.sources.length > 0 ? cfg.sources : DEFAULT_SOURCES,
		};
	} catch {
		return { enabled: true, sources: DEFAULT_SOURCES };
	}
}

interface DiscoveredCommand {
	name: string;       // <source>:<basename>
	bareName: string;   // basename sem source
	description: string;
	body: string;
	source: string;
	priority: number;
	filePath: string;
}

function readMdFile(filePath: string): { name?: string; description?: string; body: string } | null {
	try {
		const raw = fs.readFileSync(filePath, "utf8");
		const { frontmatter, body } = parseFrontmatter<Record<string, string>>(raw);
		return {
			name: typeof frontmatter.name === "string" ? frontmatter.name : undefined,
			description: typeof frontmatter.description === "string" ? frontmatter.description : undefined,
			body,
		};
	} catch {
		return null;
	}
}

function scanDir(source: SourceConfig): DiscoveredCommand[] {
	const dir = expandHome(source.dir);
	const out: DiscoveredCommand[] = [];

	if (!fs.existsSync(dir)) return out;

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}

	for (const entry of entries) {
		if (source.subdirMode) {
			if (!entry.isDirectory()) continue;
			const subdir = path.join(dir, entry.name);
			// preferred: SKILL.md, fallback: <entry.name>.md, fallback: primeiro .md no subdir
			const candidates = [
				path.join(subdir, "SKILL.md"),
				path.join(subdir, `${entry.name}.md`),
			];
			let chosen: string | null = null;
			for (const c of candidates) {
				if (fs.existsSync(c)) {
					chosen = c;
					break;
				}
			}
			if (!chosen) {
				try {
					const sub = fs.readdirSync(subdir).filter((f) => f.toLowerCase().endsWith(".md"));
					if (sub[0]) chosen = path.join(subdir, sub[0]);
				} catch {
					continue;
				}
			}
			if (!chosen) continue;
			const parsed = readMdFile(chosen);
			if (!parsed) continue;
			const bareName = parsed.name ?? entry.name;
			out.push({
				name: `${source.name}:${bareName}`,
				bareName,
				description: parsed.description ?? `(${source.name}) ${bareName}`,
				body: parsed.body,
				source: source.name,
				priority: source.priority,
				filePath: chosen,
			});
		} else {
			if (!entry.isFile() && !entry.isSymbolicLink()) continue;
			if (!entry.name.toLowerCase().endsWith(".md")) continue;
			const filePath = path.join(dir, entry.name);
			const parsed = readMdFile(filePath);
			if (!parsed) continue;
			const bareName = parsed.name ?? entry.name.replace(/\.md$/i, "");
			out.push({
				name: `${source.name}:${bareName}`,
				bareName,
				description: parsed.description ?? `(${source.name}) ${bareName}`,
				body: parsed.body,
				source: source.name,
				priority: source.priority,
				filePath,
			});
		}
	}

	return out;
}

function interpolate(body: string, args: string): string {
	// Substitui $@, $ARGUMENTS, e $1 $2 $3 (posicional simples)
	const trimmedArgs = args.trim();
	let result = body
		.replace(/\$ARGUMENTS\b/g, trimmedArgs)
		.replace(/\$@/g, trimmedArgs);

	if (trimmedArgs) {
		const positional = trimmedArgs.split(/\s+/);
		result = result.replace(/\$([1-9])/g, (_match, n: string) => {
			const idx = Number.parseInt(n, 10) - 1;
			return positional[idx] ?? "";
		});
	}

	return result;
}

export default function (pi: ExtensionAPI) {
	const settings = loadSettings();
	if (!settings.enabled) return;

	pi.on("session_start", (_event, ctx) => {
		const discovered: DiscoveredCommand[] = [];

		for (const source of settings.sources) {
			discovered.push(...scanDir(source));
		}

		// Sort by (priority desc, name asc) only for diagnostics — actual registration uses unique <source>:<name> so no collision.
		discovered.sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));

		for (const cmd of discovered) {
			pi.registerCommand(cmd.name, {
				description: cmd.description,
				handler: async (args, cmdCtx) => {
					const text = interpolate(cmd.body, args ?? "");
					if (!text.trim()) {
						cmdCtx.ui.notify(`Command ${cmd.name} produced empty body`, "warning");
						return;
					}
					pi.sendUserMessage(text);
				},
			});
		}

		if (ctx.hasUI && discovered.length > 0) {
			const bySource = new Map<string, number>();
			for (const c of discovered) {
				bySource.set(c.source, (bySource.get(c.source) ?? 0) + 1);
			}
			const summary = [...bySource.entries()].map(([s, n]) => `${s}=${n}`).join(", ");
			ctx.ui.notify(`Command bridge: ${discovered.length} command(s) loaded (${summary})`, "info");
		}

		// Expose status command for diagnostics
		pi.registerCommand("command-bridge", {
			description: "List commands loaded from external ecosystems (claude/codex/opencode)",
			handler: async (_args, c) => {
				if (discovered.length === 0) {
					c.ui.notify("No external commands found.", "info");
					return;
				}
				const lines = discovered.map((cmd) => `/${cmd.name}  — ${cmd.description}`);
				c.ui.notify(`External commands:\n${lines.join("\n")}`, "info");
			},
		});
	});
}
