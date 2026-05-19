# recall-pi — Atualizações (Pi 0.74.1 + consolidação `.pi/`)

Documento histórico das mudanças aplicadas após o upgrade para `@earendil-works/pi-coding-agent` 0.74.1.

## 2026-05-16 — Base 0.74.1

- Alinhamento com recursos do Pi 0.74.1.
- Inclusão de `image-generation.ts` (`image_generate`) e `/provider-doctor`.
- Ajustes no footer para preservar `footerData.getExtensionStatuses()`.

## 2026-05-17 — Consolidação estrutural

### 1) Fonte única em `.pi/`
- Runtime consolidado em:
  - `.pi/extensions/`
  - `.pi/prompts/`
  - `.pi/scripts/`
- `tsconfig.json` centralizado na raiz.

### 2) Manifesto do pacote
- `package.json` mantido na raiz.
- Bloco `pi` declarando explicitamente:
  - `./.pi/extensions`
  - `./.pi/prompts`
  - `./.agents/skills`
  - `./.pi/skills`

### 3) Skills
- Discovery de skills do projeto passou a depender explicitamente de `pi.skills` no `package.json`.
- Isso evita inconsistências quando o binário do Pi roda globalmente.

### 4) Subagents
- `reviewer` migrado para `kilo/deepseek/deepseek-v4-flash`.
- Timeout de 180s por subagente implementado no runner.
- Runner passou a tratar `timeout` e `aborted` de forma explícita.
- Adicionado abort lock compartilhado entre `permission-gate` e `subagent-env`.

### 5) Permission / safety gates
- `permission-gate` passou a bloquear `write`/`edit` em `.recall` e `.git/`.
- Lista de bash mutante/sensível foi expandida.
- Novo comando `/abort`:
  - aborta subagentes em execução
  - bloqueia novas mutações até `/reload`

### 6) Trace recorder
- `trace-recorder` grava em `recall-pi/.pi/harness/runs/`.
- A raiz agora é derivada do pacote da extensão, não do cwd do processo global do Pi.
- O harness distingue `phase: "main"` e `phase: "subagent"`.
- Corrigidas assinaturas de commands para manter `typecheck` verde.

### 7) Logging e observabilidade
- `logs/system-log.jsonl` continua como trilha operacional principal.
- Eventos de timeout/abort de subagentes ficam visíveis no log.

### 8) Compaction
- Removido o auto-gatilho de `ctx.compact()` em `turn_end` na extensão `trigger-compact.ts`.
- Auto-compaction por threshold volta a ficar exclusivamente no runtime nativo do Pi.
- `/trigger-compact` permanece como comando manual.

### 9) Testes
- Adicionado smoke test para todos os subagentes bundled via runner fake.
- `npm run typecheck` e `npm test` passando.

## 2026-05-19 — Conformance `subagent-env` vs doc oficial do Pi

Validação do `.pi/extensions/subagent-env/` cruzando o código com a doc do Pi
(`docs/coding-agent/json.md`, `usage.md`) e o binário instalado (`pi --help`,
`@earendil-works/pi-coding-agent` 0.75.3).

### 1) `--no-extensions` no spawn do subagente (causa-raiz) — corrigido

- **Problema:** o subprocess `pi` spawnado pelo runner (`index.ts`) só passava
  `--mode json -p --no-session` (+ `--model`/`--tools`/`--append-system-prompt`).
  Sem `--no-extensions`, o filho herdava settings global+projeto e **carregava
  todas as extensions** dentro de cada subagente: `subagent-policy` injetava
  `[SUBAGENT POLICY]`/`[AUTO-DELEGATION ROUTER]` (worker/planner tentando
  delegar em loop), além de `recall-tools` auto-search, `custom-compaction` e
  `tool-discovery` rodando dentro de cada step.
- **Fix:** adicionado `--no-extensions` aos args do spawn. A doc (`usage.md`)
  endossa o idioma "desabilite discovery e carregue só o necessário". Seguro:
  os 7 agents usam apenas built-ins (allowlistados via `--tools`); nenhum
  declara tool de extension.
- **Impacto:** elimina a delegação recursiva e a poluição de contexto nos
  subagentes sem precisar do gate `PI_SUBAGENT_SPAWN=1` antes planejado.

### 2) Event dead-code `tool_result_end` — corrigido

- **Problema:** o parser de eventos escutava `tool_result_end`, que **não
  existe** no JSON event stream do Pi. Resultados de tool nunca eram
  capturados em `messages`.
- **Fix:** substituído por handler de `turn_end` consumindo
  `event.toolResults` (`ToolResultMessage[]`), conforme `json.md`. A mensagem
  assistant continua vindo de `message_end` (já correto).
- **Impacto:** observabilidade — `messages` agora reflete os tool results;
  decisão do orquestrador (`getFinalOutput`) já funcionava via `message_end`.

### 3) Capability ceiling por nome de agent (hardening)

- **Antes:** `resolveTools(role, tools)` era um blocklist hardcoded só para
  `role === "coordinator"` (que nunca disparava — só `executor.md` declara
  `role`). A fonte real de tools era o `tools:` do frontmatter, passado cru
  via `--tools`. Um agent project-local (repo-controlled, `agentScope:
  project/both`) podia declarar `tools: read,write,edit,bash` e se
  auto-conceder mutação. Agent sem `tools:` herdava o toolset default
  completo do Pi.
- **Fix:** `resolveTools(name, declared)` agora aplica um **ceiling por nome**
  (`NAME_CEILING`, nomes de built-in do Pi) com semântica de **interseção**:
  `effective = declared ∩ ceiling`. Tetos: coordinator =
  `read,grep,find,ls`; scout/planner/reviewer/debugger =
  `read,bash,grep,find,ls`; worker/executor =
  full built-ins. Agent desconhecido → `READONLY_SAFE`
  (`read,grep,find,ls`). Sempre retorna lista não vazia.
- **Mudança de comportamento:** agent sem `tools:` agora roda no **teto da
  capability**, não mais no default completo do Pi. Os 7 agents bundled não
  regridem (tools declaradas ⊆ teto em todos). Sinergia com o
  `--no-extensions`: o `--tools` resultante é a fronteira de segurança real
  do subagente.

### 4) Achado retratado após verificação empírica

- A doc lista `--append-system-prompt <text>`, sugerindo bug no runner (passa
  path de arquivo temp). Mas `pi --help` do binário instalado confirma:
  *"Append text **or file contents** to the system prompt"*. O runner está
  **correto** — o system prompt do agente É aplicado. Sem mudança.

### 5) Reorganização estrutural das extensions (dir vs flat)

Critério de manutenibilidade: o problema não é quantidade de extensões
soltas (flat single-concern é idiomático no Pi), e sim arquivo grande
multi-concern + domínio fragmentado. Ações:

- **Tier 2a — `subagent-policy.ts` → `subagent-env/policy.ts`.** Era solto
  mas importava `./subagent-env/agents.ts` (reach-in cross-dir). Virou
  `registerSubagentPolicy(pi)`, chamado pelo `subagent-env/index.ts`. O
  subsistema de subagentes (tool + policy) carrega como uma unidade.
- **Tier 1 — `trace-recorder.ts` (616 LOC) → `trace-recorder/`.** Split por
  concern: `index.ts` (wiring) + `paths.ts` + `helpers.ts` + `writer.ts` +
  `types.ts`. `PACKAGE_ROOT` ajustado (+1 nível no `resolve`, pois o módulo
  ficou um diretório mais fundo).
- **Tier 2b — domínio compaction consolidado em `compaction/`.** Unifica
  `custom-compaction.ts` + `trigger-compact.ts` + `compaction-snapshot/`
  (2 soltos + 1 dir) em `custom.ts` + `trigger.ts` + `snapshot.ts` +
  `index.ts`. `SNAPSHOT_ROOT` resolve igual (mesma profundidade do antigo
  `compaction-snapshot/`).
- **Tier 3/4 — mantidos flat de propósito** (`permission-gate`,
  `protected-paths`, `system-rules`, `image-generation`, `status-line`,
  `working-indicator`, `custom-footer`, `notify`, `confirm-destructive`):
  pequenos e single-concern; diretório seria over-engineering.
- **Regra de convenção** registrada no `.pi/extensions/README.md`:
  diretório só quando split real OU asset não-`.ts` OU domínio
  co-registrado; resto flat.
- Teste ajustado: o mock mínimo dos testes do subagent tool ganhou stubs
  no-op `registerCommand`/`on` (o `subagent-env/index.ts` agora também
  registra a policy).

### 6) Alinhamento de layout do pacote (`.pi/` como runtime root)

Princípio: o manifesto `pi` desacopla path físico do contrato do pacote —
onde recursos moram é decisão organizacional, não de correção. Optou-se
por consolidar tudo que é runtime sob `.pi/` (decisão de 2026-05-17) e
tirar de `.pi/` o que não é recurso Pi.

- **`themes/` → `.pi/themes/`.** O tema era o único recurso na raiz
  (`pi.themes: ["./themes"]`), inconsistente com `extensions`/`prompts`
  sob `.pi/`. Movido; manifesto atualizado para `["./.pi/themes"]`. O tema
  ativo `recall-pi` resolve por `name` via manifesto — sem reinstalar
  (pacote local-path é referenciado, não copiado).
- **`.pi/scripts/` → `scripts/` (raiz).** `setup-pi-settings.sh` e
  `sync-models.sh` são tooling de projeto, **não** um dos 4 tipos de
  recurso do manifesto — `.pi/` lia como "recursos Pi" indevidamente.
  `package.json` `scripts.setup-pi-settings` atualizado para
  `scripts/setup-pi-settings.sh`.
- A referência a `.pi/scripts/` na seção 2026-05-17 é registro histórico
  (estado correto naquela data); não reescrita.

### 7) Footer powerline com background (2 linhas com bloco)

- Padrão de segmentos espelhado do oh-my-pi, reimplementado enxuto (sem a
  infra de 21 segmentos/presets/cache — `oh_my_pi_referencia_arquitetural_nao_dep`).
- **Linha 1:** π / model+thinking / cwd+branch / tokens / cost+ctx% em
  blocos com background (`getBgAnsi` por segmento) + bleed do separador
  (`\x1b[48`→`\x1b[38`, seta `` com cor = bg anterior); run-state à
  direita.
- **Linha 2 (meta-info):** pills **planos** (sem bg), só `theme.fg("dim")`
  como separador — igual `recall-pi.png`. Cores dos pills vêm das
  extensions-fonte (já `theme.fg` → `.pi/themes/recall-pi.json`).
  Tentativa de dar bg-block à linha 2 (`pessimo.png`) ficou ruim e foi
  revertida: só a linha 1 tem background.
- 100% theme-driven (`getFgAnsi`/`getBgAnsi`), zero hardcode (fronteira
  theme=paleta/footer=estrutura). `ThemeBg` não é re-exportado do root,
  mas é derivado do tipo exportado via `Parameters<Theme["getBgAnsi"]>[0]`
  (fonte única, sem cópia manual do schema). Nerd Font; fallback ASCII
  via `PI_FOOTER_ASCII=1`. Toggle `/footer`.
- Iteração testada e descartada: versão **sem bg** (powerline-thin) —
  ficou estranha/solta visualmente (feedback de screenshot do usuário);
  o bloco com background é o preferido.

### Validação

- `npm run typecheck`: verde.
- `npm test`: as mudanças não introduzem regressão. Permanece **1 falha
  pré-existente e não relacionada** — `bundled subagents match model declared
  in md`: a tabela de expectativa do teste fixa `planner =
  opencode-go/qwen3.6-plus`, mas `planner.md` declara
  `opencode-go/deepseek-v4-flash`. Drift de modelo do planner, decisão aberta
  separada (não tocada aqui).

---

## Estado atual (resumo)

- Arquitetura adotada: **package root + runtime em `.pi/` + skills declaradas no manifesto**.
- `recall-pi` funciona como pacote Pi local/global sem fork do runtime upstream.
- A documentação foi atualizada para refletir o comportamento real de skills, subagentes, gates e tracing.
- Subagentes rodam isolados (`--no-extensions`): sem herdar policy/auto-search/compaction do processo pai.
- Tools de subagente bounded por capability ceiling por nome (interseção; default read-only seguro para agents desconhecidos).
- Extensions reorganizadas por coesão: `subagent-env/` (tool+policy), `trace-recorder/` (split), `compaction/` (domínio). Convenção dir-vs-flat documentada; Tier 3/4 permanecem flat.
- Layout do pacote alinhado: todo recurso runtime sob `.pi/` (`themes/` → `.pi/themes/`); tooling de projeto fora de `.pi/` (`scripts/` na raiz).
