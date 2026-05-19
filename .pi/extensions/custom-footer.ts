/**
 * Custom Footer Extension — powerline (com background)
 *
 * Footer de 2 linhas, ambas com BLOCOS coloridos (background) estilo
 * powerline. Núcleo do efeito: o glifo separador tem fg = bg do segmento
 * anterior, criando a ilusão de seta conectando as cores.
 *
 *   π  model · thinking  cwd ⎇ branch  ↑in ↓out R  $cost ctx%      ● ready
 *   ▏ sub:auto … · pol:on · rcl ● · sd +0 ○ · Indicator: spinner
 *
 * Linha 1: segmentos com bg distintos + bleed (ThemeBg/ThemeColor do tema).
 * Linha 2: bloco único com os extension status pills (decisão
 * custom_footer_must_render_extension_statuses) — mesmo "peso" visual da
 * linha 1, não fica solto/estranho sem fundo.
 *
 * 100% theme-driven (getFgAnsi/getBgAnsi) — cores em
 * .pi/themes/recall-pi.json; fronteira theme=paleta/footer=estrutura.
 * Requer Nerd Font; fallback ASCII (sem bleed) via PI_FOOTER_ASCII=1.
 * Toggle com /footer (default on).
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import * as os from "node:os";

// ThemeBg não é re-exportado do root, mas Theme é — deriva do próprio
// método getBgAnsi (fonte única; não desatualiza se o Pi mudar os tokens).
type ThemeBg = Parameters<Theme["getBgAnsi"]>[0];

const RESET = "\x1b[0m";
const ASCII = process.env.PI_FOOTER_ASCII === "1";
const SEP = ASCII ? "" : ""; // U+E0B0 powerline solid
const SEP_THIN = ASCII ? "·" : ""; // U+E0B1 thin (intra-bloco)
const PI_GLYPH = ASCII ? "pi" : "π"; // π
const BRANCH_GLYPH = ASCII ? "git:" : "⎇"; // ⎇

function shortenPath(p: string): string {
	const home = os.homedir();
	return p.startsWith(home) ? `~${p.slice(home.length)}` : p;
}

function fmtTokens(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
	if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
	return `${(n / 1_000_000).toFixed(1)}M`;
}

// Converte um SGR de background no mesmo tom como foreground.
// Truecolor (\x1b[48;2;r;g;b m) e 256 (\x1b[48;5;n m).
function bgAsFg(bgAnsi: string): string {
	return bgAnsi.replace(/\x1b\[48/g, "\x1b[38");
}

interface Seg {
	bg: ThemeBg;
	fg: ThemeColor;
	text: string;
}

export default function (pi: ExtensionAPI) {
	let enabled = true;

	const enableFooter = (ctx: ExtensionContext) => {
		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsub = footerData.onBranchChange(() => tui.requestRender());

			// Grupo powerline: cada segmento com seu bg; seta = bg anterior.
			const renderPowerline = (segs: Seg[]): string => {
				if (segs.length === 0) return "";
				if (ASCII) {
					return segs
						.map((s) => theme.fg(s.fg, ` ${s.text} `))
						.join(theme.fg("dim", SEP_THIN));
				}
				let out = "";
				for (let i = 0; i < segs.length; i++) {
					const s = segs[i];
					out += theme.getBgAnsi(s.bg) + theme.getFgAnsi(s.fg) + ` ${s.text} `;
					const next = segs[i + 1];
					if (next) {
						out += theme.getBgAnsi(next.bg) + bgAsFg(theme.getBgAnsi(s.bg)) + SEP;
					} else {
						out += RESET + bgAsFg(theme.getBgAnsi(s.bg)) + SEP + RESET;
					}
				}
				return out;
			};

			// Backgrounds para pills da linha 2 (cicla se tiver mais pills que cores)
			const pillBgs: ThemeBg[] = [
				"selectedBg",
				"userMessageBg", 
				"customMessageBg",
				"toolPendingBg",
				"toolSuccessBg",
				"toolErrorBg",
			];

			return {
				dispose: unsub,
				invalidate() {},
				render(width: number): string[] {
					let input = 0,
						output = 0,
						cacheRead = 0,
						cost = 0;
					for (const e of ctx.sessionManager.getBranch()) {
						if (e.type === "message" && e.message.role === "assistant") {
							const m = e.message as AssistantMessage;
							input += m.usage.input;
							output += m.usage.output;
							cacheRead += m.usage.cacheRead ?? 0;
							cost += m.usage.cost?.total ?? 0;
						}
					}

					const branch = footerData.getGitBranch();
					const cwd = shortenPath(ctx.cwd);
					const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "no-model";
					const thinking = pi.getThinkingLevel?.();
					const usage = ctx.getContextUsage();
					const statuses = footerData.getExtensionStatuses();

					const ctxColor: ThemeColor =
						usage && usage.percent !== null
							? usage.percent >= 90
								? "error"
								: usage.percent >= 70
									? "warning"
									: "accent"
							: "muted";
					const ctxPct =
						usage && usage.percent !== null ? `${usage.percent.toFixed(0)}%` : "—";

					const segs: Seg[] = [
						{ bg: "selectedBg", fg: "accent", text: PI_GLYPH },
						{
							bg: "userMessageBg",
							fg: "text",
							text: model + (thinking ? ` · ${thinking}` : ""),
						},
						{
							bg: "customMessageBg",
							fg: "customMessageLabel",
							text: cwd + (branch ? ` ${BRANCH_GLYPH} ${branch}` : ""),
						},
						{
							bg: "toolPendingBg",
							fg: "muted",
							text: `↑${fmtTokens(input)} ↓${fmtTokens(output)} R${fmtTokens(cacheRead)}`,
						},
						{ bg: "toolSuccessBg", fg: ctxColor, text: `$${cost.toFixed(2)} ctx ${ctxPct}` },
					];

					const left = renderPowerline(segs);
					const runState = statuses?.get("run-state");
					let line1: string;
					if (runState) {
						const pad = Math.max(1, width - visibleWidth(left) - visibleWidth(runState));
						line1 = truncateToWidth(left + " ".repeat(pad) + runState, width);
					} else {
						line1 = truncateToWidth(left, width);
					}

					const lines = [line1];

					if (statuses && statuses.size > 0) {
						const priority = [
							"subagent",
							"subagent-hud",
							"subagent-classifier",
							"subagent-policy",
							"recall-context",
							"session-digest",
						];
						const seen = new Set<string>();
						const pills: string[] = [];
						for (const key of priority) {
							const v = statuses.get(key);
							if (v) {
								pills.push(v);
								seen.add(key);
							}
						}
						for (const [k, v] of Array.from(statuses.entries()).sort((a, b) =>
							a[0].localeCompare(b[0]),
						)) {
							if (!v || seen.has(k) || k === "status-line" || k === "run-state") continue;
							pills.push(v);
						}
						if (pills.length) {
							const line2Segs: Seg[] = pills.map((pill, i) => ({
						bg: pillBgs[i % pillBgs.length],
						fg: "text" as ThemeColor,
						text: pill,
					}));
						lines.push(truncateToWidth(renderPowerline(line2Segs), width));
						}
					}
					return lines;
				},
			};
		});
	};

	pi.registerCommand("footer", {
		description: "Toggle the powerline footer (default on; PI_FOOTER_ASCII=1 for no Nerd Font)",
		handler: async (_args, ctx) => {
			enabled = !enabled;
			if (!enabled) {
				ctx.ui.setFooter(undefined);
				ctx.ui.notify("Default footer restored", "info");
				return;
			}
			enableFooter(ctx);
			ctx.ui.notify("Powerline footer enabled (/footer to toggle)", "info");
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		if (enabled) enableFooter(ctx);
	});
}
