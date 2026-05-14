/**
 * Custom Compaction Extension
 *
 * Replaces default compaction with a full conversation summary via a configurable
 * summarizer model (defaults to opencode-go/deepseek-v4-pro).
 *
 * Config via ~/.pi/agent/settings.json:
 *   "compaction": {
 *     "summarizerProvider": "opencode-go",
 *     "summarizerModel": "deepseek-v4-pro"
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
import { readGlobalSettings } from "./shared/settings.ts";
import { complete } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";

const DEFAULT_PROVIDER = "opencode-go";
const DEFAULT_MODEL = "deepseek-v4-pro";

function loadConfig(): { provider: string; model: string } {
	try {
		const settings = readGlobalSettings();
		const c = (settings as any)?.compaction ?? {};
		return {
			provider: typeof c.summarizerProvider === "string" ? c.summarizerProvider : DEFAULT_PROVIDER,
			model: typeof c.summarizerModel === "string" ? c.summarizerModel : DEFAULT_MODEL,
		};
	} catch {
		return { provider: DEFAULT_PROVIDER, model: DEFAULT_MODEL };
	}
}

const SUMMARY_INSTRUCTIONS_FIRST = `You are summarizing the EARLIER portion of an active, ongoing conversation.
The most RECENT messages will be preserved verbatim AFTER your summary — they continue
the work this summary will be background context for.

Your output is HANDOFF STATE, not a final report. The agent reading this next turn
must treat it as their own working memory and pick up from here without resetting.

Capture:
1. Active goal and current approach being executed
2. Key decisions made and rationale (briefly — recent messages preserve detail)
3. Important paths, function names, identifiers, and artifacts introduced
4. Open questions and pending steps the agent still needs to address
5. Operator preferences and constraints established during the session

Avoid:
- Concluding language ("we finished", "this completes...", "in conclusion")
- Final-report framing or "thanks for the conversation" tones
- Step-by-step recaps of every action — focus on state, not history
- Restating what recent messages already preserve verbatim

Format: structured markdown, scannable, concise. Write as if briefing yourself
mid-task, not closing out a deliverable.`;

const SUMMARY_INSTRUCTIONS_ITERATIVE = `You are updating a CUMULATIVE running summary of an active conversation.
A previous summary exists (it represents EARLIER state); new messages have happened since.
Recent messages will be preserved verbatim AFTER the updated summary.

Your output replaces the previous summary with one that INCORPORATES new developments
while keeping load-bearing state from the old summary. This is rolling working memory,
not a fresh report.

Rules:
- Merge: do NOT discard active goals, decisions, paths, or open questions from the
  previous summary unless explicitly superseded by new messages.
- Erode safely: detail that's no longer relevant can be condensed; load-bearing
  state must persist.
- Continue framing: this is mid-task working memory, not a conclusion. Avoid
  any "we finished / in summary / thanks" language.
- Recent messages exist AFTER this summary verbatim — don't repeat what they contain.

Format: structured markdown, scannable, concise.`;

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

		const instructions = previousSummary ? SUMMARY_INSTRUCTIONS_ITERATIVE : SUMMARY_INSTRUCTIONS_FIRST;
		const priorBlock = previousSummary
			? `\n\n<previous-summary>\n${previousSummary}\n</previous-summary>`
			: "";

		const summaryMessages = [
			{
				role: "user" as const,
				content: [
					{
						type: "text" as const,
						text: `${instructions}${priorBlock}\n\n<conversation>\n${conversationText}\n</conversation>`,
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
