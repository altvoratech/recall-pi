# Modo RPC

O modo RPC permite a operação headless do agente de codificação via um protocolo JSON sobre stdin/stdout. Isso é útil para embutir o agente em outras aplicações, IDEs ou interfaces personalizadas.

**Nota para usuários de Node.js/TypeScript**: Se você está construindo uma aplicação Node.js, considere usar `AgentSession` diretamente de `@earendil-works/pi-coding-agent` em vez de iniciar um subprocess. Consulte [`src/core/agent-session.ts`](../src/core/agent-session.ts) para a API. Para um cliente TypeScript baseado em subprocess, veja [`src/modes/rpc/rpc-client.ts`](../src/modes/rpc/rpc-client.ts).

## Iniciando o Modo RPC

```bash
pi --mode rpc [options]
```

Opções comuns:
- `--provider <name>`: Define o provedor de LLM (anthropic, openai, google, etc.)
- `--model <pattern>`: Padrão ou ID do modelo (suporta `provider/id` e opcional `:<thinking>`)
- `--no-session`: Desativa a persistência de sessão
- `--session-dir <path>`: Diretório personalizado de armazenamento de sessão

## Visão Geral do Protocolo

- **Comandos**: Objetos JSON enviados para stdin, um por linha
- **Respostas**: Objetos JSON com `type: "response"` indicando sucesso/falha do comando
- **Eventos**: Eventos do agente transmitidos para stdout como linhas JSON

Todos os comandos suportam um campo `id` opcional para correlação entre requisição e resposta. Se fornecido, a resposta correspondente incluirá o mesmo `id`.

### Delimitação

O modo RPC usa semântica JSONL estrita com LF (`\n`) como único delimitador de registro.

Isso importa para os clientes:
- Divida os registros apenas em `\n`
- Aceite opcionalmente entradas `\r\n` removendo um `\r` no final
- Não use leitores de linha genéricos que tratam separadores Unicode como quebras de linha

Em particular, o `readline` do Node não é compatível com o protocolo do modo RPC porque também divide em `U+2028` e `U+2029`, que são válidos dentro de strings JSON.

## Comandos

### Prompting

#### prompt

Envia um prompt de usuário para o agente. A resposta do comando é emitida após o prompt ser aceito, enfileirado ou tratado. Os eventos continuam sendo transmitidos de forma assíncrona após a aceitação.

```json
{"id": "req-1", "type": "prompt", "message": "Hello, world!"}
```

Com imagens:
```json
{"type": "prompt", "message": "What's in this image?", "images": [{"type": "image", "data": "base64-encoded-data", "mimeType": "image/png"}]}
```

**Durante o streaming**: Se o agente já estiver em streaming, você deve especificar `streamingBehavior` para enfileirar a mensagem:

```json
{"type": "prompt", "message": "New instruction", "streamingBehavior": "steer"}
```

- `"steer"`: Enfileira a mensagem enquanto o agente está em execução. É entregue após o turno atual do assistente terminar de executar suas chamadas de ferramenta, antes da próxima chamada ao LLM.
- `"followUp"`: Aguarda até o agente terminar. A mensagem é entregue somente quando o agente para.

Se o agente estiver em streaming e nenhum `streamingBehavior` for especificado, o comando retorna um erro.

**Comandos de extensão**: Se a mensagem for um comando de extensão (ex: `/mycommand`), ele é executado imediatamente mesmo durante o streaming. Comandos de extensão gerenciam sua própria interação com o LLM via `pi.sendMessage()`.

**Expansão de entrada**: Comandos de skill (`/skill:name`) e templates de prompt (`/template`) são expandidos antes de enviar/enfileirar.

Resposta:
```json
{"id": "req-1", "type": "response", "command": "prompt", "success": true}
```

`success: true` significa que o prompt foi aceito, enfileirado ou tratado imediatamente. `success: false` significa que o prompt foi rejeitado antes da aceitação. Falhas após a aceitação são reportadas pelo fluxo normal de eventos e mensagens, não como uma segunda `response` para o mesmo id de requisição.

O campo `images` é opcional. Cada imagem usa o formato `ImageContent`: `{"type": "image", "data": "base64-encoded-data", "mimeType": "image/png"}`.

#### steer

Enfileira uma mensagem de direcionamento enquanto o agente está em execução. É entregue após o turno atual do assistente terminar de executar suas chamadas de ferramenta, antes da próxima chamada ao LLM. Comandos de skill e templates de prompt são expandidos. Comandos de extensão não são permitidos (use `prompt` em vez disso).

```json
{"type": "steer", "message": "Stop and do this instead"}
```

Com imagens:
```json
{"type": "steer", "message": "Look at this instead", "images": [{"type": "image", "data": "base64-encoded-data", "mimeType": "image/png"}]}
```

O campo `images` é opcional. Cada imagem usa o formato `ImageContent` (igual ao `prompt`).

Resposta:
```json
{"type": "response", "command": "steer", "success": true}
```

Consulte [set_steering_mode](#set_steering_mode) para controlar como as mensagens de direcionamento são processadas.

#### follow_up

Enfileira uma mensagem de acompanhamento para ser processada após o agente terminar. Entregue somente quando o agente não tiver mais chamadas de ferramenta ou mensagens de direcionamento pendentes. Comandos de skill e templates de prompt são expandidos. Comandos de extensão não são permitidos (use `prompt` em vez disso).

```json
{"type": "follow_up", "message": "After you're done, also do this"}
```

Com imagens:
```json
{"type": "follow_up", "message": "Also check this image", "images": [{"type": "image", "data": "base64-encoded-data", "mimeType": "image/png"}]}
```

O campo `images` é opcional. Cada imagem usa o formato `ImageContent` (igual ao `prompt`).

Resposta:
```json
{"type": "response", "command": "follow_up", "success": true}
```

Consulte [set_follow_up_mode](#set_follow_up_mode) para controlar como as mensagens de acompanhamento são processadas.

#### abort

Interrompe a operação atual do agente.

```json
{"type": "abort"}
```

Resposta:
```json
{"type": "response", "command": "abort", "success": true}
```

#### new_session

Inicia uma sessão nova. Pode ser cancelada por um handler de evento de extensão `session_before_switch`.

```json
{"type": "new_session"}
```

Com rastreamento opcional de sessão pai:
```json
{"type": "new_session", "parentSession": "/path/to/parent-session.jsonl"}
```

Resposta:
```json
{"type": "response", "command": "new_session", "success": true, "data": {"cancelled": false}}
```

Se uma extensão cancelou:
```json
{"type": "response", "command": "new_session", "success": true, "data": {"cancelled": true}}
```

### Estado

#### get_state

Obtém o estado atual da sessão.

```json
{"type": "get_state"}
```

Resposta:
```json
{
  "type": "response",
  "command": "get_state",
  "success": true,
  "data": {
    "model": {...},
    "thinkingLevel": "medium",
    "isStreaming": false,
    "isCompacting": false,
    "steeringMode": "all",
    "followUpMode": "one-at-a-time",
    "sessionFile": "/path/to/session.jsonl",
    "sessionId": "abc123",
    "sessionName": "my-feature-work",
    "autoCompactionEnabled": true,
    "messageCount": 5,
    "pendingMessageCount": 0
  }
}
```

O campo `model` é um objeto [Model](#model) completo ou `null`. O campo `sessionName` é o nome de exibição definido via `set_session_name`, ou omitido se não definido.

#### get_messages

Obtém todas as mensagens da conversa.

```json
{"type": "get_messages"}
```

Resposta:
```json
{
  "type": "response",
  "command": "get_messages",
  "success": true,
  "data": {"messages": [...]}
}
```

As mensagens são objetos `AgentMessage` (consulte [Tipos de Mensagem](#message-types)).

### Modelo

#### set_model

Troca para um modelo específico.

```json
{"type": "set_model", "provider": "anthropic", "modelId": "claude-sonnet-4-20250514"}
```

A resposta contém o objeto [Model](#model) completo:
```json
{
  "type": "response",
  "command": "set_model",
  "success": true,
  "data": {...}
}
```

#### cycle_model

Avança para o próximo modelo disponível. Retorna dados `null` se houver apenas um modelo disponível.

```json
{"type": "cycle_model"}
```

Resposta:
```json
{
  "type": "response",
  "command": "cycle_model",
  "success": true,
  "data": {
    "model": {...},
    "thinkingLevel": "medium",
    "isScoped": false
  }
}
```

O campo `model` é um objeto [Model](#model) completo.

#### get_available_models

Lista todos os modelos configurados.

```json
{"type": "get_available_models"}
```

A resposta contém um array de objetos [Model](#model) completos:
```json
{
  "type": "response",
  "command": "get_available_models",
  "success": true,
  "data": {
    "models": [...]
  }
}
```

### Raciocínio (Thinking)

#### set_thinking_level

Define o nível de raciocínio/thinking para modelos que suportam esse recurso.

```json
{"type": "set_thinking_level", "level": "high"}
```

Níveis: `"off"`, `"minimal"`, `"low"`, `"medium"`, `"high"`, `"xhigh"`

Nota: `"xhigh"` é suportado apenas pelos modelos OpenAI codex-max.

Resposta:
```json
{"type": "response", "command": "set_thinking_level", "success": true}
```

#### cycle_thinking_level

Avança pelos níveis de thinking disponíveis. Retorna dados `null` se o modelo não suportar thinking.

```json
{"type": "cycle_thinking_level"}
```

Resposta:
```json
{
  "type": "response",
  "command": "cycle_thinking_level",
  "success": true,
  "data": {"level": "high"}
}
```

### Modos de Fila

#### set_steering_mode

Controla como as mensagens de direcionamento (provenientes de `steer`) são entregues.

```json
{"type": "set_steering_mode", "mode": "one-at-a-time"}
```

Modos:
- `"all"`: Entrega todas as mensagens de direcionamento após o turno atual do assistente terminar de executar suas chamadas de ferramenta
- `"one-at-a-time"`: Entrega uma mensagem de direcionamento por turno concluído do assistente (padrão)

Resposta:
```json
{"type": "response", "command": "set_steering_mode", "success": true}
```

#### set_follow_up_mode

Controla como as mensagens de acompanhamento (provenientes de `follow_up`) são entregues.

```json
{"type": "set_follow_up_mode", "mode": "one-at-a-time"}
```

Modos:
- `"all"`: Entrega todas as mensagens de acompanhamento quando o agente terminar
- `"one-at-a-time"`: Entrega uma mensagem de acompanhamento por conclusão do agente (padrão)

Resposta:
```json
{"type": "response", "command": "set_follow_up_mode", "success": true}
```

### Compactação

#### compact

Compacta manualmente o contexto da conversa para reduzir o uso de tokens.

```json
{"type": "compact"}
```

Com instruções personalizadas:
```json
{"type": "compact", "customInstructions": "Focus on code changes"}
```

Resposta:
```json
{
  "type": "response",
  "command": "compact",
  "success": true,
  "data": {
    "summary": "Summary of conversation...",
    "firstKeptEntryId": "abc123",
    "tokensBefore": 150000,
    "details": {}
  }
}
```

#### set_auto_compaction

Ativa ou desativa a compactação automática quando o contexto estiver quase cheio.

```json
{"type": "set_auto_compaction", "enabled": true}
```

Resposta:
```json
{"type": "response", "command": "set_auto_compaction", "success": true}
```

### Retry

#### set_auto_retry

Ativa ou desativa a nova tentativa automática em erros transitórios (sobrecarga, limite de taxa, erros 5xx).

```json
{"type": "set_auto_retry", "enabled": true}
```

Resposta:
```json
{"type": "response", "command": "set_auto_retry", "success": true}
```

#### abort_retry

Interrompe uma nova tentativa em andamento (cancela o atraso e para de tentar novamente).

```json
{"type": "abort_retry"}
```

Resposta:
```json
{"type": "response", "command": "abort_retry", "success": true}
```

### Bash

#### bash

Executa um comando shell e adiciona a saída ao contexto da conversa.

```json
{"type": "bash", "command": "ls -la"}
```

Resposta:
```json
{
  "type": "response",
  "command": "bash",
  "success": true,
  "data": {
    "output": "total 48\ndrwxr-xr-x ...",
    "exitCode": 0,
    "cancelled": false,
    "truncated": false
  }
}
```

Se a saída foi truncada, inclui `fullOutputPath`:
```json
{
  "type": "response",
  "command": "bash",
  "success": true,
  "data": {
    "output": "truncated output...",
    "exitCode": 0,
    "cancelled": false,
    "truncated": true,
    "fullOutputPath": "/tmp/pi-bash-abc123.log"
  }
}
```

**Como os resultados do bash chegam ao LLM:**

O comando `bash` é executado imediatamente e retorna um `BashResult`. Internamente, uma `BashExecutionMessage` é criada e armazenada no estado de mensagens do agente. Essa mensagem NÃO emite um evento.

Quando o próximo comando `prompt` é enviado, todas as mensagens (incluindo `BashExecutionMessage`) são transformadas antes de serem enviadas ao LLM. A `BashExecutionMessage` é convertida em uma `UserMessage` com este formato:

````
Ran `ls -la`
```
total 48
drwxr-xr-x ...
```
````

Isso significa:
1. A saída do bash é incluída no contexto do LLM no **próximo prompt**, não imediatamente
2. Múltiplos comandos bash podem ser executados antes de um prompt; todas as saídas serão incluídas
3. Nenhum evento é emitido para a própria `BashExecutionMessage`

#### abort_bash

Interrompe um comando bash em execução.

```json
{"type": "abort_bash"}
```

Resposta:
```json
{"type": "response", "command": "abort_bash", "success": true}
```

### Sessão

#### get_session_stats

Obtém estatísticas de uso de tokens, custos e uso atual da janela de contexto.

```json
{"type": "get_session_stats"}
```

Resposta:
```json
{
  "type": "response",
  "command": "get_session_stats",
  "success": true,
  "data": {
    "sessionFile": "/path/to/session.jsonl",
    "sessionId": "abc123",
    "userMessages": 5,
    "assistantMessages": 5,
    "toolCalls": 12,
    "toolResults": 12,
    "totalMessages": 22,
    "tokens": {
      "input": 50000,
      "output": 10000,
      "cacheRead": 40000,
      "cacheWrite": 5000,
      "total": 105000
    },
    "cost": 0.45,
    "contextUsage": {
      "tokens": 60000,
      "contextWindow": 200000,
      "percent": 30
    }
  }
}
```

`tokens` contém os totais de uso do assistente para o estado atual da sessão. `contextUsage` contém a estimativa real do uso atual da janela de contexto, utilizada para compactação e exibição no rodapé.

`contextUsage` é omitido quando nenhum modelo ou janela de contexto está disponível. `contextUsage.tokens` e `contextUsage.percent` são `null` imediatamente após a compactação, até que uma resposta válida do assistente pós-compactação forneça dados de uso atualizados.

#### export_html

Exporta a sessão para um arquivo HTML.

```json
{"type": "export_html"}
```

Com caminho personalizado:
```json
{"type": "export_html", "outputPath": "/tmp/session.html"}
```

Resposta:
```json
{
  "type": "response",
  "command": "export_html",
  "success": true,
  "data": {"path": "/tmp/session.html"}
}
```

#### switch_session

Carrega um arquivo de sessão diferente. Pode ser cancelado por um handler de evento de extensão `session_before_switch`.

```json
{"type": "switch_session", "sessionPath": "/path/to/session.jsonl"}
```

Resposta:
```json
{"type": "response", "command": "switch_session", "success": true, "data": {"cancelled": false}}
```

Se uma extensão cancelou a troca:
```json
{"type": "response", "command": "switch_session", "success": true, "data": {"cancelled": true}}
```

#### fork

Cria um novo fork a partir de uma mensagem de usuário anterior no branch ativo. Pode ser cancelado por um handler de evento de extensão `session_before_fork`. Retorna o texto da mensagem a partir da qual está sendo feito o fork.

```json
{"type": "fork", "entryId": "abc123"}
```

Resposta:
```json
{
  "type": "response",
  "command": "fork",
  "success": true,
  "data": {"text": "The original prompt text...", "cancelled": false}
}
```

Se uma extensão cancelou o fork:
```json
{
  "type": "response",
  "command": "fork",
  "success": true,
  "data": {"text": "The original prompt text...", "cancelled": true}
}
```

#### clone

Duplica o branch ativo atual em uma nova sessão na posição atual. Pode ser cancelado por um handler de evento de extensão `session_before_fork`.

```json
{"type": "clone"}
```

Resposta:
```json
{
  "type": "response",
  "command": "clone",
  "success": true,
  "data": {"cancelled": false}
}
```

Se uma extensão cancelou o clone:
```json
{
  "type": "response",
  "command": "clone",
  "success": true,
  "data": {"cancelled": true}
}
```

#### get_fork_messages

Obtém as mensagens de usuário disponíveis para fork.

```json
{"type": "get_fork_messages"}
```

Resposta:
```json
{
  "type": "response",
  "command": "get_fork_messages",
  "success": true,
  "data": {
    "messages": [
      {"entryId": "abc123", "text": "First prompt..."},
      {"entryId": "def456", "text": "Second prompt..."}
    ]
  }
}
```

#### get_last_assistant_text

Obtém o conteúdo de texto da última mensagem do assistente.

```json
{"type": "get_last_assistant_text"}
```

Resposta:
```json
{
  "type": "response",
  "command": "get_last_assistant_text",
  "success": true,
  "data": {"text": "The assistant's response..."}
}
```

Retorna `{"text": null}` se não existirem mensagens do assistente.

#### set_session_name

Define um nome de exibição para a sessão atual. O nome aparece nas listagens de sessão e ajuda a identificá-las.

```json
{"type": "set_session_name", "name": "my-feature-work"}
```

Resposta:
```json
{
  "type": "response",
  "command": "set_session_name",
  "success": true
}
```

O nome atual da sessão está disponível via `get_state` no campo `sessionName`.

### Comandos

#### get_commands

Obtém os comandos disponíveis (comandos de extensão, templates de prompt e skills). Eles podem ser invocados via o comando `prompt` com o prefixo `/`.

```json
{"type": "get_commands"}
```

Resposta:
```json
{
  "type": "response",
  "command": "get_commands",
  "success": true,
  "data": {
    "commands": [
      {"name": "session-name", "description": "Set or clear session name", "source": "extension", "path": "/home/user/.pi/agent/extensions/session.ts"},
      {"name": "fix-tests", "description": "Fix failing tests", "source": "prompt", "location": "project", "path": "/home/user/myproject/.pi/agent/prompts/fix-tests.md"},
      {"name": "skill:brave-search", "description": "Web search via Brave API", "source": "skill", "location": "user", "path": "/home/user/.pi/agent/skills/brave-search/SKILL.md"}
    ]
  }
}
```

Cada comando possui:
- `name`: Nome do comando (invoque com `/name`)
- `description`: Descrição legível por humanos (opcional para comandos de extensão)
- `source`: Tipo do comando:
  - `"extension"`: Registrado via `pi.registerCommand()` em uma extensão
  - `"prompt"`: Carregado de um arquivo de template de prompt `.md`
  - `"skill"`: Carregado de um diretório de skill (o nome é prefixado com `skill:`)
- `location`: De onde foi carregado (opcional, não presente para extensões):
  - `"user"`: Nível de usuário (`~/.pi/agent/`)
  - `"project"`: Nível de projeto (`./.pi/agent/`)
  - `"path"`: Caminho explícito via CLI ou configurações
- `path`: Caminho absoluto do arquivo para a fonte do comando (opcional)

**Nota**: Comandos TUI embutidos (`/settings`, `/hotkeys`, etc.) não são incluídos. Eles são tratados apenas no modo interativo e não seriam executados se enviados via `prompt`.

## Eventos

Os eventos são transmitidos para stdout como linhas JSON durante a operação do agente. Eventos NÃO incluem um campo `id` (somente as respostas incluem).

### Tipos de Evento

| Evento | Descrição |
|-------|-------------|
| `agent_start` | O agente começa a processar |
| `agent_end` | O agente conclui (inclui todas as mensagens geradas) |
| `turn_start` | Um novo turno começa |
| `turn_end` | O turno é concluído (inclui a mensagem do assistente e os resultados das ferramentas) |
| `message_start` | Uma mensagem começa |
| `message_update` | Atualização de streaming (deltas de texto/thinking/toolcall) |
| `message_end` | Uma mensagem é concluída |
| `tool_execution_start` | Uma ferramenta começa a ser executada |
| `tool_execution_update` | Progresso da execução da ferramenta (saída em streaming) |
| `tool_execution_end` | A ferramenta conclui |
| `queue_update` | A fila de direcionamento/acompanhamento pendente foi alterada |
| `compaction_start` | A compactação começa |
| `compaction_end` | A compactação é concluída |
| `auto_retry_start` | Nova tentativa automática começa (após erro transitório) |
| `auto_retry_end` | Nova tentativa automática é concluída (sucesso ou falha final) |
| `extension_error` | Uma extensão lançou um erro |

### agent_start

Emitido quando o agente começa a processar um prompt.

```json
{"type": "agent_start"}
```

### agent_end

Emitido quando o agente conclui. Contém todas as mensagens geradas durante essa execução.

```json
{
  "type": "agent_end",
  "messages": [...]
}
```

### turn_start / turn_end

Um turno consiste em uma resposta do assistente mais quaisquer chamadas de ferramenta e resultados decorrentes.

```json
{"type": "turn_start"}
```

```json
{
  "type": "turn_end",
  "message": {...},
  "toolResults": [...]
}
```

### message_start / message_end

Emitido quando uma mensagem começa e é concluída. O campo `message` contém um `AgentMessage`.

```json
{"type": "message_start", "message": {...}}
{"type": "message_end", "message": {...}}
```

### message_update (Streaming)

Emitido durante o streaming de mensagens do assistente. Contém tanto a mensagem parcial quanto um evento de delta de streaming.

```json
{
  "type": "message_update",
  "message": {...},
  "assistantMessageEvent": {
    "type": "text_delta",
    "contentIndex": 0,
    "delta": "Hello ",
    "partial": {...}
  }
}
```

O campo `assistantMessageEvent` contém um destes tipos de delta:

| Tipo | Descrição |
|------|-------------|
| `start` | Geração de mensagem iniciada |
| `text_start` | Bloco de conteúdo de texto iniciado |
| `text_delta` | Fragmento de conteúdo de texto |
| `text_end` | Bloco de conteúdo de texto encerrado |
| `thinking_start` | Bloco de thinking iniciado |
| `thinking_delta` | Fragmento de conteúdo de thinking |
| `thinking_end` | Bloco de thinking encerrado |
| `toolcall_start` | Chamada de ferramenta iniciada |
| `toolcall_delta` | Fragmento de argumentos da chamada de ferramenta |
| `toolcall_end` | Chamada de ferramenta encerrada (inclui o objeto `toolCall` completo) |
| `done` | Mensagem completa (razão: `"stop"`, `"length"`, `"toolUse"`) |
| `error` | Erro ocorrido (razão: `"aborted"`, `"error"`) |

Exemplo de streaming de uma resposta de texto:
```json
{"type":"message_update","message":{...},"assistantMessageEvent":{"type":"text_start","contentIndex":0,"partial":{...}}}
{"type":"message_update","message":{...},"assistantMessageEvent":{"type":"text_delta","contentIndex":0,"delta":"Hello","partial":{...}}}
{"type":"message_update","message":{...},"assistantMessageEvent":{"type":"text_delta","contentIndex":0,"delta":" world","partial":{...}}}
{"type":"message_update","message":{...},"assistantMessageEvent":{"type":"text_end","contentIndex":0,"content":"Hello world","partial":{...}}}
```

### tool_execution_start / tool_execution_update / tool_execution_end

Emitido quando uma ferramenta começa, transmite progresso e conclui a execução.

```json
{
  "type": "tool_execution_start",
  "toolCallId": "call_abc123",
  "toolName": "bash",
  "args": {"command": "ls -la"}
}
```

Durante a execução, eventos `tool_execution_update` transmitem resultados parciais (ex: saída do bash conforme ela chega):

```json
{
  "type": "tool_execution_update",
  "toolCallId": "call_abc123",
  "toolName": "bash",
  "args": {"command": "ls -la"},
  "partialResult": {
    "content": [{"type": "text", "text": "partial output so far..."}],
    "details": {"truncation": null, "fullOutputPath": null}
  }
}
```

Quando concluído:

```json
{
  "type": "tool_execution_end",
  "toolCallId": "call_abc123",
  "toolName": "bash",
  "result": {
    "content": [{"type": "text", "text": "total 48\n..."}],
    "details": {...}
  },
  "isError": false
}
```

Use `toolCallId` para correlacionar eventos. O `partialResult` em `tool_execution_update` contém a saída acumulada até o momento (não apenas o delta), permitindo que os clientes simplesmente substituam sua exibição a cada atualização.

### queue_update

Emitido sempre que a fila de direcionamento ou acompanhamento pendente é alterada.

```json
{
  "type": "queue_update",
  "steering": ["Focus on error handling"],
  "followUp": ["After that, summarize the result"]
}
```

### compaction_start / compaction_end

Emitido quando a compactação é executada, seja manual ou automática.

```json
{"type": "compaction_start", "reason": "threshold"}
```

O campo `reason` é `"manual"`, `"threshold"` ou `"overflow"`.

```json
{
  "type": "compaction_end",
  "reason": "threshold",
  "result": {
    "summary": "Summary of conversation...",
    "firstKeptEntryId": "abc123",
    "tokensBefore": 150000,
    "details": {}
  },
  "aborted": false,
  "willRetry": false
}
```

Se `reason` era `"overflow"` e a compactação for bem-sucedida, `willRetry` é `true` e o agente tentará automaticamente o prompt novamente.

Se a compactação foi interrompida, `result` é `null` e `aborted` é `true`.

Se a compactação falhou (ex: cota da API excedida), `result` é `null`, `aborted` é `false`, e `errorMessage` contém a descrição do erro.

### auto_retry_start / auto_retry_end

Emitido quando a nova tentativa automática é acionada após um erro transitório (sobrecarga, limite de taxa, erros 5xx).

```json
{
  "type": "auto_retry_start",
  "attempt": 1,
  "maxAttempts": 3,
  "delayMs": 2000,
  "errorMessage": "529 {\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"Overloaded\"}}"
}
```

```json
{
  "type": "auto_retry_end",
  "success": true,
  "attempt": 2
}
```

Na falha final (máximo de tentativas excedido):
```json
{
  "type": "auto_retry_end",
  "success": false,
  "attempt": 3,
  "finalError": "529 overloaded_error: Overloaded"
}
```

### extension_error

Emitido quando uma extensão lança um erro.

```json
{
  "type": "extension_error",
  "extensionPath": "/path/to/extension.ts",
  "event": "tool_call",
  "error": "Error message..."
}
```

## Protocolo de UI de Extensão

Extensões podem solicitar interação do usuário via `ctx.ui.select()`, `ctx.ui.confirm()`, etc. No modo RPC, esses métodos são traduzidos em um subprotocolo de requisição/resposta sobre o fluxo base de comandos/eventos.

Há duas categorias de métodos de UI de extensão:

- **Métodos de diálogo** (`select`, `confirm`, `input`, `editor`): emitem um `extension_ui_request` no stdout e bloqueiam até que o cliente envie de volta um `extension_ui_response` no stdin com o `id` correspondente.
- **Métodos fire-and-forget** (`notify`, `setStatus`, `setWidget`, `setTitle`, `set_editor_text`): emitem um `extension_ui_request` no stdout, mas não esperam uma resposta. O cliente pode exibir a informação ou ignorá-la.

Se um método de diálogo incluir um campo `timeout`, o lado do agente será resolvido automaticamente com um valor padrão quando o timeout expirar. O cliente não precisa rastrear timeouts.

Alguns métodos do `ExtensionUIContext` não são suportados ou são degradados no modo RPC por exigirem acesso direto ao TUI:
- `custom()` retorna `undefined`
- `setWorkingMessage()`, `setWorkingIndicator()`, `setFooter()`, `setHeader()`, `setEditorComponent()`, `setToolsExpanded()` são no-ops
- `getEditorText()` retorna `""`
- `getToolsExpanded()` retorna `false`
- `pasteToEditor()` delega para `setEditorText()` (sem tratamento de paste/collapse)
- `getAllThemes()` retorna `[]`
- `getTheme()` retorna `undefined`
- `setTheme()` retorna `{ success: false, error: "..." }`

Nota: `ctx.hasUI` é `true` no modo RPC porque os métodos de diálogo e fire-and-forget são funcionais via o subprotocolo de UI de extensão.

### Requisições de UI de Extensão (stdout)

Todas as requisições têm `type: "extension_ui_request"`, um `id` único e um campo `method`.

#### select

Solicita que o usuário escolha de uma lista. Métodos de diálogo com um campo `timeout` incluem o timeout em milissegundos; o agente é resolvido automaticamente com `undefined` se o cliente não responder a tempo.

```json
{
  "type": "extension_ui_request",
  "id": "uuid-1",
  "method": "select",
  "title": "Allow dangerous command?",
  "options": ["Allow", "Block"],
  "timeout": 10000
}
```

Resposta esperada: `extension_ui_response` com `value` (a string da opção selecionada) ou `cancelled: true`.

#### confirm

Solicita confirmação sim/não do usuário.

```json
{
  "type": "extension_ui_request",
  "id": "uuid-2",
  "method": "confirm",
  "title": "Clear session?",
  "message": "All messages will be lost.",
  "timeout": 5000
}
```

Resposta esperada: `extension_ui_response` com `confirmed: true/false` ou `cancelled: true`.

#### input

Solicita texto livre do usuário.

```json
{
  "type": "extension_ui_request",
  "id": "uuid-3",
  "method": "input",
  "title": "Enter a value",
  "placeholder": "type something..."
}
```

Resposta esperada: `extension_ui_response` com `value` (o texto digitado) ou `cancelled: true`.

#### editor

Abre um editor de texto multilinha com conteúdo pré-preenchido opcional.

```json
{
  "type": "extension_ui_request",
  "id": "uuid-4",
  "method": "editor",
  "title": "Edit some text",
  "prefill": "Line 1\nLine 2\nLine 3"
}
```

Resposta esperada: `extension_ui_response` com `value` (o texto editado) ou `cancelled: true`.

#### notify

Exibe uma notificação. Fire-and-forget, nenhuma resposta esperada.

```json
{
  "type": "extension_ui_request",
  "id": "uuid-5",
  "method": "notify",
  "message": "Command blocked by user",
  "notifyType": "warning"
}
```

O campo `notifyType` é `"info"`, `"warning"` ou `"error"`. O padrão é `"info"` se omitido.

#### setStatus

Define ou limpa uma entrada de status na barra de rodapé/status. Fire-and-forget.

```json
{
  "type": "extension_ui_request",
  "id": "uuid-6",
  "method": "setStatus",
  "statusKey": "my-ext",
  "statusText": "Turn 3 running..."
}
```

Envie `statusText: undefined` (ou omita) para limpar a entrada de status daquela chave.

#### setWidget

Define ou limpa um widget (bloco de linhas de texto) exibido acima ou abaixo do editor. Fire-and-forget.

```json
{
  "type": "extension_ui_request",
  "id": "uuid-7",
  "method": "setWidget",
  "widgetKey": "my-ext",
  "widgetLines": ["--- My Widget ---", "Line 1", "Line 2"],
  "widgetPlacement": "aboveEditor"
}
```

Envie `widgetLines: undefined` (ou omita) para limpar o widget. O campo `widgetPlacement` é `"aboveEditor"` (padrão) ou `"belowEditor"`. Apenas arrays de strings são suportados no modo RPC; factories de componentes são ignoradas.

#### setTitle

Define o título da janela/aba do terminal. Fire-and-forget.

```json
{
  "type": "extension_ui_request",
  "id": "uuid-8",
  "method": "setTitle",
  "title": "pi - my project"
}
```

#### set_editor_text

Define o texto no editor de entrada. Fire-and-forget.

```json
{
  "type": "extension_ui_request",
  "id": "uuid-9",
  "method": "set_editor_text",
  "text": "prefilled text for the user"
}
```

### Respostas de UI de Extensão (stdin)

As respostas são enviadas apenas para métodos de diálogo (`select`, `confirm`, `input`, `editor`). O `id` deve corresponder ao da requisição.

#### Resposta de valor (select, input, editor)

```json
{"type": "extension_ui_response", "id": "uuid-1", "value": "Allow"}
```

#### Resposta de confirmação (confirm)

```json
{"type": "extension_ui_response", "id": "uuid-2", "confirmed": true}
```

#### Resposta de cancelamento (qualquer diálogo)

Descarta qualquer método de diálogo. A extensão recebe `undefined` (para select/input/editor) ou `false` (para confirm).

```json
{"type": "extension_ui_response", "id": "uuid-3", "cancelled": true}
```

## Tratamento de Erros

Comandos com falha retornam uma resposta com `success: false`:

```json
{
  "type": "response",
  "command": "set_model",
  "success": false,
  "error": "Model not found: invalid/model"
}
```

Erros de parse:

```json
{
  "type": "response",
  "command": "parse",
  "success": false,
  "error": "Failed to parse command: Unexpected token..."
}
```

## Tipos

Arquivos fonte:
- [`packages/ai/src/types.ts`](../../ai/src/types.ts) - `Model`, `UserMessage`, `AssistantMessage`, `ToolResultMessage`
- [`packages/agent/src/types.ts`](../../agent/src/types.ts) - `AgentMessage`, `AgentEvent`
- [`src/core/messages.ts`](../src/core/messages.ts) - `BashExecutionMessage`
- [`src/modes/rpc/rpc-types.ts`](../src/modes/rpc/rpc-types.ts) - Tipos de comando/resposta RPC, tipos de requisição/resposta de UI de extensão

### Model

```json
{
  "id": "claude-sonnet-4-20250514",
  "name": "Claude Sonnet 4",
  "api": "anthropic-messages",
  "provider": "anthropic",
  "baseUrl": "https://api.anthropic.com",
  "reasoning": true,
  "input": ["text", "image"],
  "contextWindow": 200000,
  "maxTokens": 16384,
  "cost": {
    "input": 3.0,
    "output": 15.0,
    "cacheRead": 0.3,
    "cacheWrite": 3.75
  }
}
```

### UserMessage

```json
{
  "role": "user",
  "content": "Hello!",
  "timestamp": 1733234567890,
  "attachments": []
}
```

O campo `content` pode ser uma string ou um array de blocos `TextContent`/`ImageContent`.

### AssistantMessage

```json
{
  "role": "assistant",
  "content": [
    {"type": "text", "text": "Hello! How can I help?"},
    {"type": "thinking", "thinking": "User is greeting me..."},
    {"type": "toolCall", "id": "call_123", "name": "bash", "arguments": {"command": "ls"}}
  ],
  "api": "anthropic-messages",
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "usage": {
    "input": 100,
    "output": 50,
    "cacheRead": 0,
    "cacheWrite": 0,
    "cost": {"input": 0.0003, "output": 0.00075, "cacheRead": 0, "cacheWrite": 0, "total": 0.00105}
  },
  "stopReason": "stop",
  "timestamp": 1733234567890
}
```

Razões de parada: `"stop"`, `"length"`, `"toolUse"`, `"error"`, `"aborted"`

### ToolResultMessage

```json
{
  "role": "toolResult",
  "toolCallId": "call_123",
  "toolName": "bash",
  "content": [{"type": "text", "text": "total 48\ndrwxr-xr-x ..."}],
  "isError": false,
  "timestamp": 1733234567890
}
```

### BashExecutionMessage

Criada pelo comando RPC `bash` (não por chamadas de ferramenta do LLM):

```json
{
  "role": "bashExecution",
  "command": "ls -la",
  "output": "total 48\ndrwxr-xr-x ...",
  "exitCode": 0,
  "cancelled": false,
  "truncated": false,
  "fullOutputPath": null,
  "timestamp": 1733234567890
}
```

### Attachment

```json
{
  "id": "img1",
  "type": "image",
  "fileName": "photo.jpg",
  "mimeType": "image/jpeg",
  "size": 102400,
  "content": "base64-encoded-data...",
  "extractedText": null,
  "preview": null
}
```

## Exemplo: Cliente Básico (Python)

```python
import subprocess
import json

proc = subprocess.Popen(
    ["pi", "--mode", "rpc", "--no-session"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    text=True
)

def send(cmd):
    proc.stdin.write(json.dumps(cmd) + "\n")
    proc.stdin.flush()

def read_events():
    for line in proc.stdout:
        yield json.loads(line)

# Envia prompt
send({"type": "prompt", "message": "Hello!"})

# Processa eventos
for event in read_events():
    if event.get("type") == "message_update":
        delta = event.get("assistantMessageEvent", {})
        if delta.get("type") == "text_delta":
            print(delta["delta"], end="", flush=True)
    
    if event.get("type") == "agent_end":
        print()
        break
```

## Exemplo: Cliente Interativo (Node.js)

Consulte [`test/rpc-example.ts`](../test/rpc-example.ts) para um exemplo interativo completo, ou [`src/modes/rpc/rpc-client.ts`](../src/modes/rpc/rpc-client.ts) para uma implementação tipada do cliente.

Para um exemplo completo de tratamento do protocolo de UI de extensão, veja [`examples/rpc-extension-ui.ts`](../examples/rpc-extension-ui.ts), que funciona em conjunto com a extensão [`examples/extensions/rpc-demo.ts`](../examples/extensions/rpc-demo.ts).

```javascript
const { spawn } = require("child_process");
const { StringDecoder } = require("string_decoder");

const agent = spawn("pi", ["--mode", "rpc", "--no-session"]);

function attachJsonlReader(stream, onLine) {
    const decoder = new StringDecoder("utf8");
    let buffer = "";

    stream.on("data", (chunk) => {
        buffer += typeof chunk === "string" ? chunk : decoder.write(chunk);

        while (true) {
            const newlineIndex = buffer.indexOf("\n");
            if (newlineIndex === -1) break;

            let line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            onLine(line);
        }
    });

    stream.on("end", () => {
        buffer += decoder.end();
        if (buffer.length > 0) {
            onLine(buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer);
        }
    });
}

attachJsonlReader(agent.stdout, (line) => {
    const event = JSON.parse(line);

    if (event.type === "message_update") {
        const { assistantMessageEvent } = event;
        if (assistantMessageEvent.type === "text_delta") {
            process.stdout.write(assistantMessageEvent.delta);
        }
    }
});

// Envia prompt
agent.stdin.write(JSON.stringify({ type: "prompt", message: "Hello" }) + "\n");

// Interrompe com Ctrl+C
process.on("SIGINT", () => {
    agent.stdin.write(JSON.stringify({ type: "abort" }) + "\n");
});
```
