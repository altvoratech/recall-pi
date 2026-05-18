# Extensions

Coleção de extensões do Pi usadas por `recall-pi`.

## Visão geral

- `permission-gate.ts` — modal para bash sensível/privilegiado; bloqueio de `write`/`edit` em `.recall` e `.git/`; comando `/abort`
- `protected-paths.ts` — confirmação para alterações em paths sensíveis (`.env`, `node_modules/`, configs do Pi)
- `recall-tools/` — tools `recall_mcp_load` e `recall_save`
- `jina-index/` — indexação/busca local de docs
- `custom-compaction.ts` — summary cumulativo via LLM no hook `session_before_compact`
- `compaction-snapshot/` — persiste snapshot do summary em `session_compact`
- `trigger-compact.ts` — comando manual `/trigger-compact`
- `tool-discovery/` — `search_tool` + ativação on-demand sem inflar o system prompt
- `command-bridge/` — expõe slash commands externos no Pi
- `subagent-env/` — runner de subagentes, timeout, UI HUD, agents em `subagent-env/agents/*.md`
- `subagent-policy.ts` — heurística léxica para sugerir/delegar subagentes
- `trace-recorder.ts` — tracing de runs em `.pi/harness/runs/`
- `session-digest.ts` — observabilidade por turns; contador por sessão, aviso de sessão longa e status de digest no footer
- `status-line.ts`, `working-indicator.ts`, `custom-footer.ts` — UX da TUI
- `system-rules.ts` — injeta `GLOBAL_RULES.md`

## Recall

A integração de recall usa MCP local e lê configuração de settings/env vars.
A identidade do projeto continua vindo de `.recall/project.json`.

## Skills

As skills do projeto são declaradas no `package.json` via:

```json
"pi": {
  "skills": ["./.agents/skills", "./.pi/skills"]
}
```

Use `/reload` após adicionar ou mover skills.

## Subagents

Modelos atuais:
- `scout` → `kilo/gpt-4.1-mini`
- `planner` → `openai-codex/gpt-5.4`
- `worker` → `kilo/gpt-5-mini`
- `reviewer` → `kilo/deepseek/deepseek-v4-flash`
- `debugger` → `kilo/qwen/qwen3.6-plus`

Comportamento relevante:
- o agente interativo atual é o run `main`
- subagentes aparecem como runs `subagent` separados no harness
- timeout de 180s por subagente
- `/abort` ativa abort lock global do processo
- abort lock bloqueia novas execuções de `subagent`, `bash`, `write`, `edit` até `/reload`

## Trace recorder

Os traces são salvos em:

```text
recall-pi/.pi/harness/runs/
```

A raiz é derivada do próprio pacote da extensão, não do cwd global do binário do Pi.

Os traces distinguem `phase: "main"` e `phase: "subagent"`.

## Compaction

- auto-compaction por threshold é do runtime nativo do Pi
- `trigger-compact.ts` ficou apenas com o comando manual `/trigger-compact`
- isso evita misturar fluxo manual de compaction com o ciclo automático pós-turno

## Session digest (fase 1)

- observa `turn_end` para manter um contador confiável de turns por sessão
- persiste metadata em custom entries (`session-digest-state`) para sobreviver a reload/resume/tree navigation
- exibe status persistente via `ctx.ui.setStatus("session-digest", ...)`
- lê configuração merged de `sessionDigest` em `.pi/settings.json` / `~/.pi/agent/settings.json`
- não gera digest automaticamente e não chama compaction

## Arquivos locais ignorados

- `.firecrawl/`
- `.pi/extensions/recall-tools/logs/`
- `.pi/extensions/jina-index/_indexes/`
- `SESSION-NOTES-*.md`
- `RECALL_CORE_ANALYSIS.md`

## Segurança

- Não versionar tokens, senhas ou logs sensíveis.
- `permission-gate` faz hard block de `.recall`/`.git/` em `write`/`edit`.
- `protected-paths` pede confirmação para outros destinos protegidos.
- `.recall/project.json` deve ser preservado: ele é a identidade do projeto no recall.
