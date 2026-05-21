/**
 * Agent discovery and configuration
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";

export type AgentScope = "user" | "project" | "both";
export type AgentSource = "extension" | "user" | "project";

export interface AgentConfig {
	name: string;
	description: string;
	role?: string;
	tools?: string[];
	model?: string;
	systemPrompt: string;
	source: AgentSource;
	filePath: string;
}

// Capability ceiling por NOME de agent (nomes de built-in do Pi:
// read,bash,edit,write,grep,find,ls). O `tools:` do .md só pode
// ESTREITAR dentro do teto, nunca exceder. Agent desconhecido (ex:
// project-local repo-controlled) cai no teto read-only seguro — não
// pode se auto-conceder write/edit/bash via frontmatter.
const READONLY_SAFE = ["read", "grep", "find", "ls"] as const;

const NAME_CEILING: Record<string, readonly string[]> = {
	// Core pipeline
	scout: ["read", "bash", "grep", "find", "ls"],
	planner: ["read", "bash", "grep", "find", "ls"],
	executor: ["read", "write", "edit", "bash", "grep", "find", "ls"],
	debugger: ["read", "bash", "grep", "find", "ls"],
	reviewer: ["read", "bash", "grep", "find", "ls"],
	// Specialists (FUTURE IMPLEMENTATION)
	"security-reviewer": ["read", "bash", "grep", "find", "ls"],
	"test-engineer": ["read", "write", "edit", "bash", "grep", "find", "ls"],
	"git-master": ["read", "bash", "grep", "find", "ls"],
	"code-simplifier": ["read", "write", "edit", "bash", "grep", "find", "ls"],
	critic: ["read", "bash", "grep", "find", "ls"],
	architect: ["read", "bash", "grep", "find", "ls"],
};

/**
 * Tools efetivas = interseção entre o que o .md declara e o teto da
 * capability (chaveado por nome). Sempre retorna lista NÃO vazia: um
 * agent sem tools válidas roda no seu teto seguro, nunca no toolset
 * default completo do Pi. Esse resultado vai pro `--tools` do
 * subprocess, que — com `--no-extensions` — é a fronteira de
 * segurança real do subagente.
 */
function resolveTools(name: string, declared: string[] | undefined): string[] {
	const ceiling = NAME_CEILING[name] ?? READONLY_SAFE;
	const allowed = new Set<string>(ceiling);
	const narrowed = (declared ?? []).map((t) => t.toLowerCase()).filter((t) => allowed.has(t));
	return narrowed.length > 0 ? narrowed : [...ceiling];
}

const EXTENSION_AGENTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "agents");

export interface AgentDiscoveryResult {
	agents: AgentConfig[];
	projectAgentsDir: string | null;
}

function loadAgentsFromDir(dir: string, source: AgentSource): AgentConfig[] {
	const agents: AgentConfig[] = [];

	if (!fs.existsSync(dir)) {
		return agents;
	}

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return agents;
	}

	for (const entry of entries) {
		if (!entry.name.endsWith(".md")) continue;
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;

		const filePath = path.join(dir, entry.name);
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}

		const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content);

		if (!frontmatter.name || !frontmatter.description) {
			continue;
		}

		const tools = frontmatter.tools
			?.split(",")
			.map((t: string) => t.trim())
			.filter(Boolean);
		const role = frontmatter.role?.trim();

		agents.push({
			name: frontmatter.name,
			description: frontmatter.description,
			role,
			tools: resolveTools(frontmatter.name, tools),
			model: frontmatter.model,
			systemPrompt: body,
			source,
			filePath,
		});
	}

	return agents;
}

function isDirectory(p: string): boolean {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

function findNearestProjectAgentsDir(cwd: string): string | null {
	let currentDir = cwd;
	while (true) {
		const candidate = path.join(currentDir, ".pi", "agents");
		if (isDirectory(candidate)) return candidate;

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) return null;
		currentDir = parentDir;
	}
}

export function discoverAgents(cwd: string, scope: AgentScope): AgentDiscoveryResult {
	const userDir = path.join(getAgentDir(), "agents");
	const projectAgentsDir = findNearestProjectAgentsDir(cwd);

	// Cascade: extension bundled (baseline) -> user dir (override) -> project dir (override)
	// Same agent name in a later layer replaces the earlier one.
	const extensionAgents = scope === "project" ? [] : loadAgentsFromDir(EXTENSION_AGENTS_DIR, "extension");
	const userAgents = scope === "project" ? [] : loadAgentsFromDir(userDir, "user");
	const projectAgents = scope === "user" || !projectAgentsDir ? [] : loadAgentsFromDir(projectAgentsDir, "project");

	const agentMap = new Map<string, AgentConfig>();
	for (const agent of extensionAgents) agentMap.set(agent.name, agent);
	for (const agent of userAgents) agentMap.set(agent.name, agent);
	for (const agent of projectAgents) agentMap.set(agent.name, agent);

	return { agents: Array.from(agentMap.values()), projectAgentsDir };
}

export function formatAgentList(agents: AgentConfig[], maxItems: number): { text: string; remaining: number } {
	if (agents.length === 0) return { text: "none", remaining: 0 };
	const listed = agents.slice(0, maxItems);
	const remaining = agents.length - listed.length;
	return {
		text: listed.map((a) => `${a.name} (${a.source}): ${a.description}`).join("; "),
		remaining,
	};
}
