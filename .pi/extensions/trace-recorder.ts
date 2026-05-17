/**
 * trace-recorder — append-only run tracing with correlation ids.
 *
 * Camada de agregação sobre o system-log existente. NÃO substitui o
 * system-log — complementa com sumários estruturados por run, rastreamento
 * de artefatos, e índice global.
 *
 * Escreve:
 * - .pi/harness/runs/<run_id>/events.jsonl  (eventos do run)
 * - .pi/harness/runs/<run_id>/trace.json    (sumário completo)
 * - .pi/harness/runs/<run_id>/trace-<phase>.json (sumário por fase)
 * - .pi/harness/runs/index.jsonl            (índice global de runs)
 *
 * Fases: main (agente principal), subagent (execução de subagente)
 *
 * Integração com recall_save:
 * - artifact_refs expõe quais arquivos foram tocados no run,
 *   podendo ser usado para auto-preencher addFiles.
 * - Sub-runs de subagentes são detectados via tool call "subagent"
 *   no processo pai e registrados no índice global.
 */

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { appendSystemLog, getSystemLogPath } from "./shared/system-log.ts";

// ── Types ────────────────────────────────────────────────────────────

interface ToolSpan {
  tool_call_id: string;
  tool_name: string;
  started_at: string;
  ended_at: string;
  args_summary?: string;
}

interface ActiveRun {
  runId: string;
  phase: "main" | "subagent";
  subagentName?: string;
  subagentModel?: string;
  startedAt: string;
  toolSpans: Map<string, ToolSpan>;
  artifactRefs: Set<string>;
  modelId: string;
  sessionId: string;
}

interface SessionEntryLike {
  type?: string;
  customType?: string;
  data?: Record<string, unknown>;
  message?: {
    role?: string;
    usage?: { input?: number; output?: number; totalTokens?: number };
  };
}

interface ToolEventLike {
  toolCallId: string;
  toolName: string;
  input?: Record<string, unknown>;
  args?: Record<string, unknown>;
  isError?: boolean;
  details?: unknown;
}

// ── Constants ────────────────────────────────────────────────────────

const EXT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(EXT_DIR, "..", "..");

function getRunsRoot(): string {
	return join(PACKAGE_ROOT, ".pi", "harness", "runs");
}

function getIndexPath(): string { return join(getRunsRoot(), "index.jsonl"); }

const SCHEMA_VERSION = "1.0.0";
const CONTRACT_VERSION = "1.0.0";

// ── Helpers ──────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Obtém os args da tool call, tentando `input` depois `args`.
 */
function getToolArgs(event: ToolEventLike): Record<string, unknown> {
  return (event.input as Record<string, unknown>) ??
         (event.args as Record<string, unknown>) ??
         {};
}

/**
 * Extrai referências a arquivos dos argumentos de tool calls.
 * Cobre: read, write, edit, bash, grep, find, ls.
 */
function pullArtifactRefs(event: ToolEventLike): string[] {
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
function summarizeToolArgs(toolName: string, args: Record<string, unknown>): string {
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
      const agent = String(args.agent ?? args.chain?.[0]?.agent ?? "");
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
function usageTotals(entries: SessionEntryLike[]): {
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
function detectPhase(prompt: string): "main" | "subagent" {
  const trimmed = prompt.trim();
  if (trimmed.startsWith("Task:") || trimmed.startsWith("Task: ")) {
    return "subagent";
  }
  if (trimmed.includes("[AUTO-DELEGATION ROUTER]")) {
    return "subagent";
  }
  return "main";
}

async function ensureRunDir(runId: string): Promise<string> {
  const runDir = join(getRunsRoot(), runId);
  await mkdir(runDir, { recursive: true });
  return runDir;
}

async function appendEvent(
  runId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const runDir = await ensureRunDir(runId);
  await appendFile(
    join(runDir, "events.jsonl"),
    `${JSON.stringify({ timestamp: nowIso(), ...payload })}\n`,
    "utf-8",
  );
}

async function appendIndex(entry: Record<string, unknown>): Promise<void> {
  await mkdir(getRunsRoot(), { recursive: true });
  await appendFile(
    getIndexPath(),
    `${JSON.stringify({ timestamp: nowIso(), ...entry })}\n`,
    "utf-8",
  );
}

// ── Extension ────────────────────────────────────────────────────────

export default function traceRecorder(pi: ExtensionAPI) {
  let activeRun: ActiveRun | null = null;
  let lastPrompt = "";

  // ── before_agent_start: captura o prompt ────────────────────────
  pi.on("before_agent_start", async (event: any) => {
    lastPrompt = event.prompt ?? "";
  });

  // ── agent_start: inicia um novo run ─────────────────────────────
  pi.on("agent_start", async (_event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    const startedAt = nowIso();
    const phase = detectPhase(lastPrompt);
    const modelId = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "unknown";

    const runId = phase === "subagent"
      ? `sub-${sessionId.slice(0, 8)}-${Date.now()}`
      : `main-${sessionId.slice(0, 8)}-${Date.now()}`;

    activeRun = {
      runId,
      phase,
      startedAt,
      toolSpans: new Map(),
      artifactRefs: new Set(),
      modelId,
      sessionId,
    };

    appendSystemLog("trace-recorder", "run_start", {
      runId,
      phase,
      modelId,
      sessionId,
      promptPreview: lastPrompt.slice(0, 200),
      logPath: getSystemLogPath(),
    });

    await appendEvent(runId, {
      type: "run_start",
      run_id: runId,
      phase,
      model_id: modelId,
      session_id: sessionId,
    });
  });

  // ── tool_execution_start: registra início de tool span ──────────
  pi.on("tool_execution_start", async (event: any) => {
    if (!activeRun) return;

    const args = getToolArgs(event);
    const span: ToolSpan = {
      tool_call_id: event.toolCallId,
      tool_name: event.toolName,
      started_at: nowIso(),
      ended_at: nowIso(),
      args_summary: summarizeToolArgs(event.toolName, args),
    };
    activeRun.toolSpans.set(event.toolCallId, span);

    await appendEvent(activeRun.runId, {
      type: "tool_start",
      run_id: activeRun.runId,
      tool_call_id: event.toolCallId,
      tool_name: event.toolName,
      args_summary: span.args_summary,
    });
  });

  // ── tool_result / tool_execution_end: finaliza tool span ────────
  const seenToolEnds = new Set<string>();

  const handleToolEnd = async (event: ToolEventLike) => {
    if (!activeRun) return;

    // Deduplica: ambos hooks podem disparar
    const dedupKey = `${event.toolCallId}:end`;
    if (seenToolEnds.has(dedupKey)) return;
    seenToolEnds.add(dedupKey);

    const span = activeRun.toolSpans.get(event.toolCallId);
    if (span) {
      span.ended_at = nowIso();
    }

    // Extrai artefatos
    for (const ref of pullArtifactRefs(event)) {
      activeRun.artifactRefs.add(ref);
    }

    // ── Sub-run detection: subagent tool call no processo pai ───
    if (event.toolName === "subagent") {
      const details = (event as any).details as Record<string, unknown> | undefined;
      const results = details?.results as Array<Record<string, unknown>> | undefined;
      if (results && results.length > 0) {
        for (const r of results) {
          const subAgent = String(r.agent ?? "unknown");
          const subModel = String(r.model ?? "unknown");
          const subExitCode = Number(r.exitCode ?? -1);
          const subStopReason = String(r.stopReason ?? "unknown");
          const subUsage = (r.usage ?? {}) as Record<string, number>;
          const subDuration = Number(r.durationMs ?? 0);

          await appendIndex({
            run_id: `${activeRun.runId}-sub-${subAgent}`,
            phase: "subagent",
            subagent_name: subAgent,
            model_id: subModel,
            exit_code: subExitCode,
            stop_reason: subStopReason,
            input_tokens: subUsage.input ?? 0,
            output_tokens: subUsage.output ?? 0,
            total_tokens: (subUsage.input ?? 0) + (subUsage.output ?? 0),
            tool_span_count: 0,
            artifact_ref_count: 0,
            duration_ms: subDuration,
            parent_run_id: activeRun.runId,
          });

          appendSystemLog("trace-recorder", "sub_run", {
            parentRunId: activeRun.runId,
            subAgent,
            subModel,
            subExitCode,
            subStopReason,
            subDuration,
            subInputTokens: subUsage.input ?? 0,
            subOutputTokens: subUsage.output ?? 0,
          });
        }
      }
    }

    await appendEvent(activeRun.runId, {
      type: "tool_result",
      run_id: activeRun.runId,
      tool_call_id: event.toolCallId,
      tool_name: event.toolName,
      is_error: event.isError ?? false,
    });
  };

  pi.on("tool_result", async (event: any) => {
    await handleToolEnd(event as ToolEventLike);
  });

  try {
    pi.on("tool_execution_end" as any, async (event: any) => {
      await handleToolEnd(event as ToolEventLike);
    });
  } catch {
    // hook pode não existir em todas as versões do pi
  }

  // ── agent_end: gera sumário e fecha o run ───────────────────────
  pi.on("agent_end", async (_event, ctx) => {
    if (!activeRun) return;

    const endedAt = nowIso();
    const durationMs = Math.max(
      0,
      Date.parse(endedAt) - Date.parse(activeRun.startedAt),
    );

    // getEntries pode falhar se ctx foi stale após session switch
    let usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
    try {
      usage = usageTotals(
        ctx.sessionManager.getEntries() as SessionEntryLike[],
      );
    } catch {
      // ctx stale após newSession/fork/switchSession — usa zero
    }
    const toolSpans = Array.from(activeRun.toolSpans.values());
    const artifactRefs = Array.from(activeRun.artifactRefs);

    const spansWithDuration = toolSpans.map((s) => ({
      ...s,
      duration_ms: Math.max(
        0,
        Date.parse(s.ended_at) - Date.parse(s.started_at),
      ),
    }));

    const summary = {
      schema_version: SCHEMA_VERSION,
      contract_version: CONTRACT_VERSION,
      run_id: activeRun.runId,
      phase: activeRun.phase,
      subagent_name: activeRun.subagentName ?? null,
      subagent_model: activeRun.subagentModel ?? activeRun.modelId,
      model_id: activeRun.modelId,
      session_id: activeRun.sessionId,
      started_at: activeRun.startedAt,
      ended_at: endedAt,
      duration_ms: durationMs,
      tool_spans: spansWithDuration,
      tool_span_count: toolSpans.length,
      artifact_refs: artifactRefs,
      artifact_ref_count: artifactRefs.length,
      usage,
    };

    const runDir = await ensureRunDir(activeRun.runId);

    await writeFile(
      join(runDir, "trace.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf-8",
    );

    await writeFile(
      join(runDir, `trace-${activeRun.phase}.json`),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf-8",
    );

    await appendIndex({
      run_id: activeRun.runId,
      phase: activeRun.phase,
      subagent_name: activeRun.subagentName ?? null,
      model_id: activeRun.modelId,
      started_at: activeRun.startedAt,
      ended_at: endedAt,
      duration_ms: durationMs,
      tool_span_count: toolSpans.length,
      artifact_ref_count: artifactRefs.length,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      total_tokens: usage.total_tokens,
    });

    await appendEvent(activeRun.runId, {
      type: "run_end",
      run_id: activeRun.runId,
      phase: activeRun.phase,
      tool_span_count: toolSpans.length,
      artifact_ref_count: artifactRefs.length,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      total_tokens: usage.total_tokens,
      duration_ms: durationMs,
    });

    appendSystemLog("trace-recorder", "run_end", {
      runId: activeRun.runId,
      phase: activeRun.phase,
      subagentName: activeRun.subagentName,
      modelId: activeRun.modelId,
      durationMs,
      toolSpanCount: toolSpans.length,
      artifactRefCount: artifactRefs.length,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      totalTokens: usage.total_tokens,
      logPath: getSystemLogPath(),
    });

    try {
      pi.appendEntry("harness-run-trace", summary);
    } catch {
      // pi.appendEntry pode falhar se pi ficou stale
    }

    activeRun = null;
  });

  // ── Comando: /trace-last ────────────────────────────────────────
  pi.registerCommand("trace-last", {
    description: "Mostra o sumário do último run registrado pelo trace-recorder",
    handler: async (_args: string, ctx: any) => {
      const entries = ctx.sessionManager.getEntries() as SessionEntryLike[];
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        if (
          entry.type === "custom" &&
          entry.customType === "harness-run-trace"
        ) {
          const data = entry.data as Record<string, unknown> | undefined;
          if (!data) continue;

          const u = (data.usage ?? {}) as Record<string, number>;

          const lines = [
            `Last trace: phase=${data.phase ?? "unknown"}`,
            `run_id: ${data.run_id ?? "?"}`,
            `model: ${data.model_id ?? data.subagent_model ?? "unknown"}`,
            `duration: ${data.duration_ms ?? 0}ms`,
            `tokens: ↑${u.input_tokens ?? 0} ↓${u.output_tokens ?? 0}`,
            `tool spans: ${data.tool_span_count ?? 0}`,
            `artifacts: ${data.artifact_ref_count ?? 0}`,
          ];

          if (data.subagent_name) {
            lines.push(`subagent: ${data.subagent_name}`);
          }

          const artifacts = data.artifact_refs as string[] | undefined;
          if (artifacts && artifacts.length > 0) {
            lines.push(`files: ${artifacts.slice(0, 10).join(", ")}`);
            if (artifacts.length > 10) lines.push(`  ... +${artifacts.length - 10} more`);
          }

          const msg = lines.join("\n");
          if (ctx.hasUI) {
            ctx.ui.notify(msg, "info");
          } else {
            pi.sendMessage({
              customType: "trace-last",
              content: msg,
              display: true,
            });
          }
          return;
        }
      }
      if (ctx.hasUI) {
        ctx.ui.notify("No trace recorded yet.", "warning");
      }
    },
  });

  // ── Comando: /trace-list ────────────────────────────────────────
  pi.registerCommand("trace-list", {
    description: "Lista os últimos runs do índice global (últimos 15)",
    handler: async (_args: string, ctx: any) => {
      try {
        const raw = await readFile(getIndexPath(), "utf-8");
        const lines = raw.trim().split("\n").filter(Boolean);
        const recent = lines.slice(-15);

        if (recent.length === 0) {
          if (ctx.hasUI) ctx.ui.notify("No runs in index.", "warning");
          return;
        }

        const parsed = recent
          .map((l) => {
            try { return JSON.parse(l); } catch { return null; }
          })
          .filter(Boolean);

        const output = parsed.map((r: any, i: number) => {
          const phaseIcon = r.phase === "subagent" ? "🤖" : "🧠";
          const name = r.subagent_name ? ` ${r.subagent_name}` : "";
          const dur = r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : "?";
          return `${i + 1}. ${phaseIcon}${name} | ${r.phase} | ${dur} | ↑${r.input_tokens ?? 0} ↓${r.output_tokens ?? 0} | ${r.tool_span_count ?? 0} tools`;
        }).join("\n");

        const header = `Recent runs (${parsed.length}):\n${output}`;
        if (ctx.hasUI) {
          ctx.ui.notify(header, "info");
        } else {
          pi.sendMessage({
            customType: "trace-list",
            content: header,
            display: true,
          });
        }
      } catch {
        if (ctx.hasUI) ctx.ui.notify("No trace index found.", "warning");
      }
    },
  });

  // ── Log de carregamento ─────────────────────────────────────────
  appendSystemLog("trace-recorder", "loaded", {
    packageRoot: PACKAGE_ROOT,
    runsRoot: getRunsRoot(),
    indexPath: getIndexPath(),
    logPath: getSystemLogPath(),
  });
}
