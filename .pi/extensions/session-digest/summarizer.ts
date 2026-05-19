import { complete } from "@earendil-works/pi-ai";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";

import type { SessionDigestConfig, DigestGenerationResult } from "./types.ts";

type CompleteFn = typeof complete;

const MAX_PREVIOUS_DIGEST_CHARS = 12_000;

const DIGEST_INSTRUCTIONS = `You are generating a manual session digest for an active coding session.

This digest is AUXILIARY OPERATIONAL MEMORY, not a final report and not a compaction rewrite.
It should help the operator or agent re-anchor quickly without changing the live session context.

Capture:
1. Active goal and current execution state
2. Key decisions and constraints that are still load-bearing
3. Important files, functions, symbols, and artifacts touched
4. Attempts, dead ends, or repeated loops to avoid
5. Open threads and the most useful next steps

Avoid:
- concluding language
- step-by-step history of everything
- thanking/closing tones
- rewriting recent details that are already obvious from context

Format: concise structured markdown with clear headings.`;

function truncateTail(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	return `[conversation truncated to last ${maxChars.toLocaleString()} chars]\n\n${text.slice(-maxChars)}`;
}

export async function generateSessionDigest(
	ctx: ExtensionCommandContext,
	config: SessionDigestConfig,
	deps: { completeFn?: CompleteFn; previousDigest?: string } = {},
): Promise<DigestGenerationResult> {
	const branch = ctx.sessionManager.getBranch();
	const messages = branch
		.filter((entry): entry is typeof entry & { type: "message"; message: any } => entry.type === "message")
		.map((entry) => entry.message);

	if (messages.length === 0) {
		throw new Error("No conversation messages found for session digest");
	}

	const conversationText = serializeConversation(convertToLlm(messages));
	const model = ctx.modelRegistry.find(config.summarizerProvider, config.summarizerModel);
	if (!model) {
		throw new Error(`Summarizer ${config.summarizerProvider}/${config.summarizerModel} not found`);
	}

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (auth.ok === false) {
		throw new Error(auth.error);
	}
	if (!auth.apiKey) {
		throw new Error(`No API key for ${model.provider}/${model.id}`);
	}

	const previousDigest = deps.previousDigest?.trim();
	const previousBlock = previousDigest
		? `\n\n<previous-digest>\n${previousDigest.slice(-MAX_PREVIOUS_DIGEST_CHARS)}\n</previous-digest>`
		: "";
	const maxConversationChars = Math.max(12_000, Math.floor((model.contextWindow || 64_000) * 3));
	const completeFn = deps.completeFn ?? complete;
	const response = await completeFn(
		model,
		{
			messages: [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: `${DIGEST_INSTRUCTIONS}${previousBlock}\n\n<conversation>\n${truncateTail(conversationText, maxConversationChars)}\n</conversation>`,
						},
					],
					timestamp: Date.now(),
				},
			],
		},
		{
			apiKey: auth.apiKey,
			headers: auth.headers,
			maxTokens: config.maxTokens,
			signal: ctx.signal,
		},
	);

	const summary = response.content
		.filter((part): part is { type: "text"; text: string } => part.type === "text")
		.map((part) => part.text)
		.join("\n")
		.trim();

	if (!summary) {
		throw new Error("Empty summary returned by summarizer");
	}

	return {
		summary,
		modelLabel: `${model.provider}/${model.id}`,
	};
}
