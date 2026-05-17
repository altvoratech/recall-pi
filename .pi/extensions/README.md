# Extensions

Coleção de extensões do Pi para este ambiente.

## Principais extensões
- `permission-gate.ts` — intercepta comandos bash sensíveis e abre modal de confirmação/sudo
- `recall-tools/` — integração com o recall via MCP local
- `jina-index/` — indexação e busca semântica local de docs via API da Jina (TS)
- `compaction-snapshot/` — persiste o summary cumulativo do custom-compaction em disco (cache local efêmero por sessão)
- `tool-discovery/` — BM25 index das tools registradas + `search_tool` pra ativar on-demand sem inflar system prompt
- `command-bridge/` — lê slash commands de `~/.claude/`, `~/.codex/`, `~/.opencode/` e expõe no Pi como `/<source>:<name>`
- `subagent-env/` — suporte a ambiente de subagentes (scout, debugger, planner, worker, reviewer). Modelos definidos via `models.template.json` (kilo) + built-in (openai-codex). Agents em `agents/*.md`.
- `status-line.ts` / `working-indicator.ts` / `model-status.ts` — status da UI

## Recall
A integração de recall usa MCP local e lê as credenciais em `~/.pi/agent/settings.json`.
A injeção de contexto consulta o recall global; save/identity continua usando `.recall/project.json`.

## Arquivos locais ignorados
- `.firecrawl/`
- `recall-tools/logs/`
- `jina-index/_indexes/`
- `SESSION-NOTES-*.md`
- `RECALL_CORE_ANALYSIS.md`
- `.recall/` deve permanecer disponível, pois contém o UUID do projeto para o recall.

## Segurança
- Não versionar tokens, senhas ou arquivos de log.
- O `recall-tools` sobrescreve `logs/latest.json` e não cria histórico por prompt.
- A identidade do projeto vem do cwd do usuário, via `.recall/project.json` local.
