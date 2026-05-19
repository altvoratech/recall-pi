import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { loadConfig, DEFAULT_CONFIG } from "./config.ts";
import {
	countAssistantTurns,
	deriveCheckpointTurnCount,
	getTurnsSinceCheckpoint,
	persistSessionDigestState,
	renderDigestStatus,
	restorePersistedState,
	shouldNotify,
} from "./state.ts";
import {
	getDigestPaths,
	readDigestMarkdown,
	readDigestPresence,
	readProjectId,
	readDigestState,
	writeDigestArtifact,
} from "./storage.ts";
import { generateSessionDigest } from "./summarizer.ts";
import type { DigestGenerationResult, DigestPresence, PersistedSessionDigestState, SessionDigestConfig } from "./types.ts";

const MAX_DIGEST_NOTIFY_CHARS = 4000;
const DIGEST_SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function formatStatusReport(
	ctx: ExtensionContext,
	state: PersistedSessionDigestState,
	digest: DigestPresence,
	config: SessionDigestConfig,
	options: { pendingInject?: boolean } = {},
): string {
	const paths = getDigestPaths(ctx);
	const digestState = digest.state;
	const lines = [
		"Session digest status:\n",
		`totalTurns: ${state.turnCount}`,
		`checkpointTurn: ${state.checkpointTurnCount}`,
		`turnsSinceCheckpoint: ${getTurnsSinceCheckpoint(state)}`,
		`threshold: ${config.notifyAfterTurns}`,
		`remindEvery: ${config.remindEveryTurns}`,
		`digest: ${digest.exists ? "present" : "missing"}`,
		`recent: ${digest.recent ? "yes" : "no"}`,
		`lastDigestTurn: ${digestState?.turnCountAtDigest ?? "—"}`,
		`updatedAt: ${digestState?.updatedAt ?? "—"}`,
		`source: ${digestState?.source ?? "—"}`,
		`model: ${digestState?.model ?? `${config.summarizerProvider}/${config.summarizerModel}`}`,
		`injectPending: ${options.pendingInject ? "yes" : "no"}`,
		`path: ${paths.latestPath ?? "(ephemeral session)"}`,
	];
	return lines.join("\n");
}

function parseSubcommand(args: string): "refresh" | "status" | "show" | "inject" | "unknown" {
	const command = args.trim().toLowerCase();
	if (!command) return "refresh";
	if (command === "refresh") return "refresh";
	if (command === "status") return "status";
	if (command === "show") return "show";
	if (command === "inject") return "inject";
	return "unknown";
}

export function createSessionDigestExtension(deps: {
	runDigest?: (
		ctx: ExtensionCommandContext,
		config: SessionDigestConfig,
		extra?: { previousDigest?: string },
	) => Promise<DigestGenerationResult>;
} = {}) {
	return function (pi: ExtensionAPI) {
		let config = DEFAULT_CONFIG;
		let state: PersistedSessionDigestState = {
			version: 2,
			turnCount: 0,
			checkpointTurnCount: 0,
			lastNotifiedTurn: 0,
			updatedAt: new Date(0).toISOString(),
		};
		let digest: DigestPresence = { exists: false, recent: false };
		let pendingInjectionDigest: string | null = null;

		const refreshFromSession = (ctx: ExtensionContext) => {
			config = loadConfig(ctx.cwd);
			state = restorePersistedState(ctx);
			digest = readDigestPresence(ctx, state.turnCount, config);
			state = {
				...state,
				checkpointTurnCount: deriveCheckpointTurnCount(state, digest),
			};
		};

		const updateStatus = (ctx: ExtensionContext) => {
			if (!config.enabled) {
				ctx.ui.setStatus("session-digest", undefined);
				return;
			}
			ctx.ui.setStatus("session-digest", renderDigestStatus(ctx, state, digest, config, { pendingInject: Boolean(pendingInjectionDigest) }));
		};

		const startDigestSpinner = (ctx: ExtensionContext) => {
			let frameIndex = 0;
			const render = () => {
				const theme = ctx.ui.theme;
				const frame = DIGEST_SPINNER_FRAMES[frameIndex % DIGEST_SPINNER_FRAMES.length] ?? "⠋";
				frameIndex++;
				ctx.ui.setStatus(
					"session-digest",
					`${theme.fg("accent", "sd")} ${theme.fg("warning", `${state.turnCount}t`)} ${theme.fg("accent", frame)}`,
				);
			};
			render();
			const timer = setInterval(render, 90);
			return () => clearInterval(timer);
		};

		pi.on("session_start", async (_event, ctx) => {
			refreshFromSession(ctx);
			updateStatus(ctx);
		});

		pi.on("session_tree", async (_event, ctx) => {
			refreshFromSession(ctx);
			updateStatus(ctx);
		});

		pi.on("turn_end", async (_event, ctx) => {
			if (!config.enabled) return;
			state = {
				...state,
				turnCount: state.turnCount + 1,
				updatedAt: new Date().toISOString(),
			};
			digest = readDigestPresence(ctx, state.turnCount, config);

			if (shouldNotify(state, digest, config)) {
				ctx.ui.notify(`Sessão longa (${state.turnCount} turns). Considere gerar um session digest.`, "warning");
				state = { ...state, lastNotifiedTurn: state.turnCount, updatedAt: new Date().toISOString() };
			}

			persistSessionDigestState(pi, state);
			updateStatus(ctx);
		});

		pi.on("before_agent_start", async (_event, ctx) => {
			if (!pendingInjectionDigest) return undefined;
			const digestToInject = pendingInjectionDigest;
			pendingInjectionDigest = null;
			updateStatus(ctx);
			ctx.ui.notify("Session digest injetado neste turn.", "info");
			return {
				message: {
					customType: "session-digest-context",
					content: [
						{
							type: "text",
							text: [
								"<session-digest>",
								"Use este digest como memória operacional auxiliar apenas para este turn.",
								digestToInject,
								"</session-digest>",
							].join("\n"),
						},
					],
					display: false,
					details: { injectedAt: new Date().toISOString(), source: "manual" },
				},
			};
		});

		pi.on("session_compact", async (_event, ctx) => {
			state = {
				...state,
				checkpointTurnCount: state.turnCount,
				lastNotifiedTurn: state.turnCount,
				updatedAt: new Date().toISOString(),
			};
			persistSessionDigestState(pi, state);
			updateStatus(ctx);
		});

		pi.on("session_shutdown", async (_event, ctx) => {
			pendingInjectionDigest = null;
			ctx.ui.setStatus("session-digest", undefined);
		});

		pi.registerCommand("session-digest", {
			description: "Gera ou inspeciona o digest manual da sessão atual",
			handler: async (args, ctx) => {
				const subcommand = parseSubcommand(args);
				if (subcommand === "unknown") {
					ctx.ui.notify("Uso: /session-digest [refresh|status|show|inject]", "warning");
					return;
				}

				refreshFromSession(ctx);

				if (subcommand === "inject") {
					const markdown = readDigestMarkdown(ctx);
					if (!markdown) {
						ctx.ui.notify("Nenhum session digest encontrado para injetar.", "warning");
						return;
					}
					pendingInjectionDigest = markdown;
					updateStatus(ctx);
					ctx.ui.notify("Session digest armado para o próximo turn.", "info");
					return;
				}

				if (subcommand === "status") {
					ctx.ui.notify(
						formatStatusReport(ctx, state, digest, config, { pendingInject: Boolean(pendingInjectionDigest) }),
						"info",
					);
					return;
				}

				if (subcommand === "show") {
					const markdown = readDigestMarkdown(ctx);
					if (!markdown) {
						ctx.ui.notify("Nenhum session digest encontrado para esta sessão.", "warning");
						return;
					}
					const preview =
						markdown.length > MAX_DIGEST_NOTIFY_CHARS
							? `${markdown.slice(0, MAX_DIGEST_NOTIFY_CHARS)}\n\n… (truncado)`
							: markdown;
					ctx.ui.notify(preview, "info");
					return;
				}

				await ctx.waitForIdle();
				refreshFromSession(ctx);
				ctx.ui.notify("Gerando session digest...", "info");
				const stopSpinner = startDigestSpinner(ctx);

				try {
					const runDigest = deps.runDigest ?? generateSessionDigest;
					const previousDigest = readDigestMarkdown(ctx) ?? undefined;
					const result = await runDigest(ctx, config, { previousDigest });
					const turnCount = countAssistantTurns(ctx);
					const artifact = writeDigestArtifact(ctx, result.summary, {
						projectId: readProjectId(ctx.cwd),
						turnCountAtDigest: turnCount,
						source: "manual",
						model: result.modelLabel,
						tokensEstimate: result.tokensEstimate,
					});

					state = {
						...state,
						turnCount,
						checkpointTurnCount: turnCount,
						lastNotifiedTurn: turnCount,
						updatedAt: artifact.updatedAt,
					};
					persistSessionDigestState(pi, state);
					digest = readDigestPresence(ctx, state.turnCount, config);
					updateStatus(ctx);
					ctx.ui.notify(
						`Session digest pronto (${artifact.model ?? result.modelLabel}) → ${readDigestState(ctx)?.turnCountAtDigest ?? turnCount} turns`,
						"info",
					);
				} catch (error) {
					ctx.ui.notify(
						`Session digest failed: ${error instanceof Error ? error.message : String(error)}`,
						"error",
					);
				} finally {
					stopSpinner();
					updateStatus(ctx);
				}
			},
		});
	};
}

export default createSessionDigestExtension();
