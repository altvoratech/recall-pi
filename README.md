<div align="center">

```
                ██████╗ ███████╗ ██████╗ █████╗ ██╗     ██╗      ██████╗ ██╗
                ██╔══██╗██╔════╝██╔════╝██╔══██╗██║     ██║      ██╔══██╗██║
                ██████╔╝█████╗  ██║     ███████║██║     ██║█████╗██████╔╝██║
                ██╔══██╗██╔══╝  ██║     ██╔══██║██║     ██║╚════╝██╔═══╝ ██║
                ██║  ██║███████╗╚██████╗██║  ██║███████╗███████╗ ██║     ██║
                ╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚══════╝ ╚═╝     ╚═╝

           ░░░░  recall MCP · subagent orchestration · sane defaults  ░░░░
                          ▸ no fork — only extensions on top of pi ◂
```

</div>

# recall-pi

**NÃO USE ESTE REPO COMO SETUP GLOBAL DO PI.**

Este repositório foi feito para ser executado como **projeto** (project-local) e a experiência/contratos assumem esse modo. Usar como global pode causar comportamento inesperado (principalmente em discovery de recursos, resolução de paths e credenciais de providers).

Personal Pi coding-agent setup focused on **recall MCP integration**, **subagent orchestration**, and quality-of-life extensions. Sits on top of upstream [`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) — no fork, only extensions and config.

[![License](https://img.shields.io/badge/license-MIT-58A6FF?style=flat&labelColor=222222)](#license)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&labelColor=222222&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Pi](https://img.shields.io/badge/pi-coding--agent-FF6B6B?style=flat&labelColor=222222)](https://www.npmjs.com/package/@earendil-works/pi-coding-agent)
[![recall-core](https://img.shields.io/badge/recall--core-ecosystem-00D9A3?style=flat&labelColor=222222)](#architecture)

## Architecture

recall-pi is the **terminal-side client** for the recall-core memory ecosystem. The engine (chunking, embedding, hybrid search, persistence) lives in `recall-core`. Pi consumes it through MCP and surfaces memory inline for the operator.

```
┌──────────────────────────────────────────────────────────────────┐
│                       recall-core ecosystem                       │
│                                                                   │
│   ┌────────────┐  ┌────────────┐  ┌────────────────────────┐    │
│   │  PROJECT   │  │  SESSIONS  │  │  DOCS (zread + Jina)   │    │
│   │   layer    │  │   index    │  │  (planned)             │    │
│   └─────┬──────┘  └─────┬──────┘  └──────────┬─────────────┘    │
│         │               │                     │                   │
│         └───────────────┴─────────────────────┘                  │
│                         │                                         │
│                  hybrid_search + rerank                          │
│                         │                                         │
│                ┌────────┴─────────┐                              │
│                │  MCP server      │  (Postgres + pgvector)       │
│                │  /sse endpoint   │                              │
│                └────────┬─────────┘                              │
└─────────────────────────┼────────────────────────────────────────┘
                          │ MCP (HTTP/SSE)
              ┌───────────┼───────────┐
              │           │           │
         ┌────┴────┐ ┌────┴────┐ ┌────┴─────┐
         │ recall  │ │ Claude  │ │ Other    │
         │  -pi    │ │  Code   │ │ clients  │
         │ (this)  │ │ (hooks) │ │          │
         └─────────┘ └─────────┘ └──────────┘
```

**Pi's job:** auto-inject relevant hits on prompt, expose `recall_*` tools to the LLM, run subagents with isolated context that share the same recall backend.

## Structure

```
recall-pi/
├── extensions/        # TypeScript Pi extensions
│   ├── recall-tools/  # recall MCP client (load + save + auto-inject)
│   ├── subagent-env/  # subagent tool (scout/planner/worker/reviewer)
│   ├── subagent-policy.ts  # LLM-classifier delegation policy
│   ├── system-rules.ts     # injects GLOBAL_RULES.md at prompt tail
│   ├── status-line.ts      # custom footer status with subagent counter
│   ├── trigger-compact.ts  # auto-compaction at token threshold
│   ├── custom-compaction.ts# Gemini-based session summarizer
│   ├── custom-footer.ts    # 3-line stats footer
│   ├── permission-gate.ts  # sudo / sensitive command modal
│   ├── protected-paths.ts  # write/edit confirmation on .env, .git, etc
│   ├── confirm-destructive.ts # confirm /new (clear session)
│   ├── notify.ts           # native terminal notification on agent_end
│   └── working-indicator.ts# customizable spinner
├── .pi/
│   └── settings.json  # project-local Pi settings
├── .pi/prompts/       # slash command templates (project-local, recommended by Pi docs)
├── prompts/           # legacy location (kept for now; source-of-truth may move)
└── GLOBAL_RULES.md    # operator rules injected at prompt tail
```

## Install

1. Clone:
   ```bash
   git clone <repo-url> ~/recall-pi
   cd ~/recall-pi/extensions && npm install
   ```

2. O projeto já inclui `.pi/settings.json` e usa o **padrão recomendado do Pi**:
   - extensões em `.pi/extensions/`
   - prompt templates em `.pi/prompts/`
   - regras globais via `systemRules.path` (apontando para `GLOBAL_RULES.md`)

3. NÃO instale isso como setup global. Use rodando dentro do repo.

4. Reinicie o Pi ou rode `/reload`. 

## Test

```bash
cd extensions
npm test          # unit tests (mocked classifier, settings parser, permission predicates)
npm run typecheck # tsc strict
PI_TEST_LIVE=1 npm test  # includes a live classifier test against the kilo gateway
```

## Image generation (Pi 0.74.1+)

Esta configuração inclui a tool `image_generate` (extensão `image-generation.ts`) para gerar imagens via **OpenRouter**.

### Requisitos

- Defina `OPENROUTER_API_KEY` no ambiente (recomendado):

```bash
export OPENROUTER_API_KEY=...
```

### Uso

- `/image <prompt>` (template) — chama `image_generate` com o modelo default `google/gemini-2.5-flash-image`.
- Tool direta: `image_generate({ model, prompt, count?, size?, inputImageBase64?, inputImageMimeType? })`.

## Models.json (Kilo classifier)

O `subagent-policy` usa um classifier via provider OpenAI-compat (ex.: **kilo gateway**) e precisa que o provider exista em `~/.pi/agent/models.json` **com `apiKey` válido**.

Este repo inclui um template sem secrets:
- `models.template.json`

Para sincronizar o template para o seu Pi global:

```bash
bash scripts/sync-models.sh
```

Depois **edite** `~/.pi/agent/models.json` e preencha:

- `providers.kilo.apiKey`

> Não commite chaves. O template no repo mantém `apiKey` vazio de propósito.

## Provider diagnostics

- `/provider-doctor` — mostra status do provider/model atual e faz probes best-effort de:
  - Together (built-in provider do Pi 0.74.1)
  - OpenRouter env (`OPENROUTER_API_KEY`)

Dica: se Together estiver "MISSING", rode `/login` e selecione Together.

### Nota sobre o classifier de subagentes (HTTP 401 / paid model)

Se aparecer algo como:
`PAID_MODEL_AUTH_REQUIRED` / `You need to sign in to use this model`

Isso significa que o `subagentPolicy.classifierProvider/classifierModel` está apontando para um modelo que exige login/assinatura naquele provider.
A correção é ajustar o classifier para um provider/model com credencial válida (ou fazer login no provider correspondente).
**Subagents auto-delegation (postmortem + fix):**
- Root cause: classifier request used `max_tokens: 4`. The kilo/Azure gateway enforces a minimum output-token budget (>=16) → HTTP 400 → classifier fell back, returning non-`auto` tiers → auto-delegation never triggered.
- Fix: `max_tokens` bumped to **16**.
- Anti-silent-failure: classifier errors are now visible via `ctx.ui.setStatus("subagent-classifier", ...)` (footer pill) + `ctx.ui.notify()` (throttled) + structured stderr in non-UI modes.
- Visibility restored: `custom-footer.ts` renders `footerData.getExtensionStatuses()` and `subagent-env` sets a compact `subagent` status while running.

Validated end-to-end with `PI_TEST_LIVE=1 npm test` (live kilo gateway test passing).

## Roadmap

> **Architectural turn (post-V1):** recall-pi is being repositioned from "MCP client like any other" to **privileged client embedded inside recall-core**. External clients (Claude Code, opencode, etc) keep talking to the MCP server. recall-pi imports `core.*` directly — no MCP roundtrip, no public API surface limits. This is the product moat.

### V1 — current (standalone repo, MCP client)
- Extensions packaged in dedicated repo
- Subagent orchestration (scout / planner / worker / reviewer)
- LLM classifier for auto-delegation (no regex)
- Global rules injected at prompt tail (authoritative over project AGENTS.md)
- Auto-compaction at token threshold + Gemini-based summarizer
- Custom 3-line footer with token/cost/context stats
- Permission gate with sudo password modal
- Protected paths confirmation
- Recall MCP client (**Python subprocess — legacy, will be replaced by direct imports in V2**)

### V2 — integrate into recall-core monorepo
Move recall-pi into `recall-core/clients/pi/` (or equivalent). Pi extensions import `core.retrieval`, `core.embeddings`, `core.project` directly via embedded Python kernel (eval-tool style).

- `recall-tools` calls `core.retrieval.hybrid_search` in-process — no HTTP, no SSE parsing
- Project identity via `core.project.load_project` reused directly (the old `core.project` import — but now legitimate, not a leak)
- Access to **internal APIs** that MCP doesn't expose: rerank tuning, embedding inspection, metrics, raw substrate debug
- **Result:** μs-level latency, full surface area, recall-pi co-evolves with core
- **For external clients:** MCP server stays as the public, stable, abstract contract

### V3+ — full ecosystem alignment
Tracking the broader recall-core roadmap (engine-side). recall-pi gets first access:

- [ ] **Re-ranking** — `core/cross_encoder.py` rerank step after hybrid_search (Pi can tune live)
- [ ] **DOCS layer** — zread + Jina embeddings as a parallel index for static project knowledge
- [ ] **RAW substrate** — raw log/event capture as another retrievable layer
- [ ] **Layer routing** — agent decides which index to query per intent

When core ships those, Pi consumes the new modules via import. Other MCP clients get a subset via new MCP tools (`recall_docs_load`, `recall_raw_search`, etc) — Pi gets the full surface.

### V4 — operator UX polish
- Auto-save proposal on meaningful `agent_end`
- Cross-project hit filter UI (score threshold, project allow/blocklist)
- Save preview before commit (review diff of `SessionDelta` before sending)
- Multi-backend mirroring (Postgres + SQLite parallel save for redundancy)
- Pi as the **official REPL for recall-core development** — debugging, query exploration, embedding inspection

---

## Access tiers (post-V2)

| Capability | recall-pi (internal) | MCP clients (external: Claude Code, opencode, ...) |
|---|---|---|
| `recall_search` / `recall_save` | ✅ direct call | ✅ via MCP |
| `recall_get_schema` | ✅ direct | ✅ via MCP |
| `hybrid_search` tuning (k, weights, filters) | ✅ full control | ❌ frozen behind MCP defaults |
| Embedding inspection / nearest-neighbor debug | ✅ | ❌ |
| Re-rank tuning (cross-encoder live) | ✅ | ❌ |
| Internal metrics, RAW substrate access | ✅ | ❌ |
| Latency | μs (in-process) | ms (HTTP roundtrip) |
| API stability | breaks with core | stable contract |

---

> **Philosophy:** recall-pi is the **power-user seat inside the cockpit**. MCP is the **passenger entrance**. Both have their place — Pi for those building the system, MCP for those consuming it.
