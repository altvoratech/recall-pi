# MCP Nativo para recall-pi

## Motivação

O Pi padrão não possui implementação MCP nativa. Isso força o uso de workarounds:
- spawn de processos Python externos (`recall_mcp_client.py`)
- dependência de servers MCP rodando separadamente
- latência adicional por IPC

O projeto **oh-my-pi** (fork can1357) implementou MCP client completo em TypeScript puro, com:
- suporte a stdio e HTTP/SSE transports
- auto-discovery de `.mcp.json`
- reconnect automático com backoff
- cache de tools
- bridge MCP → CustomTool

O recall-pi pode portar componentes estratégicos dessa implementação, ganhando:
- chamadas diretas a MCP servers sem subprocess
- integração nativa com o tool registry do Pi
- menor latência e melhor ergonomia

---

## Fonte de Referência

Diretório analisado:
```
~/Documentos/projects-espelho/oh-my-pi/packages/coding-agent/src/mcp/
```

Componentes principais:
| Arquivo | LOC | Descrição |
|---------|-----|-----------|
| `json-rpc.ts` | ~84 | Cliente HTTP mínimo, stateless |
| `client.ts` | ~350 | Conexão full: connect, tools, prompts, resources |
| `manager.ts` | ~900 | Singleton orquestrador com lifecycle completo |
| `tool-bridge.ts` | ~300 | Ponte MCP → CustomTool |
| `transports/stdio.ts` | ~200 | JSON-RPC via subprocess |
| `transports/http.ts` | ~350 | JSON-RPC via HTTP + SSE |
| `types.ts` | ~200 | Tipos MCP protocol |

---

## Arquitetura Alvo

```
recall-pi/
├── src/
│   └── mcp/
│       ├── index.ts           # Exports públicos
│       ├── json-rpc.ts        # Cliente HTTP mínimo (port direto)
│       ├── client.ts          # Cliente simplificado
│       ├── types.ts           # Tipos MCP essenciais
│       └── transports/
│           ├── http.ts        # HTTP + SSE
│           └── stdio.ts       # Subprocess (opcional)
└── extensions/
    └── mcp-tools.ts           # Extensão que registra tools de MCP servers
```

---

## Fase 0 — Port do cliente HTTP mínimo

### Objetivo
Ter um cliente funcional para chamar qualquer MCP server HTTP em ~100 LOC.

### Escopo
- Portar `json-rpc.ts` com adaptações mínimas
- Remover dependência de `@oh-my-pi/pi-utils` (usar logger próprio ou console)
- Testar com recall-core MCP server local

### Artefatos
- `src/mcp/json-rpc.ts`
- `src/mcp/types.ts` (tipos básicos)

### Validação
```typescript
import { callMCP } from './mcp/json-rpc';

const result = await callMCP('http://localhost:8000/mcp', 'tools/list', {});
console.log(result);
```

### Resultado esperado
Chamadas HTTP diretas a MCP servers funcionando, sem subprocess.

---

## Fase 1 — Cliente simplificado com connection

### Objetivo
Ter um cliente que mantém conexão, lista tools e executa chamadas.

### Escopo
- Portar subset de `client.ts`:
  - `connectToServer()`
  - `listTools()`
  - `callTool()`
  - `disconnectServer()`
- Implementar transport HTTP básico (sem SSE inicialmente)

### Artefatos
- `src/mcp/client.ts`
- `src/mcp/transports/http.ts`

### Validação
```typescript
const conn = await connectToServer('recall', { 
  type: 'http', 
  url: 'http://localhost:8000/mcp' 
});
const tools = await listTools(conn);
const result = await callTool(conn, 'recall_mcp_load', { query: 'test' });
```

### Resultado esperado
Conexão persistente com MCP servers HTTP funcionando.

---

## Fase 2 — Transporte stdio

### Objetivo
Suportar MCP servers via subprocess (formato padrão Claude Desktop).

### Escopo
- Portar `transports/stdio.ts`
- Adaptar spawn para Node.js/Bun
- Implementar JSON-RPC via stdin/stdout

### Artefatos
- `src/mcp/transports/stdio.ts`

### Validação
```typescript
const conn = await connectToServer('filesystem', {
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@anthropic-ai/mcp-server-filesystem', '/tmp']
});
const tools = await listTools(conn);
```

### Resultado esperado
Compatibilidade com MCP servers stdio (maioria dos servers públicos).

---

## Fase 3 — Extensão mcp-tools

### Objetivo
Registrar tools de MCP servers automaticamente no tool registry do Pi.

### Escopo
- Criar extensão `extensions/mcp-tools.ts`
- Hook no `session:start` para descobrir e conectar
- Converter MCPToolDefinition → CustomTool
- Registrar no tool registry ativo

### Config esperada
```json
// .pi/settings.json
{
  "mcp": {
    "servers": {
      "recall": {
        "type": "http",
        "url": "http://localhost:8000/mcp"
      },
      "filesystem": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@anthropic-ai/mcp-server-filesystem", "/home/g"]
      }
    }
  }
}
```

### Artefatos
- `extensions/mcp-tools.ts`

### Validação
- Após reload, tools MCP aparecem no `/tools` ou similar
- Agent consegue usar tools MCP como qualquer outra

### Resultado esperado
MCP servers como cidadãos de primeira classe no Pi.

---

## Fase 4 — Auto-discovery de `.mcp.json`

### Objetivo
Descobrir e conectar automaticamente a MCP servers configurados no projeto.

### Escopo
- Parser de `.mcp.json` (formato Claude Desktop)
- Merge com config global
- Discovery em startup

### Formato `.mcp.json`
```json
{
  "mcpServers": {
    "recall": {
      "url": "http://localhost:8000/mcp"
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

### Artefatos
- `src/mcp/config.ts`
- Update em `extensions/mcp-tools.ts`

### Resultado esperado
Zero-config para projetos com `.mcp.json` existente.

---

## Fase 5 — Manager com reconnect e cache

### Objetivo
Robustez de produção: reconnect automático, cache de tools, lifecycle correto.

### Escopo
- Port simplificado de `manager.ts`
- Reconnect com backoff (500ms → 1s → 2s → 4s)
- Cache de tools para startup rápido
- Cleanup no session end

### Artefatos
- `src/mcp/manager.ts`

### Comportamento
- Conexão perdida → retry automático
- Startup → usa cache se conexão demorar
- Session end → disconnect graceful

### Resultado esperado
MCP confiável em sessões longas e ambientes instáveis.

---

## Fase 6 (Opcional) — SSE e resources/prompts

### Objetivo
Suporte completo ao MCP spec 2025-03-26.

### Escopo
- SSE listener para server→client notifications
- `listResources()` / `readResource()`
- `listPrompts()` / `getPrompt()`
- Subscriptions de resource updates

### Artefatos
- Update em `transports/http.ts` (SSE)
- Update em `client.ts` (resources/prompts)

### Resultado esperado
Compatibilidade total com MCP servers avançados.

---

## Decisões Arquiteturais

### Fazer
- Port incremental, fase a fase
- Validar cada fase antes de avançar
- Manter compatibilidade com servers existentes (recall-core, claude desktop servers)
- Documentar API pública

### Não fazer
- Port completo de uma vez (muito risco)
- Depender de internals do oh-my-pi (fork parcial)
- Quebrar workflow atual com recall_mcp_client.py (migração gradual)

### Prioridade
1. HTTP client (Fase 0-1) — maior valor imediato
2. stdio transport (Fase 2) — compatibilidade
3. Extensão Pi (Fase 3-4) — integração nativa
4. Robustez (Fase 5) — produção
5. SSE/resources (Fase 6) — nice-to-have

---

## Relação com recall-pi V2

Esta implementação MCP prepara terreno para:
- **recall-pi como client privilegiado** (acesso direto ao core via MCP nativo)
- **MCP como transporte unificado** (mesmo protocolo interno e externo)
- **Dissolução do subprocess Python** (chamadas diretas, menor latência)

Quando o recall-core migrar para FastAPI com MCP montado, o recall-pi já terá client nativo para consumir.

---

## Próximo Passo

Iniciar pela **Fase 0**: port do `json-rpc.ts` (~100 LOC, validação rápida).
