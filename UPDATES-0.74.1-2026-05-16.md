# recall-pi — Atualizações (Pi 0.74.1 + migração `.pi/`)

Documento histórico das mudanças aplicadas após o upgrade para `@earendil-works/pi-coding-agent` 0.74.1 e da consolidação de layout feita em 2026-05-17.

## 2026-05-16 — Base 0.74.1

- Alinhamento com recursos do Pi 0.74.1.
- Inclusão de `image-generation.ts` (`image_generate`) e `/provider-doctor`.
- Ajustes no footer para preservar `footerData.getExtensionStatuses()`.
- Correção do classifier de subagentes (`max_tokens >= 16`) + visibilidade de erro.

## 2026-05-17 — Consolidação de estrutura

### 1) Fonte única em `.pi/`
- Removidos diretórios legados da raiz (`extensions/`, `prompts/`, `scripts/`).
- Runtime consolidado em:
  - `.pi/extensions/`
  - `.pi/prompts/`
  - `.pi/scripts/`

### 2) Manifesto do pacote no root
- `package.json` mantido na raiz (padrão de package do Pi).
- Bloco `pi` apontando para:
  - `./.pi/extensions`
  - `./.pi/prompts`

### 3) Tooling centralizado no root
- Removidos arquivos redundantes de `.pi/extensions`:
  - `package.json`
  - `package-lock.json`
  - `.gitignore`
  - `tsconfig.json`
- Scripts oficiais no root:
  - `npm test`
  - `npm run typecheck`
  - `npm run build`
- `tsconfig.json` movido para a raiz.

### 4) Deduplicação de extensão global
- `~/.pi/agent/extensions/subagent-env` removido para evitar carga duplicada (global + pacote).
- Resultado esperado: prompt/system mais limpo, menos conflito de hooks/status.

### 5) Robustez do classifier de subagentes
- Timeout tornou-se configurável via `subagentPolicy.classifierTimeoutMs` (settings).
- Valor aplicado no projeto: `20000` ms.
- Normalização de base URL do provider `kilo` para o gateway `https://api.kilo.ai/api/gateway` para evitar HTTP 404 por host incorreto.

### 6) System logging de orquestração
- Eventos críticos de `subagent-policy` e `subagent` passam a ser persistidos em `logs/system-log.jsonl`.
- Rotação automática de log: `5 MB` por arquivo, mantendo até `5` históricos (`logs/system-log.1.jsonl` ... `.5`).
- Objetivo: facilitar diagnóstico de auto-delegação, classifier fallback e execução de subagentes.

### 7) Testes e validação
- `npm test` passando (com testes opt-in de integração marcados como `SKIP` por padrão).
- `npm run typecheck` passando.

---

## Estado atual (resumo)

- Arquitetura adotada: **package root + runtime em `.pi/`**.
- `recall-pi` pode rodar project-local ou como package global via `packages` no settings do Pi.
- Documentação da raiz atualizada para refletir esse contrato.
