export type SessionMode = "balanced" | "strict";
export type SessionRole = "main" | "executor";

export type ActionClass = "read" | "mutating" | "privileged" | "destructive" | "unknown";

export interface ValidationInput {
	sessionMode: SessionMode;
	sessionRole: SessionRole;
	toolName: string;
	toolInput: unknown;
}

export interface ValidationResult {
	allow: boolean;
	reason?: string;
	actionClass: ActionClass;
	escalateToStrict?: boolean;
}

const READ_ONLY_TOOLS = new Set(["read", "grep", "find", "ls", "recall_mcp_load"]);
const MUTATING_TOOLS = new Set(["write", "edit"]);

const DESTRUCTIVE_BASH = [
	/\brm\s+(-rf?|--recursive)\b/i,
	/\bmkfs\b/i,
	/\bdd\b/i,
	/\b(shred|wipefs|fdisk|parted|truncate)\b/i,
	/\bfind\b.*\b-delete\b/i,
];

const PRIVILEGED_BASH = [
	/^\s*sudo\b/i,
	/\b(apt|apt-get|dnf|yum|pacman|zypper|dpkg)\b/i,
	/\b(systemctl|service|mount|umount|useradd|usermod|groupadd|groupdel)\b/i,
];

const MUTATING_BASH = [
	/\bgit\s+(add|commit|push|merge|rebase|reset|checkout|cherry-pick|apply)\b/i,
	/\b(mv|cp|mkdir|touch)\b/i,
	/\bsed\s+-i\b/i,
	/\bperl\s+-i\b/i,
	/\b(npm|pnpm|yarn)\s+(install|add|remove|uninstall|ci)\b/i,
	/(^|[^<])>>?[^>]/, // > or >> redirection
];

const READONLY_BASH = [
	/^\s*ls\b/i,
	/^\s*pwd\b/i,
	/^\s*cat\b/i,
	/^\s*(rg|grep|find)\b/i,
	/^\s*git\s+(status|log|diff|show)\b/i,
	/^\s*(head|tail|wc)\b/i,
	/^\s*sed\s+-n\b/i,
];

function getCommand(input: unknown): string {
	if (!input || typeof input !== "object") return "";
	const cmd = (input as Record<string, unknown>).command;
	return typeof cmd === "string" ? cmd : "";
}

export function classifyAction(toolName: string, toolInput: unknown): ActionClass {
	if (READ_ONLY_TOOLS.has(toolName)) return "read";
	if (MUTATING_TOOLS.has(toolName)) return "mutating";
	if (toolName !== "bash") return "unknown";

	const command = getCommand(toolInput);
	if (!command.trim()) return "unknown";
	if (DESTRUCTIVE_BASH.some((p) => p.test(command))) return "destructive";
	if (PRIVILEGED_BASH.some((p) => p.test(command))) return "privileged";
	if (MUTATING_BASH.some((p) => p.test(command))) return "mutating";
	if (READONLY_BASH.some((p) => p.test(command))) return "read";
	return "unknown";
}

export function validateToolCall(input: ValidationInput): ValidationResult {
	const actionClass = classifyAction(input.toolName, input.toolInput);
	const isMain = input.sessionRole === "main";

	if (actionClass === "read") return { allow: true, actionClass };
	if (!isMain) return { allow: true, actionClass };

	if (input.sessionMode === "strict") {
		if (actionClass === "mutating" || actionClass === "privileged" || actionClass === "destructive" || actionClass === "unknown") {
			return {
				allow: false,
				actionClass,
				reason: `[subagent-policy] ${input.toolName} blocked for main agent in strict mode. Delegate to 'executor'.`,
				escalateToStrict: true,
			};
		}
	}

	if (input.sessionMode === "balanced") {
		if (actionClass === "destructive") {
			return {
				allow: false,
				actionClass,
				reason: `[subagent-policy] destructive action blocked for main agent.`,
				escalateToStrict: true,
			};
		}
	}

	return { allow: true, actionClass };
}
