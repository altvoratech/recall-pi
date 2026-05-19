/**
 * Antiloop Guard Configuration
 *
 * Defines limits per agent role and detection heuristics.
 */

export interface AgentLimits {
	scout: number;
	planner: number;
	worker: number;
	reviewer: number;
	debugger: number;
	default: number;
}

export const DEFAULT_LIMITS: AgentLimits = {
	scout: 8,
	planner: 5,
	worker: 15,
	reviewer: 6,
	debugger: 10,
	default: 10,
};

/**
 * Detect which agent role is running based on prompt patterns.
 */
export function detectAgentRole(prompt: string): keyof AgentLimits {
	const lower = prompt.toLowerCase();

	// Check for explicit agent task markers
	if (lower.includes("you are the reconnaissance agent") || lower.includes("scout")) {
		return "scout";
	}
	if (lower.includes("you are a planning specialist") || lower.includes("implementation plan")) {
		return "planner";
	}
	if (lower.includes("you are a worker agent") || lower.includes("execute")) {
		return "worker";
	}
	if (lower.includes("you are a review specialist") || lower.includes("reviewer")) {
		return "reviewer";
	}
	if (lower.includes("you are the diagnostic agent") || lower.includes("debugger")) {
		return "debugger";
	}

	return "default";
}

/**
 * Get the limit for a given agent role.
 */
export function getLimitForAgent(role: keyof AgentLimits): number {
	return DEFAULT_LIMITS[role] ?? DEFAULT_LIMITS.default;
}
