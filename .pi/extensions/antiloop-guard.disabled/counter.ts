/**
 * Tool Call Counter
 *
 * Tracks tool calls per agent run with deduplication.
 */

export class ToolCallCounter {
	private count = 0;
	private limit = 10;
	private agentRole = "default";
	private seenToolCallIds = new Set<string>();

	reset(agentRole: string, limit: number): void {
		this.count = 0;
		this.limit = limit;
		this.agentRole = agentRole;
		this.seenToolCallIds.clear();
	}

	/**
	 * Increment counter if toolCallId hasn't been seen.
	 * Returns true if this was a new call, false if duplicate.
	 */
	increment(toolCallId?: string): boolean {
		if (toolCallId && this.seenToolCallIds.has(toolCallId)) {
			return false; // Duplicate, don't count
		}
		if (toolCallId) {
			this.seenToolCallIds.add(toolCallId);
		}
		this.count++;
		return true;
	}

	isLimitReached(): boolean {
		return this.count >= this.limit;
	}

	getCount(): number {
		return this.count;
	}

	getLimit(): number {
		return this.limit;
	}

	getAgentRole(): string {
		return this.agentRole;
	}

	getRemaining(): number {
		return Math.max(0, this.limit - this.count);
	}

	isActive(): boolean {
		return this.limit > 0;
	}
}

// Singleton instance per extension lifecycle
export const counter = new ToolCallCounter();
