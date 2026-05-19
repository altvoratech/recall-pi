/**
 * trace-recorder — tipos e versões de contrato.
 */

export const SCHEMA_VERSION = "1.0.0";
export const CONTRACT_VERSION = "1.0.0";

export interface ToolSpan {
	tool_call_id: string;
	tool_name: string;
	started_at: string;
	ended_at: string;
	args_summary?: string;
}

export interface ActiveRun {
	runId: string;
	phase: "main" | "subagent";
	subagentName?: string;
	subagentModel?: string;
	startedAt: string;
	toolSpans: Map<string, ToolSpan>;
	artifactRefs: Set<string>;
	modelId: string;
	sessionId: string;
}

export interface SessionEntryLike {
	type?: string;
	customType?: string;
	data?: Record<string, unknown>;
	message?: {
		role?: string;
		usage?: { input?: number; output?: number; totalTokens?: number };
	};
}

export interface ToolEventLike {
	toolCallId: string;
	toolName: string;
	input?: Record<string, unknown>;
	args?: Record<string, unknown>;
	isError?: boolean;
	details?: unknown;
}
