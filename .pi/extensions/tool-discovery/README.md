# Tool Discovery

Resolve o problema de **muitas tools inflarem o system prompt**.

Hoje, toda tool registrada via `pi.registerTool()` aparece descrita no system prompt
do LLM em cada turn. Com 40+ tools, isso pode custar ~4k tokens/turno só de
descriptions. Maioria das tools você usa em 10% dos turnos — pagar custo de 100%
do tempo é desperdício.

## Como funciona

1. No `session_start`, esta extensão lê todas as tools do registry (`pi.getAllTools()`)
2. Tools listadas em `toolDiscovery.alwaysActive` (settings) ficam ativas
3. Restante fica **discoverable**: registrada mas **não ativa** (não vai no system prompt)
4. O LLM tem `search_tool` sempre ativa — busca por intenção via BM25 puro
5. Quando encontra match útil, pode ativar com `activate=true`

## Configuração

`~/.pi/agent/settings.json`:

```json
{
  "toolDiscovery": {
    "alwaysActive": [
      "read", "bash", "edit", "write",
      "grep", "find", "ls",
      "subagent", "recall_save", "recall_mcp_load",
      "search_tool"
    ],
    "limit": 8,
    "minScore": 0
  }
}
```

Defaults aplicam se `toolDiscovery` ausente.

## Comportamento

LLM faz:

```
search_tool({ query: "ast refactor rename function" })
```

Resposta:

```
Top 3 match(es) for "ast refactor rename function":

1. ast_grep  (score 4.21)
   Search and edit code using ast-grep syntactic patterns...

2. ast_edit  (score 3.89)
   Apply structural edits to TypeScript/JavaScript via AST...

3. (something)

To use ast_grep, re-run search_tool with activate=true.
```

Depois:

```
search_tool({ query: "ast refactor", activate: true })
```

Resposta:

```
✓ Activated "ast_grep" for this session.
```

Próxima turn já tem `ast_grep` no system prompt.

## Diagnóstico

```
/tool-discovery
```

Mostra contagem total / ativas / discoverable.

## BM25 puro

Tokenização lowercase + stopword removal (PT-BR + EN). Score Okapi BM25
(k1=1.5, b=0.75). Index in-memory, rebuild a cada `session_start`. Zero
dependências externas.

## Quando ativar isto

Faz sentido quando você tem 8+ tools custom registradas. Abaixo disso, o
overhead da `search_tool` (mais 1 tool no system prompt) não compensa o ganho.
