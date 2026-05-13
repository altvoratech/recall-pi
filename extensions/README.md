# Extensions

Coleção de extensões do Pi para este ambiente.

## Principais extensões
- `permission-gate.ts` — intercepta comandos bash sensíveis e abre modal de confirmação/sudo
- `recall-tools/` — integração com o recall via MCP local
- `plan-mode/` — modo read-only estilo plano
- `subagent-env/` — suporte a ambiente de subagentes
- `status-line.ts` / `working-indicator.ts` / `model-status.ts` — status da UI

## Recall
A integração de recall usa MCP local e lê as credenciais em `~/.pi/agent/settings.json`.
A injeção de contexto consulta o recall global; save/identity continua usando `.recall/project.json`.

## Arquivos locais ignorados
- `.firecrawl/`
- `recall-tools/logs/`
- `SESSION-NOTES-*.md`
- `RECALL_CORE_ANALYSIS.md`
- `.recall/` deve permanecer disponível, pois contém o UUID do projeto para o recall.

## Segurança
- Não versionar tokens, senhas ou arquivos de log.
- O `recall-tools` sobrescreve `logs/latest.json` e não cria histórico por prompt.
- A identidade do projeto vem do cwd do usuário, via `.recall/project.json` local.
