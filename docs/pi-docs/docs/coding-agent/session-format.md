# Formato de Arquivo de Sessão

As sessões são armazenadas como arquivos JSONL (JSON Lines). Cada linha é um objeto JSON com um campo `type`. As entradas de sessão formam uma estrutura em árvore via campos `id`/`parentId`, permitindo branching no local sem criar novos arquivos.

## Localização do Arquivo

```
~/.pi/agent/sessions/--<caminho>--/<timestamp>_<uuid>.jsonl
```

Onde `<caminho>` é o diretório de trabalho com `/` substituído por `-`.

## Excluindo Sessões

As sessões podem ser removidas excluindo seus arquivos `.jsonl` em `~/.pi/agent/sessions/`.

O Pi também suporta a exclusão interativa de sessões a partir de `/resume` (selecione uma sessão e pressione `Ctrl+D`, depois confirme). Quando disponível, o pi usa o CLI `trash` para evitar exclusão permanente.

## Versão de Sessão

As sessões têm um campo de versão no cabeçalho:

- **Versão 1**: Sequência linear de entradas (legado, migrado automaticamente no carregamento)
- **Versão 2**: Estrutura em árvore com vinculação `id`/`parentId`
- **Versão 3**: Renomeou o papel `hookMessage` para `custom` (unificação de extensões)

Sessões existentes são automaticamente migradas para a versão atual (v3) quando carregadas.

## Arquivos Fonte

Fonte no GitHub ([pi-mono](https://github.com/earendil-works/pi-mono)):
- [`packages/coding-agent/src/core/session-manager.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/session-manager.ts) - Tipos de entradas de sessão e SessionManager
- [`packages/coding-agent/src/core/messages.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/messages.ts) - Tipos de mensagem estendidos (BashExecutionMessage, CustomMessage, etc.)
- [`packages/ai/src/types.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/ai/src/types.ts) - Tipos base de mensagem (UserMessage, AssistantMessage, ToolResultMessage)
- [`packages/agent/src/types.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/agent/src/types.ts) - Tipo union AgentMessage

Para definições TypeScript no seu projeto, inspecione `node_modules/@earendil-works/pi-coding-agent/dist/` e `node_modules/@earendil-works/pi-ai/dist/`.

## Tipos de Mensagem

As entradas de sessão contêm objetos `AgentMessage`. Entender esses tipos é essencial para analisar sessões e escrever extensões.

### Blocos de Conteúdo

As mensagens contêm arrays de blocos de conteúdo tipados:

```typescript
interface TextContent {
  type: "text";
  text: string;
}

interface ImageContent {
  type: "image";
  data: string;      // codificado em base64
  mimeType: string;  // ex.: "image/jpeg", "image/png"
}

interface ThinkingContent {
  type: "thinking";
  thinking: string;
}

interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, any>;
}
```

### Tipos Base de Mensagem (de pi-ai)

```typescript
interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;  // Unix ms
}

interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
  api: string;
  provider: string;
  model: string;
  usage: Usage;
  stopReason: "stop" | "length" | "toolUse" | "error" | "aborted";
  errorMessage?: string;
  timestamp: number;
}

interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  details?: any;      // Metadados específicos da ferramenta
  isError: boolean;
  timestamp: number;
}

interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}
```

### Tipos de Mensagem Estendidos (de pi-coding-agent)

```typescript
interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode: number | undefined;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
  excludeFromContext?: boolean;  // true para comandos com prefixo !!
  timestamp: number;
}

interface CustomMessage {
  role: "custom";
  customType: string;            // Identificador de extensão
  content: string | (TextContent | ImageContent)[];
  display: boolean;              // Mostrar no TUI
  details?: any;                 // Metadados específicos da extensão
  timestamp: number;
}

interface BranchSummaryMessage {
  role: "branchSummary";
  summary: string;
  fromId: string;                // Entrada da qual fizemos branch
  timestamp: number;
}

interface CompactionSummaryMessage {
  role: "compactionSummary";
  summary: string;
  tokensBefore: number;
  timestamp: number;
}
```

### Union AgentMessage

```typescript
type AgentMessage =
  | UserMessage
  | AssistantMessage
  | ToolResultMessage
  | BashExecutionMessage
  | CustomMessage
  | BranchSummaryMessage
  | CompactionSummaryMessage;
```

## Base de Entrada

Todas as entradas (exceto `SessionHeader`) estendem `SessionEntryBase`:

```typescript
interface SessionEntryBase {
  type: string;
  id: string;           // ID hexadecimal de 8 caracteres
  parentId: string | null;  // ID da entrada pai (null para a primeira entrada)
  timestamp: string;    // Timestamp ISO
}
```

## Tipos de Entrada

### SessionHeader

Primeira linha do arquivo. Apenas metadados, não faz parte da árvore (sem `id`/`parentId`).

```json
{"type":"session","version":3,"id":"uuid","timestamp":"2024-12-03T14:00:00.000Z","cwd":"/path/to/project"}
```

Para sessões com um pai (criadas via `/fork`, `/clone` ou `newSession({ parentSession })`):

```json
{"type":"session","version":3,"id":"uuid","timestamp":"2024-12-03T14:00:00.000Z","cwd":"/path/to/project","parentSession":"/path/to/original/session.jsonl"}
```

### SessionMessageEntry

Uma mensagem na conversa. O campo `message` contém um `AgentMessage`.

```json
{"type":"message","id":"a1b2c3d4","parentId":"prev1234","timestamp":"2024-12-03T14:00:01.000Z","message":{"role":"user","content":"Hello"}}
{"type":"message","id":"b2c3d4e5","parentId":"a1b2c3d4","timestamp":"2024-12-03T14:00:02.000Z","message":{"role":"assistant","content":[{"type":"text","text":"Hi!"}],"provider":"anthropic","model":"claude-sonnet-4-5","usage":{...},"stopReason":"stop"}}
{"type":"message","id":"c3d4e5f6","parentId":"b2c3d4e5","timestamp":"2024-12-03T14:00:03.000Z","message":{"role":"toolResult","toolCallId":"call_123","toolName":"bash","content":[{"type":"text","text":"output"}],"isError":false}}
```

### ModelChangeEntry

Emitida quando o usuário troca de modelos no meio de uma sessão.

```json
{"type":"model_change","id":"d4e5f6g7","parentId":"c3d4e5f6","timestamp":"2024-12-03T14:05:00.000Z","provider":"openai","modelId":"gpt-4o"}
```

### ThinkingLevelChangeEntry

Emitida quando o usuário altera o nível de raciocínio.

```json
{"type":"thinking_level_change","id":"e5f6g7h8","parentId":"d4e5f6g7","timestamp":"2024-12-03T14:06:00.000Z","thinkingLevel":"high"}
```

### CompactionEntry

Criada quando o contexto é compactado. Armazena um resumo de mensagens anteriores.

```json
{"type":"compaction","id":"f6g7h8i9","parentId":"e5f6g7h8","timestamp":"2024-12-03T14:10:00.000Z","summary":"O usuário discutiu X, Y, Z...","firstKeptEntryId":"c3d4e5f6","tokensBefore":50000}
```

Campos opcionais:
- `details`: Dados específicos da implementação (ex.: `{ readFiles: string[], modifiedFiles: string[] }` para o padrão, ou dados personalizados para extensões)
- `fromHook`: `true` se gerado por uma extensão, `false`/`undefined` se gerado pelo pi (nome de campo legado)

### BranchSummaryEntry

Criada ao alternar branches via `/tree` com um resumo gerado pelo LLM do branch abandonado até o ancestral comum. Captura contexto do caminho abandonado.

```json
{"type":"branch_summary","id":"g7h8i9j0","parentId":"a1b2c3d4","timestamp":"2024-12-03T14:15:00.000Z","fromId":"f6g7h8i9","summary":"O branch explorou a abordagem A..."}
```

Campos opcionais:
- `details`: Dados de rastreamento de arquivos (`{ readFiles: string[], modifiedFiles: string[] }`) para o padrão, ou dados personalizados para extensões
- `fromHook`: `true` se gerado por uma extensão, `false`/`undefined` se gerado pelo pi (nome de campo legado)

### CustomEntry

Persistência de estado de extensão. NÃO participa no contexto do LLM.

```json
{"type":"custom","id":"h8i9j0k1","parentId":"g7h8i9j0","timestamp":"2024-12-03T14:20:00.000Z","customType":"my-extension","data":{"count":42}}
```

Use `customType` para identificar as entradas da sua extensão no recarregamento.

### CustomMessageEntry

Mensagens injetadas por extensão que PARTICIPAM no contexto do LLM.

```json
{"type":"custom_message","id":"i9j0k1l2","parentId":"h8i9j0k1","timestamp":"2024-12-03T14:25:00.000Z","customType":"my-extension","content":"Contexto injetado...","display":true}
```

Campos:
- `content`: String ou `(TextContent | ImageContent)[]` (igual a UserMessage)
- `display`: `true` = mostrar no TUI com estilo distinto, `false` = oculto
- `details`: Metadados opcionais específicos da extensão (não enviados ao LLM)

### LabelEntry

Marcador/bookmark definido pelo usuário em uma entrada.

```json
{"type":"label","id":"j0k1l2m3","parentId":"i9j0k1l2","timestamp":"2024-12-03T14:30:00.000Z","targetId":"a1b2c3d4","label":"checkpoint-1"}
```

Defina `label` como `undefined` para limpar um label.

### SessionInfoEntry

Metadados de sessão (ex.: nome de exibição definido pelo usuário). Definido via comando `/name` ou `pi.setSessionName()` em extensões.

```json
{"type":"session_info","id":"k1l2m3n4","parentId":"j0k1l2m3","timestamp":"2024-12-03T14:35:00.000Z","name":"Refatorar módulo de autenticação"}
```

O nome da sessão é exibido no seletor de sessões (`/resume`) em vez da primeira mensagem quando definido.

## Estrutura em Árvore

As entradas formam uma árvore:
- A primeira entrada tem `parentId: null`
- Cada entrada subsequente aponta para seu pai via `parentId`
- O branching cria novos filhos a partir de uma entrada anterior
- A "folha" é a posição atual na árvore

```
[msg usuário] ─── [assistente] ─── [msg usuário] ─── [assistente] ─┬─ [msg usuário] ← folha atual
                                                                    │
                                                                    └─ [resumo de branch] ─── [msg usuário] ← branch alternativo
```

## Construção do Contexto

`buildSessionContext()` percorre da folha atual até a raiz, produzindo a lista de mensagens para o LLM:

1. Coleta todas as entradas no caminho
2. Extrai as configurações de modelo e nível de raciocínio atuais
3. Se uma `CompactionEntry` estiver no caminho:
   - Emite o resumo primeiro
   - Depois as mensagens de `firstKeptEntryId` até a compactação
   - Depois as mensagens após a compactação
4. Converte `BranchSummaryEntry` e `CustomMessageEntry` para formatos de mensagem apropriados

## Exemplo de Análise

```typescript
import { readFileSync } from "fs";

const lines = readFileSync("session.jsonl", "utf8").trim().split("\n");

for (const line of lines) {
  const entry = JSON.parse(line);

  switch (entry.type) {
    case "session":
      console.log(`Sessão v${entry.version ?? 1}: ${entry.id}`);
      break;
    case "message":
      console.log(`[${entry.id}] ${entry.message.role}: ${JSON.stringify(entry.message.content)}`);
      break;
    case "compaction":
      console.log(`[${entry.id}] Compactação: ${entry.tokensBefore} tokens resumidos`);
      break;
    case "branch_summary":
      console.log(`[${entry.id}] Branch de ${entry.fromId}`);
      break;
    case "custom":
      console.log(`[${entry.id}] Personalizado (${entry.customType}): ${JSON.stringify(entry.data)}`);
      break;
    case "custom_message":
      console.log(`[${entry.id}] Mensagem de extensão (${entry.customType}): ${entry.content}`);
      break;
    case "label":
      console.log(`[${entry.id}] Label "${entry.label}" em ${entry.targetId}`);
      break;
    case "model_change":
      console.log(`[${entry.id}] Modelo: ${entry.provider}/${entry.modelId}`);
      break;
    case "thinking_level_change":
      console.log(`[${entry.id}] Raciocínio: ${entry.thinkingLevel}`);
      break;
  }
}
```

## API do SessionManager

Métodos principais para trabalhar com sessões programaticamente.

### Métodos Estáticos de Criação
- `SessionManager.create(cwd, sessionDir?)` - Nova sessão
- `SessionManager.open(path, sessionDir?)` - Abrir arquivo de sessão existente
- `SessionManager.continueRecent(cwd, sessionDir?)` - Continuar a mais recente ou criar nova
- `SessionManager.inMemory(cwd?)` - Sem persistência em arquivo
- `SessionManager.forkFrom(sourcePath, targetCwd, sessionDir?)` - Fazer fork de sessão de outro projeto

### Métodos Estáticos de Listagem
- `SessionManager.list(cwd, sessionDir?, onProgress?)` - Listar sessões de um diretório
- `SessionManager.listAll(onProgress?)` - Listar todas as sessões de todos os projetos

### Métodos de Instância - Gerenciamento de Sessão
- `newSession(options?)` - Iniciar nova sessão (opções: `{ parentSession?: string }`)
- `setSessionFile(path)` - Alternar para um arquivo de sessão diferente
- `createBranchedSession(leafId)` - Extrair branch para novo arquivo de sessão

### Métodos de Instância - Adição (todos retornam ID de entrada)
- `appendMessage(message)` - Adicionar mensagem
- `appendThinkingLevelChange(level)` - Registrar mudança de raciocínio
- `appendModelChange(provider, modelId)` - Registrar mudança de modelo
- `appendCompaction(summary, firstKeptEntryId, tokensBefore, details?, fromHook?)` - Adicionar compactação
- `appendCustomEntry(customType, data?)` - Estado de extensão (não no contexto)
- `appendSessionInfo(name)` - Definir nome de exibição da sessão
- `appendCustomMessageEntry(customType, content, display, details?)` - Mensagem de extensão (no contexto)
- `appendLabelChange(targetId, label)` - Definir/limpar label

### Métodos de Instância - Navegação em Árvore
- `getLeafId()` - Posição atual
- `getLeafEntry()` - Obter entrada de folha atual
- `getEntry(id)` - Obter entrada por ID
- `getBranch(fromId?)` - Percorrer da entrada até a raiz
- `getTree()` - Obter estrutura completa da árvore
- `getChildren(parentId)` - Obter filhos diretos
- `getLabel(id)` - Obter label para entrada
- `branch(entryId)` - Mover folha para entrada anterior
- `resetLeaf()` - Resetar folha para null (antes de qualquer entrada)
- `branchWithSummary(entryId, summary, details?, fromHook?)` - Branch com resumo de contexto

### Métodos de Instância - Contexto e Informações
- `buildSessionContext()` - Obter mensagens, thinkingLevel e modelo para LLM
- `getEntries()` - Todas as entradas (excluindo cabeçalho)
- `getHeader()` - Metadados do cabeçalho de sessão
- `getSessionName()` - Obter nome de exibição da última entrada session_info
- `getCwd()` - Diretório de trabalho
- `getSessionDir()` - Diretório de armazenamento de sessão
- `getSessionId()` - UUID da sessão
- `getSessionFile()` - Caminho do arquivo de sessão (undefined para em memória)
- `isPersisted()` - Se a sessão está salva em disco
