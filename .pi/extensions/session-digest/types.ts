export interface SessionDigestConfig {
	enabled: boolean;
	notifyAfterTurns: number;
	remindEveryTurns: number;
	recentWithinTurns: number;
	summarizerProvider: string;
	summarizerModel: string;
	maxTokens: number;
}

export interface PersistedSessionDigestState {
	version: 2;
	turnCount: number;
	checkpointTurnCount: number;
	lastNotifiedTurn: number;
	updatedAt: string;
}

export interface DigestArtifactState {
	schemaVersion: 1;
	sessionId: string;
	projectId?: string;
	startedAt: string;
	updatedAt: string;
	turnCountAtDigest?: number;
	source: "manual" | "scheduled";
	model?: string;
	tokensEstimate?: number;
}

export interface DigestPresence {
	exists: boolean;
	recent: boolean;
	state?: DigestArtifactState;
}

export interface DigestPaths {
	sessionId?: string;
	rootDir: string;
	dir?: string;
	latestPath?: string;
	statePath?: string;
}

export interface DigestGenerationResult {
	summary: string;
	modelLabel: string;
	tokensEstimate?: number;
}
