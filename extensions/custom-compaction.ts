/**
 * Custom Compaction Extension
 *
 * Replaces default compaction with a full conversation summary via a configurable
 * summarizer model (defaults to google/gemini-2.5-flash — cheap and fast).
 *
 * Config via ~/.pi/agent/settings.json:
 *   "compaction": {
 *     "summarizerProvider": "google",
 *     "summarizerModel": "gemini-2.5-flash"
 *   }
 *
 * On `session_before_compact`:
 *   1. Pull all messagesToSummarize + turnPrefixMessages
 *   2. Send to summarizer model with a structured prompt
 *   3. Return summary that replaces the entire history
 *
 * Falls back to default compaction if model lookup or auth fails.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { complete } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";

const DEFAULT_PROVIDER = "google";
const DEFAULT_MODEL = "gemini-2.5-flash";

function loadConfig(): { provider: string; model: string } {
	try {
		const settings = JSON.parse(readFileSync(join(homedir(), ".pi/agent/settings.json"), "utf8"));
		const c = settings?.compaction ?? {};
		return {
			provider: typeof c.summarizerProvider === "string" ? c.summarizerProvider : DEFAULT_PROVIDER,
			model: typeof c.summarizerModel === "string" ? c.summarizerModel : DEFAULT_MODEL,
		};
	} catch {
		return { provider: DEFAULT_PROVIDER, model: DEFAULT_MODEL };
	}
}

const SUMMARY_INSTRUCTIONS = `You are a conversation summarizer. Create a comprehensive summary of this conversation that captures:

1. The main goals and objectives discussed
2. Key decisions made and their rationale
3. Important code changes, file modifications, or technical details
4. Current state of any ongoing work
5. Any blockers, issues, or open questions
6. Next steps that were planned or suggested

Be thorough but concise. The summary will replace the ENTIRE conversation history, so include all information needed to continue the work effectively.

Format the summary as structured markdown with clear sections.`;

export default function (pi: ExtensionAPI) {
	const cfg = loadConfig();

	pi.on("session_before_compact", async (event, ctx) => {
		ctx.ui.notify(`Custom compaction starting (${cfg.provider}/${cfg.model})`, "info");

		const { preparation, signal } = event;
		const { messagesToSummarize, turnPrefixMessages, tokensBefore, firstKeptEntryId, previousSummary } = preparation;

		const model = ctx.modelRegistry.find(cfg.provider, cfg.model);
		if (!model) {
			ctx.ui.notify(`Summarizer ${cfg.provider}/${cfg.model} not found — falling back to default`, "warning");
			return;
		}

		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (auth.ok === false) {
			ctx.ui.notify(`Compaction auth failed: ${auth.error} — falling back to default`, "warning");
			return;
		}
		if (!auth.apiKey) {
			ctx.ui.notify(`No API key for ${model.provider} — falling back to default`, "warning");
			return;
		}

		const allMessages = [...messagesToSummarize, ...turnPrefixMessages];
		const conversationText = serializeConversation(convertToLlm(allMessages));
		const previousContext = previousSummary ? `\n\nPrevious session summary for context:\n${previousSummary}` : "";

		const summaryMessages = [
			{
				role: "user" as const,
				content: [
					{
						type: "text" as const,
						text: `${SUMMARY_INSTRUCTIONS}${previousContext}\n\n<conversation>\n${conversationText}\n</conversation>`,
					},
				],
				timestamp: Date.now(),
			},
		];

		ctx.ui.notify(
			`Summarizing ${allMessages.length} messages (${tokensBefore.toLocaleString()} tokens)…`,
			"info",
		);

		try {
			const response = await complete(
				model,
				{ messages: summaryMessages },
				{ apiKey: auth.apiKey, headers: auth.headers, maxTokens: 8192, signal },
			);

			const summary = response.content
				.filter((c): c is { type: "text"; text: string } => c.type === "text")
				.map((c) => c.text)
				.join("\n");

			if (!summary.trim()) {
				if (!signal.aborted) ctx.ui.notify("Summary empty — falling back to default", "warning");
				return;
			}

			return {
				compaction: { summary, firstKeptEntryId, tokensBefore },
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			ctx.ui.notify(`Compaction failed: ${message} — falling back to default`, "error");
			return;
		}
	});
}
