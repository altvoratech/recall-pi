/**
 * Permission Gate Extension
 *
 * Intercepts risky or privileged bash commands and opens a modal:
 * - Executar
 * - Executar com sudo (asks for password)
 * - Cancelar
 */

import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { activateAbortLock, getAbortLockState } from "./shared/abort-lock.ts";

interface GateResult {
	action: "execute" | "sudo" | "cancel";
	password?: string;
}

function shellQuote(value: string): string {
	if (value.length === 0) return "''";
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function stripLeadingSudo(command: string): string {
	return command.replace(/^\s*sudo\b\s*/, "");
}

function isUserScopedSystemd(command: string): boolean {
	return /^\s*systemctl\s+--user\b/i.test(command);
}

function needsPrivilege(command: string): boolean {
	// systemctl --user operates in user space — no root needed
	if (isUserScopedSystemd(command)) return false;

	const patterns = [
		/^\s*sudo\b/i,
		/\brm\s+(-rf?|--recursive)\b/i,
		/\b(chmod|chown)\b.*\b777\b/i,
		/\b(mkfs|fdisk|parted|wipefs|dd)\b/i,
		/\b(apt|apt-get|apt-cache|dpkg|dnf|yum|pacman|zypper)\b/i,
		/\b(systemctl|service|useradd|usermod|groupadd|groupdel|mount|umount)\b/i,
		/\b(tee|install|cp|mv)\b.*\s\/(etc|usr|var)\//i,
	];

	return patterns.some((p) => p.test(command));
}

const BASH_MUTATION_PATTERNS = [
	/\bgit\s+commit\b/i,
	/\bgit\s+push\b/i,
	/\bgit\s+merge\b/i,
	/\bgit\s+rebase\b/i,
	/\brm\s+(-rf?|--recursive)\b/i,
	/\bmv\b/i,
	/\bcp\b/i,
	/\bmkdir\b/i,
	/\bchmod\b/i,
	/\bchown\b/i,
	/\bsed\s+-i\b/i,
	/\bperl\s+-i\b/i,
];

function isMutatingBash(command: string): boolean {
	return BASH_MUTATION_PATTERNS.some((p) => p.test(command));
}

const MUTATING_TOOLS = new Set(["write", "edit"]);

function isProtectedRecallDeletion(command: string): boolean {
	const destructivePatterns = [/\b(rm|rmdir|unlink|shred|wipe|find)\b/i, /-delete\b/i, /\btruncate\b/i];
	return command.includes(".recall") && destructivePatterns.some((p) => p.test(command));
}

function isProtectedWritePath(target: string): boolean {
	return target.includes(".recall") || target.includes(".git/");
}

class SensitiveCommandDialog {
	focused = false;
	private stage: "choice" | "password" = "choice";
	private choiceIndex = 0;
	private password = "";
	private cursor = 0;
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(
		private command: string,
		private theme: Theme,
		private needsSudo: boolean,
		private done: (result: GateResult | undefined) => void,
	) {}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			if (this.stage === "password") {
				this.stage = "choice";
				this.invalidate();
				return;
			}
			this.done(undefined);
			return;
		}

		if (this.stage === "choice") {
			if (matchesKey(data, "left") || matchesKey(data, "up")) {
				this.choiceIndex = (this.choiceIndex + 2) % 3;
				this.invalidate();
				return;
			}
			if (matchesKey(data, "right") || matchesKey(data, "down")) {
				this.choiceIndex = (this.choiceIndex + 1) % 3;
				this.invalidate();
				return;
			}
			if (matchesKey(data, "enter")) {
				if (this.choiceIndex === 0) {
					this.done({ action: "execute" });
					return;
				}
				if (this.choiceIndex === 1) {
					this.stage = "password";
					this.invalidate();
					return;
				}
				if (this.choiceIndex === 2) {
					this.done({ action: "cancel" });
					return;
				}
			}
			return;
		}

		if (this.stage === "password") {
			if (matchesKey(data, "backspace")) {
				if (this.cursor > 0) {
					this.password = this.password.slice(0, this.cursor - 1) + this.password.slice(this.cursor);
					this.cursor--;
				}
				this.invalidate();
				return;
			}

			if (matchesKey(data, "left")) {
				this.cursor = Math.max(0, this.cursor - 1);
				this.invalidate();
				return;
			}

			if (matchesKey(data, "right")) {
				this.cursor = Math.min(this.password.length, this.cursor + 1);
				this.invalidate();
				return;
			}

			if (matchesKey(data, "enter")) {
				if (!this.password.trim()) return;
				this.done({ action: "sudo", password: this.password });
				return;
			}

			if (data.length === 1 && data.charCodeAt(0) >= 32) {
				this.password = this.password.slice(0, this.cursor) + data + this.password.slice(this.cursor);
				this.cursor++;
				this.invalidate();
			}
		}
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

		const th = this.theme;
		const boxWidth = Math.max(56, Math.min(88, width - 4));
		const innerW = Math.max(20, boxWidth - 2);
		const lines: string[] = [];
		const pad = (s: string, len: number) => s + " ".repeat(Math.max(0, len - visibleWidth(s)));
		const row = (content: string) => th.fg("border", "│") + pad(content, innerW) + th.fg("border", "│");
		const wrap = (txt: string) => truncateToWidth(txt, innerW);
		const title = this.needsSudo ? "🔐 Comando com privilégio" : "⚠️ Comando sensível";

		lines.push(th.fg("border", `╭${"─".repeat(innerW)}╮`));
		lines.push(row(` ${th.fg("accent", title)}`));
		lines.push(row(""));
		lines.push(row(` ${th.fg("dim", "Comando:")}`));
		lines.push(row(` ${wrap(this.command)}`));
		lines.push(row(""));

		if (this.stage === "choice") {
			const labels = ["Executar", "Executar com sudo", "Cancelar"];
			const options = labels
				.map((label, idx) =>
					idx === this.choiceIndex
						? th.fg("accent", th.bold(`► [${label}]`))
						: th.fg("muted", `  [${label}] `),
				)
				.join("  ");
			lines.push(row(` ${th.fg("dim", this.needsSudo ? "Esse comando parece precisar de sudo:" : "Escolha:")}`));
			lines.push(row(` ${options}`));
			lines.push(row(""));
			lines.push(row(` ${th.fg("dim", "←/→ ou ↑/↓ • Enter confirma • Esc cancela")}`));
		} else {
			const masked = "•".repeat(this.password.length);
			let display = masked;
			if (this.focused) {
				const before = masked.slice(0, this.cursor);
				const cursorChar = this.cursor < masked.length ? masked[this.cursor] : " ";
				const after = masked.slice(this.cursor + 1);
				display = `${before}${CURSOR_MARKER}\x1b[7m${cursorChar}\x1b[27m${after}`;
			}
			lines.push(row(` ${th.fg("dim", "Digite a senha do sudo:")}`));
			lines.push(row(` ${display}`));
			lines.push(row(""));
			lines.push(row(` ${th.fg("dim", "Enter confirma • Esc volta • Backspace apaga")}`));
		}

		lines.push(th.fg("border", `╰${"─".repeat(innerW)}╯`));
		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	dispose(): void {}
}

async function promptSensitiveCommand(ctx: ExtensionContext, command: string): Promise<GateResult | undefined> {
	if (!ctx.hasUI) return undefined;

	const normalized = stripLeadingSudo(command);
	const needsSudo = needsPrivilege(command);

	return await ctx.ui.custom<GateResult | undefined>(
		(_tui, theme, _keybindings, done) => new SensitiveCommandDialog(normalized, theme, needsSudo, done),
		{ overlay: true },
	);
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("gate-test", {
		description: "Abre o modal de teste da proteção",
		handler: async (_args, ctx) => {
			const result = await promptSensitiveCommand(ctx, "sudo apt-get install dbeaver-ce");
			ctx.ui.notify(result ? `Resultado: ${result.action}` : "Cancelado", result ? "info" : "warning");
		},
	});

	pi.registerCommand("abort", {
		description: "Aborta subagentes em execução e bloqueia mutações até /reload",
		handler: async (args, ctx) => {
			const state = activateAbortLock(args.trim());
			const lines = [
				"Abort lock ativado.",
				`reason: ${state.reason ?? "manual abort"}`,
				`activatedAt: ${state.activatedAt ?? "unknown"}`,
				"Subagentes em execução receberão abort e novas mutações serão bloqueadas até /reload.",
			];
			if (ctx.hasUI) {
				ctx.ui.notify(lines.join("\n"), "warning");
				return;
			}
			pi.sendMessage({
				customType: "abort-lock",
				content: lines.join("\n"),
				display: true,
			});
		},
	});

	pi.on("tool_call", async (event, ctx) => {
		const abortState = getAbortLockState();
		if (abortState.active && (event.toolName === "bash" || MUTATING_TOOLS.has(event.toolName))) {
			return {
				block: true,
				reason: `Abort lock ativo${abortState.reason ? `: ${abortState.reason}` : ""}. Use /reload para limpar.`,
			};
		}
		// Protege write/edit em caminhos sensíveis
		if (MUTATING_TOOLS.has(event.toolName)) {
			const target = String((event.input as any)?.path ?? "");
			if (target && isProtectedWritePath(target)) {
				return { block: true, reason: `Protegido: escrita em "${target}" bloqueada` };
			}
			return undefined;
		}

		if (event.toolName !== "bash") return undefined;

		const command = String(event.input.command ?? "");
		if (isProtectedRecallDeletion(command)) {
			return { block: true, reason: "Protegido: exclusão de .recall bloqueada" };
		}

		// Bash mutante sem privilégio (ex: git commit, mkdir): permite sem modal
		if (isMutatingBash(command) && !needsPrivilege(command)) {
			return undefined;
		}

		if (!needsPrivilege(command)) return undefined;

		if (!ctx.hasUI) {
			return { block: true, reason: "Comando sensível bloqueado (sem UI para confirmação)" };
		}

		const result = await promptSensitiveCommand(ctx, command);
		if (!result || result.action === "cancel") {
			return { block: true, reason: "Bloqueado pelo usuário" };
		}

		if (result.action === "sudo") {
			if (!result.password) {
				return { block: true, reason: "Senha não informada" };
			}

			const baseCommand = stripLeadingSudo(command);
			event.input.command = `printf '%s\\n' ${shellQuote(result.password)} | sudo -S -p '' bash -lc ${shellQuote(baseCommand)}`;
		}

		return undefined;
	});
}
