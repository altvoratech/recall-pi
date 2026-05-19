/**
 * trace-recorder — helpers puros (sem IO): extração de args/artefatos,
 * sumarização, agregação de tokens e detecção de fase.
 */

import type { SessionEntryLike, ToolEventLike } from "./types.ts";

export function nowIso(): string {
	return new Date().toISOString();
}

/**
 * Obtém os args da tool call, tentando `input` depois `args`.
 */
export function getToolArgs(event: ToolEventLike): Record<string, unknown> {
	return (event.input as Record<string, unknown>) ??
		(event.args as Record<string, unknown>) ??
		{};
}

/**
 * Extrai referências a arquivos dos argumentos de tool calls.
 * Cobre: read, write, edit, bash, grep, find, ls.
 */
export function pullArtifactRefs(event: ToolEventLike): string[] {
	const refs: string[] = [];
	const input = getToolArgs(event);

	// Caminhos diretos comuns em tools do pi
	const pathFields = ["path", "filePath", "file_path", "targetPath", "target_path"];
	for (const field of pathFields) {
		const v = input[field];
		if (typeof v === "string" && v.trim().length > 0) {
			refs.push(v.trim());
		}
	}

	// edits[] contém path + mudanças
	const edits = input.edits;
	if (Array.isArray(edits)) {
		for (const edit of edits) {
			if (edit?.path && typeof edit.path === "string") refs.push(edit.path);
		}
	}

	// bash / dir / tree commands — extrai paths
	const command = input.command;
	if (typeof command === "string") {
		// Evita flags: /s /b /q etc (são flags do dir no Windows, não paths)
		const pathRe = /(?:^|\s)(?![\/][a-zA-Z]\b)(\.{0,2}(?:\/[\w.\-]+)+\.[a-z]{1,6}|[\w.\-]+\.[a-z]{1,6})(?:\s|$)/gi;
		let m: RegExpExecArray | null;
		while ((m = pathRe.exec(command)) !== null) {
			const candidate = m[1];
			// Filtra falsos positivos: flags Windows (/s /b) e opções Unix (-r -l)
			if (/^[\/\-][a-zA-Z]$/.test(candidate)) continue;
			refs.push(candidate);
		}
	}

	return [...new Set(refs.filter((r) => r.length > 0))];
}

/**
 * Resume args da tool call para exibição (máx 80 chars).
 */
export function summarizeToolArgs(toolName: string, args: Record<string, unknown>): string {
	if (!args || Object.keys(args).length === 0) return "";
	switch (toolName) {
		case "bash": {
			const cmd = String(args.command ?? "");
			return cmd.length > 60 ? cmd.slice(0, 60) + "..." : cmd;
		}
		case "read":
		case "write":
		case "edit": {
			const p = String(args.path ?? args.filePath ?? args.file_path ?? "");
			return p.length > 50 ? "..." + p.slice(-47) : p;
		}
		case "grep": {
			const pat = String(args.pattern ?? "");
			return pat.length > 40 ? pat.slice(0, 40) + "..." : pat;
		}
		case "find":
		case "ls": {
			const p = String(args.path ?? ".");
			return p.length > 50 ? "..." + p.slice(-47) : p;
		}
		case "subagent": {
			const agent = String(args.agent ?? (args.chain as any)?.[0]?.agent ?? "");
			const mode = args.chain ? "chain" : args.tasks ? "parallel" : "single";
			return `${mode}:${agent}`;
		}
		default:
			return "";
	}
}

/**
 * Agrega total de tokens percorrendo mensagens do assistente.
 */
export function usageTotals(entries: SessionEntryLike[]): {
	input_tokens: number;
	output_tokens: number;
	total_tokens: number;
} {
	let input = 0;
	let output = 0;
	for (const entry of entries) {
		if (entry.type !== "message" || entry.message?.role !== "assistant") continue;
		const usage = entry.message.usage ?? {};
		input += Number(usage.input ?? 0);
		output += Number(usage.output ?? 0);
	}
	return {
		input_tokens: input,
		output_tokens: output,
		total_tokens: input + output,
	};
}

/**
 * Detecta se o prompt indica uma execução de subagente.
 */
export function detectPhase(prompt: string): "main" | "subagent" {
	const trimmed = prompt.trim();
	if (trimmed.startsWith("Task:") || trimmed.startsWith("Task: ")) {
		return "subagent";
	}
	if (trimmed.includes("[AUTO-DELEGATION ROUTER]")) {
		return "subagent";
	}
	return "main";
}
