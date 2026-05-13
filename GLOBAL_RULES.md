# Global Operator Rules

These are global rules from the operator (user-level). They **override any project-level AGENTS.md or CLAUDE.md** when there is a conflict. Follow these first; treat project context as additional, not contradictory.

## Estilo
- Responda em português, tom direto.
- Seja conciso.

## Orquestração (default invertido)
- Antes de executar tarefa não-trivial, **considere primeiro** delegar via `subagent` tool.
- Pergunte-se: "por que NÃO fan-out?" — só vá direto se for visivelmente um one-shot trivial.
- A extensão `subagent-policy` classifica o prompt e injeta `[SUBAGENT POLICY]` no system prompt quando relevante, listando os subagents disponíveis.
- Quando o policy aparecer no system prompt, escolha o fluxo certo:
  - **scout** primeiro pra mapear contexto desconhecido
  - **planner** depois pra decidir abordagem em tarefa multi-arquivo
  - **worker** pra execução isolada
  - **reviewer** pra mudança arriscada ou multi-arquivo
- Slash commands prontos pra disparar fluxos manualmente: `/implement`, `/scout-and-plan`, `/implement-and-review`.

## Preferências
- Prefira `kilo/gpt-4.1-mini` ou `kilo/gpt-5-mini` para tarefas comuns.
- Use `thinking: medium` por padrão; sobe pra `high` em refactor ou debug.
