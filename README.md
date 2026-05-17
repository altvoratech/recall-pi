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

Setup do Pi focado em **integração com recall MCP**, **orquestração de subagentes** e extensões de produtividade. Fica em cima do [`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) sem fork: só configuração e extensões.

Pode ser usado em dois modos:
- **project-local** (rodando dentro do repo), ou
- **package global do Pi** (via `~/.pi/agent/settings.json` em `packages`).

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
├── .pi/
│   ├── extensions/       # TypeScript Pi extensions (single source of truth)
│   ├── prompts/          # slash command templates
│   ├── scripts/          # helper scripts (models sync, setup notes)
│   └── settings.json     # project-local Pi settings
├── models.template.json  # template for ~/.pi/agent/models.json (kilo provider)
└── GLOBAL_RULES.md       # operator rules injected at prompt tail
```

## Extension pack (resumo)

Principais extensões em `.pi/extensions/`:
- `permission-gate.ts` — intercepta comandos bash sensíveis e abre modal de confirmação/sudo
- `recall-tools/` — integração com recall via MCP local (`recall_mcp_load`, `recall_save`)
- `jina-index/` — indexação e busca semântica local de docs via Jina API
- `compaction-snapshot/` — persiste snapshots de compaction no disco
- `tool-discovery/` — índice BM25 de tools + `search_tool`
- `command-bridge/` — expõe comandos de `~/.claude/`, `~/.codex/`, `~/.opencode/` no Pi
- `subagent-env/` + `subagent-policy.ts` — ambiente e roteamento de subagentes
- `status-line.ts` / `working-indicator.ts` / `custom-footer.ts` — UX e status da UI

Comportamento de memória/identidade:
- Recall lê configuração global (`~/.pi/agent/settings.json`) e env vars.
- Injeção de contexto usa busca global (cross-project) quando aplicável.
- Identidade do projeto vem de `.recall/project.json` no cwd.

Artefatos locais importantes (não versionar):
- `.firecrawl/`
- `.pi/extensions/recall-tools/logs/`
- `.pi/extensions/jina-index/_indexes/`
- `SESSION-NOTES-*.md`
- `RECALL_CORE_ANALYSIS.md`

Segurança:
- Nunca commitar tokens/senhas/chaves.
- `recall-tools` sobrescreve `logs/latest.json` e evita histórico por prompt.
- Preserve `.recall/` no projeto (UUID/identidade usada no recall).

Observabilidade de orquestração:
- Eventos críticos são gravados em `logs/system-log.jsonl`.
- `source` agora é segmentado:
  - `subagent-policy` (lexical/injeção)
  - `subagent:tool` (início/fim do tool)
  - `subagent:runner` (spawn e resultado do processo)
  - `subagent:usage` (prova de uso real de subagent)
- Rotação automática habilitada: `5 MB` por arquivo, mantendo até `5` históricos (`logs/system-log.1.jsonl` ... `.5`).
- Para acompanhar em tempo real:
  ```bash
  tail -f logs/system-log.jsonl
  ```
- Para ver só uso real de subagent:
  ```bash
  grep '"source":"subagent:usage"' logs/system-log.jsonl | tail -n 20
  ```

## Install

1. Clone e instale:
   ```bash
   git clone <repo-url> ~/recall-pi
   cd ~/recall-pi && npm install
   ```

2. O projeto já segue o padrão `.pi/`:
   - extensões em `.pi/extensions/`
   - prompt templates em `.pi/prompts/`
   - scripts em `.pi/scripts/`

3. Escolha o modo de uso:
   - **Project-local:** rode o Pi dentro do repo.
   - **Package global:** adicione o caminho do repo em `~/.pi/agent/settings.json` → `packages`.
     - helper automático:
       ```bash
       npm run setup-pi-settings
       ```

4. Rode `/reload` no Pi.

## Test

```bash
npm test          # unit tests (lexical heuristic, settings parser, permission predicates)
npm run typecheck # tsc strict
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

## Provider diagnostics

- `/provider-doctor` — mostra status do provider/model atual e faz probes best-effort de:
  - Together (built-in provider do Pi 0.74.1)
  - OpenRouter env (`OPENROUTER_API_KEY`)

Dica: se Together estiver "MISSING", rode `/login` e selecione Together.

## Models & providers

Os subagentes usam modelos de dois providers. Ambos precisam estar disponíveis:

### Kilo (custom — requer `models.json`)

Copie `models.template.json` para `~/.pi/agent/models.json` e preencha `apiKey`:

```bash
cp models.template.json ~/.pi/agent/models.json
# Edite ~/.pi/agent/models.json e defina apiKey
```

Modelos registrados:
| id | usado por |
|---|---|
| `gpt-4.1-mini` | scout |
| `gpt-5-mini` | worker |
| `qwen/qwen3.6-plus` | debugger |

### OpenRouter (built-in — requer `OPENROUTER_API_KEY`)

Provider built-in do Pi. Modelos free não consomem créditos:

| id | usado por |
|---|---|
| `deepseek/deepseek-v4-flash:free` | reviewer |

### OpenAI Codex (built-in — requer `/login`)

Provider built-in do Pi. Autentique via OAuth:

```
/login
# Selecione openai-codex e siga o fluxo OAuth no browser
```

Modelos usados:
| id | usado por |
|---|---|
| `gpt-5.4` | planner |

### Nota sobre subagentes

A política de auto-delegação usa **heurística léxica** (zero tokens, zero latência).
As chaves antigas `subagentPolicy.classifierProvider` / `classifierModel` / `classifierTimeoutMs` em `.pi/settings.json` não são mais necessárias e podem ser removidas.

Os modelos dos subagentes são definidos no frontmatter de cada `.md` em `.pi/extensions/subagent-env/agents/`. Para trocar o modelo de um agente, edite o campo `model:` no arquivo correspondente e garanta que o provider/modelo existe no `models.json`.

## Roadmap

> **Architectural turn (post-V1):** recall-pi is being repositioned from "MCP client like any other" to **privileged client embedded inside recall-core**. External clients (Claude Code, opencode, etc) keep talking to the MCP server. recall-pi imports `core.*` directly — no MCP roundtrip, no public API surface limits. This is the product moat.

### V1 — current (standalone repo, MCP client)
- Extensions packaged in dedicated repo
- Subagent orchestration (scout / planner / worker / reviewer)
- Lexical heuristic for auto-delegation (zero tokens)
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
