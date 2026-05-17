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

---

## Estado atual (resumo)

- Arquitetura adotada: **package root + runtime em `.pi/` + skills declaradas no manifesto**.
- `recall-pi` funciona como pacote Pi local/global sem fork do runtime upstream.
- A documentação foi atualizada para refletir o comportamento real de skills, subagentes, gates e tracing.
