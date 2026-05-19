# Extensions

Coleção de extensões do Pi usadas por `recall-pi`.

## Visão geral

- `permission-gate.ts` — modal para bash sensível/privilegiado; bloqueio de `write`/`edit` em `.recall` e `.git/`; comando `/abort`
- `protected-paths.ts` — confirmação para alterações em paths sensíveis (`.env`, `node_modules/`, configs do Pi)
- `recall-tools/` — tools `recall_mcp_load` e `recall_save`
- `jina-index/` — indexação/busca local de docs
- `compaction/` — domínio consolidado: `custom.ts` (summary cumulativo via LLM em `session_before_compact`), `snapshot.ts` (persiste snapshot em `session_compact`), `trigger.ts` (comando manual `/trigger-compact`)
- `tool-discovery/` — `search_tool` + ativação on-demand sem inflar o system prompt
- `command-bridge/` — expõe slash commands externos no Pi
- `subagent-env/` — subsistema de subagentes: runner/timeout/HUD (`index.ts`), `policy.ts` (heurística léxica de delegação, antes solta), agents em `subagent-env/agents/*.md`
- `trace-recorder/` — tracing de runs em `.pi/harness/runs/` (`index.ts` + `paths.ts`/`helpers.ts`/`writer.ts`/`types.ts`)
- `session-digest/` — observabilidade por turns + digest manual + injeção controlada; histórico por sessão, contador operacional desde o último checkpoint, status persistente e comando `/session-digest`
- `status-line.ts`, `working-indicator.ts`, `custom-footer.ts` — UX da TUI
- `system-rules.ts` — injeta `GLOBAL_RULES.md`

## Convenção: diretório vs arquivo solto

Regra objetiva (encerra o caso-a-caso):

> **Diretório** (`nome/index.ts` + módulos) **só quando** pelo menos um:
> 1. split real em múltiplos `.ts` por concern (ex: `trace-recorder/`, `session-digest/`);
> 2. carrega asset não-`.ts` (ex: `recall-tools/` com `recall_mcp_client.py`);
> 3. é um **domínio** com peças co-registradas (ex: `compaction/`, `subagent-env/`).
>
> **Arquivo solto** (`nome.ts`) para todo o resto: extensão pequena,
> single-concern. Embrulhar isso num diretório só adiciona boilerplate.

O Pi auto-descobre tanto `*.ts` solto quanto `dir/index.ts` — flat é
idiomático para o caso simples; diretório é para complexidade real.

Soltas mantidas de propósito (single-concern, não viram diretório):
`permission-gate.ts`, `protected-paths.ts`, `system-rules.ts`,
`image-generation.ts`, `status-line.ts`, `working-indicator.ts`,
`custom-footer.ts`, `notify.ts`, `confirm-destructive.ts`.

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

### Subagent Policy

A `policy.ts` implementa heurística léxica de delegação automática:

- **Tiers**: `skip` (small talk), `inject` (injeta policy no system prompt), `auto` (força delegação + bloqueia mutações)
- **Bloqueio**: quando tier=auto, `write`/`edit`/bash mutativo são bloqueados no main — só o worker pode executar
- **Default**: ON (policy ativa)
- **Toggle**: `/subagent-policy off` desliga para a sessão atual, `/subagent-policy on` religa
- **Status no footer**: `pol:on` ou `pol:off`

Desligada quando o overhead de delegação não compensa (tasks simples, iteração rápida).

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

## Session digest (fases 1 e 2)

- observa `turn_end` para manter um contador confiável de turns por sessão
- o pill do footer mostra turns operacionais desde o último checkpoint útil (`refresh`/`compact`), enquanto o total histórico fica disponível em `status`
- persiste metadata em custom entries (`session-digest-state`) para sobreviver a reload/resume/tree navigation
- exibe status persistente via `ctx.ui.setStatus("session-digest", ...)`
- lê configuração merged de `sessionDigest` em `.pi/settings.json` / `~/.pi/agent/settings.json`
- expõe `/session-digest` com `refresh`, `status`, `show` e `inject`
- `inject` arma o `latest.md` para o próximo turn apenas, sem auto-injeção permanente
- grava artefatos em `.pi/harness/digests/<session-id>/latest.md` + `state.json`
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
