# Modo de Stream de Eventos JSON

```bash
pi --mode json "Seu prompt"
```

Emite todos os eventos da sessão como linhas JSON para stdout. Útil para integrar o pi a outras ferramentas ou interfaces personalizadas.

## Tipos de Eventos

Os eventos são definidos em [`AgentSessionEvent`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/agent-session.ts#L102):

```typescript
type AgentSessionEvent =
  | AgentEvent
  | { type: "queue_update"; steering: readonly string[]; followUp: readonly string[] }
  | { type: "compaction_start"; reason: "manual" | "threshold" | "overflow" }
  | { type: "compaction_end"; reason: "manual" | "threshold" | "overflow"; result: CompactionResult | undefined; aborted: boolean; willRetry: boolean; errorMessage?: string }
  | { type: "auto_retry_start"; attempt: number; maxAttempts: number; delayMs: number; errorMessage: string }
  | { type: "auto_retry_end"; success: boolean; attempt: number; finalError?: string };
```

`queue_update` emite as filas completas de steering e follow-up pendentes sempre que elas mudam. `compaction_start` e `compaction_end` cobrem tanto a compactação manual quanto a automática.

Eventos base de [`AgentEvent`](https://github.com/earendil-works/pi-mono/blob/main/packages/agent/src/types.ts#L179):

```typescript
type AgentEvent =
  // Ciclo de vida do agente
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }
  // Ciclo de vida de turno
  | { type: "turn_start" }
  | { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
  // Ciclo de vida de mensagem
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }
  | { type: "message_end"; message: AgentMessage }
  // Execução de ferramentas
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: any }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; args: any; partialResult: any }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: any; isError: boolean };
```

## Tipos de Mensagem

Mensagens base de [`packages/ai/src/types.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/ai/src/types.ts#L134):
- `UserMessage` (linha 134)
- `AssistantMessage` (linha 140)
- `ToolResultMessage` (linha 152)

Mensagens estendidas de [`packages/coding-agent/src/core/messages.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/messages.ts#L29):
- `BashExecutionMessage` (linha 29)
- `CustomMessage` (linha 46)
- `BranchSummaryMessage` (linha 55)
- `CompactionSummaryMessage` (linha 62)

## Formato de Saída

Cada linha é um objeto JSON. A primeira linha é o cabeçalho da sessão:

```json
{"type":"session","version":3,"id":"uuid","timestamp":"...","cwd":"/path"}
```

Seguido pelos eventos conforme ocorrem:

```json
{"type":"agent_start"}
{"type":"turn_start"}
{"type":"message_start","message":{"role":"assistant","content":[],...}}
{"type":"message_update","message":{...},"assistantMessageEvent":{"type":"text_delta","delta":"Hello",...}}
{"type":"message_end","message":{...}}
{"type":"turn_end","message":{...},"toolResults":[]}
{"type":"agent_end","messages":[...]}
```

## Exemplo

```bash
pi --mode json "List files" 2>/dev/null | jq -c 'select(.type == "message_end")'
```
