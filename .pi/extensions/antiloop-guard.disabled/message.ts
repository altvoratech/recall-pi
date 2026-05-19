/**
 * Antiloop Guard Messages
 *
 * Templates and builders for block responses.
 */

export const ANTILOOP_BLOCK_REASON = (agent: string, count: number, limit: number): string =>
	`[antiloop-guard] Limit of ${limit} tool calls reached for agent '${agent}' (${count} used). ` +
	`Blocking further tools. Produce your response now with whatever context you have.`;

export interface BlockResponse {
	block: true;
	reason: string;
}

export function buildBlockResponse(agent: string, count: number, limit: number): BlockResponse {
	return {
		block: true,
		reason: ANTILOOP_BLOCK_REASON(agent, count, limit),
	};
}

export const WARNING_NEAR_LIMIT = (agent: string, remaining: number): string =>
	`[antiloop-guard] Agent '${agent}' has ${remaining} tool call(s) remaining before limit.`;
