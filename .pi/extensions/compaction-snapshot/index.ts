/**
 * Compaction Snapshot Extension
 *
 * Persiste o summary cumulativo produzido pelo custom-compaction.ts em disco,
 * com upsert por sessão. Cache LOCAL EFÊMERO — vida da sessão.
 *
 * Não sincroniza pro recall-core. Decisões duradouras vão pelo canal separado
 * recall_save (manual/curado). Embedar conversa inteira no banco gera ruído
 * (lição do experimento Jina) — este cache existe pra servir queries quentes
 * via subagent curator durante a sessão ativa, e basta.
 *
 * Layout em disco:
 *   ~/recall-pi/compact-session/<session-id>/
 *     ├── snapshot.md      ← markdown do summary cumulativo (upsert)
 *     └── state.json       ← metadados (compactionCount, tokensBefore, projectId)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

const EXTENSION_DIR = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_ROOT = path.resolve(EXTENSION_DIR, '..', '..', 'compact-session');

interface SnapshotState {
  schemaVersion: 1;
  sessionId: string;
  projectId?: string;
  startedAt: string;
  updatedAt: string;
  compactionCount: number;
  tokensBefore?: number;
}

function snapshotDir(sessionId: string): string {
  return path.join(SNAPSHOT_ROOT, sessionId);
}

function snapshotPath(sessionId: string): string {
  return path.join(snapshotDir(sessionId), 'snapshot.md');
}

function statePath(sessionId: string): string {
  return path.join(snapshotDir(sessionId), 'state.json');
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function readProjectId(cwd: string): string | undefined {
  const file = path.join(cwd, '.recall', 'project.json');
  const data = readJson<{ id?: string }>(file);
  return typeof data?.id === 'string' ? data.id : undefined;
}

function readState(sessionId: string): SnapshotState | null {
  return readJson<SnapshotState>(statePath(sessionId));
}

function writeStateFile(sessionId: string, state: SnapshotState): void {
  fs.writeFileSync(statePath(sessionId), JSON.stringify(state, null, 2), 'utf8');
}

function writeSnapshot(
  sessionId: string,
  summary: string,
  opts: { projectId?: string; tokensBefore?: number }
): SnapshotState {
  const dir = snapshotDir(sessionId);
  fs.mkdirSync(dir, { recursive: true });

  const existing = readState(sessionId);
  const now = new Date().toISOString();
  const state: SnapshotState = {
    schemaVersion: 1,
    sessionId,
    projectId: opts.projectId ?? existing?.projectId,
    startedAt: existing?.startedAt ?? now,
    updatedAt: now,
    compactionCount: (existing?.compactionCount ?? 0) + 1,
    tokensBefore: opts.tokensBefore,
  };

  fs.writeFileSync(snapshotPath(sessionId), summary, 'utf8');
  writeStateFile(sessionId, state);
  return state;
}

function resolveSessionId(ctx: any): string {
  const fromManager = ctx?.sessionManager?.getHeader?.()?.id;
  if (typeof fromManager === 'string' && fromManager) return fromManager;
  const fromCtx = ctx?.sessionId;
  if (typeof fromCtx === 'string' && fromCtx) return fromCtx;
  return `unknown-${Date.now()}`;
}

export default function (pi: ExtensionAPI) {
  pi.on('session_compact', async (event, ctx) => {
    const entry: any = (event as any).compactionEntry;
    const summary: string | undefined = entry?.summary;
    if (!summary || typeof summary !== 'string') return;

    const sessionId = resolveSessionId(ctx);
    try {
      const state = writeSnapshot(sessionId, summary, {
        projectId: readProjectId((ctx as any).cwd ?? process.cwd()),
        tokensBefore: typeof entry?.tokensBefore === 'number' ? entry.tokensBefore : undefined,
      });
      if ((ctx as any).hasUI) {
        (ctx as any).ui.notify(
          `Snapshot persisted (compaction #${state.compactionCount}) → compact-session/${sessionId}/`,
          'info'
        );
      }
    } catch (err) {
      if ((ctx as any).hasUI) {
        (ctx as any).ui.notify(
          `Snapshot write failed: ${err instanceof Error ? err.message : String(err)}`,
          'error'
        );
      }
    }
  });
}
