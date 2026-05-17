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

Setup do Pi focado em **integração com recall MCP**, **subagentes**, **skills project-local** e **guard rails operacionais**. Fica em cima do [`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) sem fork: só configuração, manifesto `pi` no `package.json` e extensões em `.pi/extensions/`.

Pode ser usado em dois modos:
- **project-local** (rodando dentro do repo), ou
- **package global do Pi** (via `packages` em `~/.pi/agent/settings.json`).

[![License](https://img.shields.io/badge/license-MIT-58A6FF?style=flat&labelColor=222222)](#license)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&labelColor=222222&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Pi](https://img.shields.io/badge/pi-coding--agent-FF6B6B?style=flat&labelColor=222222)](https://www.npmjs.com/package/@earendil-works/pi-coding-agent)
[![recall-core](https://img.shields.io/badge/recall--core-ecosystem-00D9A3?style=flat&labelColor=222222)](#architecture)

## Architecture

recall-pi é o **cliente terminal-side** do ecossistema recall-core. O engine de memória (chunking, embeddings, hybrid search, persistência) vive em `recall-core`. O Pi consome isso via MCP e também usa seus próprios artefatos locais de observabilidade e operação.

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

**Papel do Pi:** injetar contexto relevante, expor `recall_*` tools, orquestrar subagentes com contexto isolado, proteger mutações sensíveis, e gravar traces estruturados por run.

## Structure

```
recall-pi/
├── .agents/
│   └── skills/          # skills no padrão Agent Skills
├── .pi/
│   ├── extensions/      # extensões TypeScript do Pi
│   ├── harness/         # traces gerados em runtime (.pi/harness/runs)
│   ├── prompts/         # templates /comando
│   ├── scripts/         # helpers
│   └── settings.json    # settings do projeto
├── docs/
├── GLOBAL_RULES.md
├── models.template.json # template para ~/.pi/agent/models.json (provider kilo)
└── package.json         # manifesto do pacote Pi (extensions/skills/prompts)
```

## Package manifest (`package.json`)

O projeto declara explicitamente seus diretórios Pi no bloco `pi`:

```json
{
  "pi": {
    "extensions": ["./.pi/extensions"],
    "skills": ["./.agents/skills", "./.pi/skills"],
    "prompts": ["./.pi/prompts"]
  }
}
```

Isso é importante porque o Pi pode rodar como binário global; a descoberta de skills/prompts/extensões deve vir do manifesto do pacote, não de suposições sobre o cwd do processo.

## Extension pack

Principais extensões em `.pi/extensions/`:
- `permission-gate.ts` — modal de confirmação para bash sensível/privilegiado; bloqueio de `write`/`edit` em `.recall` e `.git/`; comando `/abort`
- `protected-paths.ts` — confirmação para writes/edits em paths protegidos (`.env`, `node_modules/`, configs do Pi, etc.)
- `recall-tools/` — integração com recall via MCP local (`recall_mcp_load`, `recall_save`)
- `jina-index/` — indexação e busca semântica local de docs via Jina API
- `custom-compaction.ts` — substitui o resumo padrão por summary cumulativo via LLM no hook `session_before_compact`
- `compaction-snapshot/` — persiste snapshots de compaction no disco no evento `session_compact`
- `trigger-compact.ts` — expõe `/trigger-compact` para compaction manual
- `tool-discovery/` — índice BM25 de tools + `search_tool`
- `command-bridge/` — expõe slash commands de `~/.claude/`, `~/.codex/`, `~/.opencode/`
- `subagent-env/` + `subagent-policy.ts` — ambiente, execução e roteamento de subagentes
- `trace-recorder.ts` — tracing por run com spans de tool, artefatos e tokens (+ `/trace-last`, `/trace-list`)
- `status-line.ts` / `working-indicator.ts` / `custom-footer.ts` — UX da UI

## Skills

Skills do projeto podem viver em:
- `.agents/skills/`
- `.pi/skills/`

A descoberta é feita via `package.json` (`pi.skills`). Exemplo atual:
- `.agents/skills/find-skills/SKILL.md`

Após criar ou mover uma skill, rode `/reload`.

## Trace recorder

Cada run do agente principal ou de subagente gera um trace estruturado em:

```text
recall-pi/.pi/harness/runs/
├── index.jsonl
├── main-<session>-<timestamp>/
│   ├── events.jsonl
│   ├── trace.json
│   └── trace-main.json
└── sub-<session>-<timestamp>/
    └── ...
```

Importante:
- o trace recorder grava na **raiz do pacote `recall-pi`**, derivada do próprio arquivo da extensão
- ele **não** usa o cwd do processo global do Pi para decidir onde salvar
- isso evita traces acidentalmente irem para `C:\Users\...\Documents\.pi\...`

Cada `trace.json` contém:
- modelo, fase e duração
- `phase: "main"` para o agente principal e `phase: "subagent"` para runs delegados
- tool spans com `args_summary`
- `artifact_refs` (arquivos tocados)
- tokens agregados

Comandos:
- `/trace-last`
- `/trace-list`

## Compaction

Comportamento atual:
- **auto-compaction por threshold** é responsabilidade do runtime do **Pi**
- `custom-compaction.ts` apenas customiza **como o resumo é gerado**
- `trigger-compact.ts` expõe apenas o comando manual `/trigger-compact`
- a extensão **não** dispara mais `ctx.compact()` automaticamente em `turn_end`

Isso evita usar o fluxo de compaction manual como shim de auto-compaction, o que podia interferir no ciclo normal do agente principal.

## Subagents

Subagentes bundled:
- `scout` → `kilo/gpt-4.1-mini`
- `planner` → `openai-codex/gpt-5.4`
- `worker` → `kilo/gpt-5-mini`
- `reviewer` → `kilo/deepseek/deepseek-v4-flash`
- `debugger` → `kilo/qwen/qwen3.6-plus`

### Comportamento operacional

- a política de auto-delegação usa **heurística léxica** (zero tokens)
- o agente desta sessão é o **main**; subagentes aparecem como runs separados no harness
- o runner de subagentes aplica **timeout de 180s por subagente**
- `/abort` ativa um **abort lock**:
  - aborta subagentes em execução
  - bloqueia novas chamadas de `subagent`
  - bloqueia mutações `bash` / `write` / `edit`
  - o lock é limpo com `/reload`

### System log

Eventos críticos são gravados em `logs/system-log.jsonl`.

`source` segmentado:
- `trace-recorder`
- `subagent-policy`
- `subagent:tool`
- `subagent:runner`
- `subagent:usage`

Há eventos específicos para timeout/abort em subagentes, úteis para depuração de travamentos.

## Install

1. Clone e instale:
   ```bash
   git clone <repo-url> ~/recall-pi
   cd ~/recall-pi
   npm install
   ```

2. Escolha o modo:
   - **project-local:** rode o Pi dentro do repo
   - **package global:** adicione o repo em `~/.pi/agent/settings.json` → `packages`
     ```bash
     npm run setup-pi-settings
     ```

3. Configure modelos do provider kilo se necessário:
   ```bash
   cp models.template.json ~/.pi/agent/models.json
   # preencha apiKey
   ```

4. Rode `/reload`.

## Test

```bash
npm run typecheck
npm test
```

Cobertura atual de testes inclui:
- heurística léxica de subagentes
- registro de tools/extensions
- smoke test dos subagentes bundled via runner fake
- execução de agente project-local
- BM25 do `tool-discovery`

## Image generation (Pi 0.74.1+)

A configuração inclui `image_generate` via OpenRouter.

Requisito:

```bash
export OPENROUTER_API_KEY=...
```

Uso:
- `/image <prompt>`
- tool direta `image_generate(...)`

## Provider diagnostics

- `/provider-doctor` — mostra status do provider/model atual e faz probes best-effort

## Models & providers

### Kilo (custom — requer `models.json`)

Copie `models.template.json` para `~/.pi/agent/models.json` e preencha `apiKey`.

Modelos registrados:

| id | usado por |
|---|---|
| `gpt-4.1-mini` | scout |
| `gpt-5-mini` | worker |
| `deepseek/deepseek-v4-flash` | reviewer |
| `qwen/qwen3.6-plus` | debugger |

### OpenAI Codex (built-in — requer `/login`)

```text
/login
# Selecione openai-codex e siga o fluxo OAuth
```

| id | usado por |
|---|---|
| `gpt-5.4` | planner |

## Security summary

- não commitar tokens/senhas/chaves
- `.recall/project.json` é a identidade do projeto no recall
- `permission-gate` bloqueia exclusão shell de `.recall` e bloqueia `write`/`edit` em `.recall` e `.git/`
- `protected-paths` pede confirmação para outros paths sensíveis
- `recall-tools` evita histórico por prompt em logs locais

## Roadmap

> **Architectural turn (post-V1):** recall-pi está sendo reposicionado de “cliente MCP qualquer” para cliente privilegiado do ecossistema recall-core. Clientes externos continuam falando com MCP; recall-pi ganha a melhor ergonomia operacional.

### V1 — atual
- extensões em `.pi/extensions`
- skills declaradas no `package.json`
- subagent orchestration com heuristic routing
- trace recorder em `.pi/harness/runs`
- timeout de subagente + `/abort`
- permission gate + protected paths
- integração recall via MCP local

### V2 — integração mais profunda com recall-core
- chamadas diretas a módulos do core
- menor latência
- mais superfície interna de debug/metrics

### V3+ — ecossistema
- rerank tuning
- docs layer / raw substrate
- roteamento entre camadas de memória

---

## License

ISC
