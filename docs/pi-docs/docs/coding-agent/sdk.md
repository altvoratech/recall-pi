> O pi pode ajudá-lo a usar o SDK. Peça a ele para construir uma integração para o seu caso de uso.

# SDK

O SDK fornece acesso programático às capacidades do agente pi. Use-o para incorporar o pi em outras aplicações, construir interfaces personalizadas ou integrar com fluxos de trabalho automatizados.

**Exemplos de casos de uso:**
- Construir uma interface personalizada (web, desktop, mobile)
- Integrar capacidades do agente em aplicações existentes
- Criar pipelines automatizados com raciocínio do agente
- Construir ferramentas personalizadas que criam sub-agentes
- Testar o comportamento do agente de forma programática

Veja [examples/sdk/](../examples/sdk/) para exemplos funcionais, do mínimo ao controle total.

## Início Rápido

```typescript
import { AuthStorage, createAgentSession, ModelRegistry, SessionManager } from "@earendil-works/pi-coding-agent";

// Configura o armazenamento de credenciais e o registro de modelos
const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);

const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  authStorage,
  modelRegistry,
});

session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await session.prompt("What files are in the current directory?");
```

## Instalação

```bash
npm install @earendil-works/pi-coding-agent
```

O SDK está incluído no pacote principal. Nenhuma instalação separada é necessária.

## Conceitos Principais

### createAgentSession()

A função de fábrica principal para criar uma única `AgentSession`.

`createAgentSession()` usa um `ResourceLoader` para fornecer extensões, skills, templates de prompt, temas e arquivos de contexto. Se você não fornecer um, ele usa o `DefaultResourceLoader` com descoberta padrão.

```typescript
import { createAgentSession } from "@earendil-works/pi-coding-agent";

// Mínimo: padrões com DefaultResourceLoader
const { session } = await createAgentSession();

// Personalizado: substitui opções específicas
const { session } = await createAgentSession({
  model: myModel,
  tools: [readTool, bashTool],
  sessionManager: SessionManager.inMemory(),
});
```

### AgentSession

A sessão gerencia o ciclo de vida do agente, histórico de mensagens, estado do modelo, compactação e streaming de eventos.

```typescript
interface AgentSession {
  // Envia um prompt e aguarda a conclusão
  prompt(text: string, options?: PromptOptions): Promise<void>;

  // Enfileira mensagens durante o streaming
  steer(text: string): Promise<void>;
  followUp(text: string): Promise<void>;

  // Assina eventos (retorna função para cancelar a assinatura)
  subscribe(listener: (event: AgentSessionEvent) => void): () => void;

  // Informações da sessão
  sessionFile: string | undefined;
  sessionId: string;

  // Controle do modelo
  setModel(model: Model): Promise<void>;
  setThinkingLevel(level: ThinkingLevel): void;
  cycleModel(): Promise<ModelCycleResult | undefined>;
  cycleThinkingLevel(): ThinkingLevel | undefined;

  // Acesso ao estado
  agent: Agent;
  model: Model | undefined;
  thinkingLevel: ThinkingLevel;
  messages: AgentMessage[];
  isStreaming: boolean;

  // Navegação na árvore dentro do arquivo de sessão atual
  navigateTree(targetId: string, options?: { summarize?: boolean; customInstructions?: string; replaceInstructions?: boolean; label?: string }): Promise<{ editorText?: string; cancelled: boolean }>;

  // Compactação
  compact(customInstructions?: string): Promise<CompactionResult>;
  abortCompaction(): void;

  // Aborta a operação atual
  abort(): Promise<void>;

  // Limpeza
  dispose(): void;
}
```

As APIs de substituição de sessão, como new-session, resume, fork e import, estão no `AgentSessionRuntime`, não no `AgentSession`.

### createAgentSessionRuntime() e AgentSessionRuntime

Use a API de runtime quando precisar substituir a sessão ativa e reconstruir o estado de runtime vinculado ao diretório de trabalho.
Esta é a mesma camada usada pelos modos interativo, print e RPC embutidos.

`createAgentSessionRuntime()` recebe uma fábrica de runtime mais o cwd/destino de sessão inicial. A fábrica captura entradas fixas globais do processo, recria serviços vinculados ao cwd efetivo, resolve as opções de sessão contra esses serviços e retorna um resultado de runtime completo.

```typescript
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({
      services,
      sessionManager,
      sessionStartEvent,
    })),
    services,
    diagnostics: services.diagnostics,
  };
};

const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});
```

O `AgentSessionRuntime` gerencia a substituição do runtime ativo por meio de:

- `newSession()`
- `switchSession()`
- `fork()`
- fluxos de clone via `fork(entryId, { position: "at" })`
- `importFromJsonl()`

Comportamento importante:

- `runtime.session` muda após essas operações
- assinaturas de eventos são vinculadas a um `AgentSession` específico, então re-assine após a substituição
- se você usa extensões, chame `runtime.session.bindExtensions(...)` novamente para a nova sessão
- a criação retorna diagnósticos em `runtime.diagnostics`
- se a criação ou substituição do runtime falhar, o método lança uma exceção e o chamador decide como tratá-la

```typescript
let session = runtime.session;
let unsubscribe = session.subscribe(() => {});

await runtime.newSession();

unsubscribe();
session = runtime.session;
unsubscribe = session.subscribe(() => {});
```

### Prompts e Enfileiramento de Mensagens

`PromptOptions` controla a expansão de prompts, o comportamento de enfileiramento durante o streaming e as notificações de preflight do prompt:

```typescript
interface PromptOptions {
  expandPromptTemplates?: boolean;
  images?: ImageContent[];
  streamingBehavior?: "steer" | "followUp";
  source?: InputSource;
  preflightResult?: (success: boolean) => void;
}
```

`preflightResult` é chamado uma vez por invocação de `prompt()`:

- `true` quando o prompt foi aceito, enfileirado ou tratado imediatamente
- `false` quando o preflight do prompt foi rejeitado antes da aceitação

Ele é disparado antes de `prompt()` resolver. `prompt()` ainda resolve apenas após a execução completa aceita terminar, incluindo tentativas. Falhas após a aceitação são reportadas pelo fluxo normal de eventos e mensagens, não por `preflightResult(false)`.

O método `prompt()` lida com templates de prompt, comandos de extensão e envio de mensagens:

```typescript
// Prompt básico (quando não está em streaming)
await session.prompt("What files are here?");

// Com imagens
await session.prompt("What's in this image?", {
  images: [{ type: "image", source: { type: "base64", mediaType: "image/png", data: "..." } }]
});

// Durante o streaming: deve especificar como enfileirar a mensagem
await session.prompt("Stop and do this instead", { streamingBehavior: "steer" });
await session.prompt("After you're done, also check X", { streamingBehavior: "followUp" });
```

**Comportamento:**
- **Comandos de extensão** (ex: `/meucomando`): Executados imediatamente, mesmo durante o streaming. Eles gerenciam sua própria interação com o LLM via `pi.sendMessage()`.
- **Templates de prompt baseados em arquivo** (de arquivos `.md`): Expandidos para seu conteúdo antes de enviar ou enfileirar.
- **Durante o streaming sem `streamingBehavior`**: Lança um erro. Use `steer()` ou `followUp()` diretamente, ou especifique a opção.
- **`preflightResult(true)`**: Significa que o prompt foi aceito, enfileirado ou tratado imediatamente.
- **`preflightResult(false)`**: Significa que o preflight rejeitou antes da aceitação.

Para enfileiramento explícito durante o streaming:

```typescript
// Enfileira uma mensagem de direcionamento para entrega após o turno atual do assistente finalizar suas chamadas de ferramenta
await session.steer("New instruction");

// Aguarda o agente terminar (entregue apenas quando o agente para)
await session.followUp("After you're done, also do this");
```

Tanto `steer()` quanto `followUp()` expandem templates de prompt baseados em arquivo, mas geram erro em comandos de extensão (comandos de extensão não podem ser enfileirados).

### Agent e AgentState

A classe `Agent` (de `@earendil-works/pi-agent-core`) lida com a interação principal com o LLM. Acesse-a via `session.agent`.

```typescript
// Acessa o estado atual
const state = session.agent.state;

// state.messages: AgentMessage[] - histórico da conversa
// state.model: Model - modelo atual
// state.thinkingLevel: ThinkingLevel - nível de raciocínio atual
// state.systemPrompt: string - prompt do sistema
// state.tools: AgentTool[] - ferramentas disponíveis
// state.streamingMessage?: AgentMessage - mensagem parcial atual do assistente
// state.errorMessage?: string - último erro do assistente

// Substitui mensagens (útil para branching ou restauração)
session.agent.state.messages = messages; // copia o array de nível superior

// Substitui ferramentas
session.agent.state.tools = tools; // copia o array de nível superior

// Aguarda o agente terminar o processamento
await session.agent.waitForIdle();
```

### Eventos

Assine eventos para receber saída de streaming e notificações de ciclo de vida.

```typescript
session.subscribe((event) => {
  switch (event.type) {
    // Texto em streaming do assistente
    case "message_update":
      if (event.assistantMessageEvent.type === "text_delta") {
        process.stdout.write(event.assistantMessageEvent.delta);
      }
      if (event.assistantMessageEvent.type === "thinking_delta") {
        // Saída de raciocínio (se o thinking estiver habilitado)
      }
      break;
    
    // Execução de ferramenta
    case "tool_execution_start":
      console.log(`Tool: ${event.toolName}`);
      break;
    case "tool_execution_update":
      // Saída de ferramenta em streaming
      break;
    case "tool_execution_end":
      console.log(`Result: ${event.isError ? "error" : "success"}`);
      break;
    
    // Ciclo de vida da mensagem
    case "message_start":
      // Nova mensagem iniciando
      break;
    case "message_end":
      // Mensagem concluída
      break;
    
    // Ciclo de vida do agente
    case "agent_start":
      // Agente começou a processar o prompt
      break;
    case "agent_end":
      // Agente terminou (event.messages contém as novas mensagens)
      break;
    
    // Ciclo de vida do turno (uma resposta do LLM + chamadas de ferramenta)
    case "turn_start":
      break;
    case "turn_end":
      // event.message: resposta do assistente
      // event.toolResults: resultados de ferramentas deste turno
      break;
    
    // Eventos de sessão (fila, compactação, retry)
    case "queue_update":
      console.log(event.steering, event.followUp);
      break;
    case "compaction_start":
    case "compaction_end":
    case "auto_retry_start":
    case "auto_retry_end":
      break;
  }
});
```

## Referência de Opções

### Diretórios

```typescript
const { session } = await createAgentSession({
  // Diretório de trabalho para descoberta pelo DefaultResourceLoader
  cwd: process.cwd(), // padrão
  
  // Diretório de configuração global
  agentDir: "~/.pi/agent", // padrão (expande ~)
});
```

`cwd` é usado pelo `DefaultResourceLoader` para:
- Extensões do projeto (`.pi/extensions/`)
- Skills do projeto:
  - `.pi/skills/`
  - `.agents/skills/` no `cwd` e diretórios ancestrais (até a raiz do repositório git, ou a raiz do sistema de arquivos quando não estiver em um repositório)
- Prompts do projeto (`.pi/prompts/`)
- Arquivos de contexto (`AGENTS.md` percorrendo a partir do cwd)
- Nomenclatura do diretório de sessão

`agentDir` é usado pelo `DefaultResourceLoader` para:
- Extensões globais (`extensions/`)
- Skills globais:
  - `skills/` sob `agentDir` (por exemplo `~/.pi/agent/skills/`)
  - `~/.agents/skills/`
- Prompts globais (`prompts/`)
- Arquivo de contexto global (`AGENTS.md`)
- Configurações (`settings.json`)
- Modelos personalizados (`models.json`)
- Credenciais (`auth.json`)
- Sessões (`sessions/`)

Quando você passa um `ResourceLoader` personalizado, `cwd` e `agentDir` não controlam mais a descoberta de recursos. Eles ainda influenciam a nomenclatura de sessões e a resolução de caminhos de ferramentas.

### Modelo

```typescript
import { getModel } from "@earendil-works/pi-ai";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";

const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);

// Encontra modelo embutido específico (não verifica se a chave de API existe)
const opus = getModel("anthropic", "claude-opus-4-5");
if (!opus) throw new Error("Model not found");

// Encontra qualquer modelo por provedor/id, incluindo modelos personalizados de models.json
// (não verifica se a chave de API existe)
const customModel = modelRegistry.find("my-provider", "my-model");

// Obtém apenas modelos com chaves de API válidas configuradas
const available = await modelRegistry.getAvailable();

const { session } = await createAgentSession({
  model: opus,
  thinkingLevel: "medium", // off, minimal, low, medium, high, xhigh
  
  // Modelos para ciclagem (Ctrl+P no modo interativo)
  scopedModels: [
    { model: opus, thinkingLevel: "high" },
    { model: haiku, thinkingLevel: "off" },
  ],
  
  authStorage,
  modelRegistry,
});
```

Se nenhum modelo for fornecido:
1. Tenta restaurar da sessão (se estiver continuando)
2. Usa o padrão das configurações
3. Recorre ao primeiro modelo disponível

> Veja [examples/sdk/02-custom-model.ts](../examples/sdk/02-custom-model.ts)

### Chaves de API e OAuth

Prioridade de resolução de chave de API (gerenciada pelo AuthStorage):
1. Substituições em tempo de execução (via `setRuntimeApiKey`, não persistidas)
2. Credenciais armazenadas em `auth.json` (chaves de API ou tokens OAuth)
3. Variáveis de ambiente (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.)
4. Resolver de fallback (para chaves de provedores personalizados de `models.json`)

```typescript
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";

// Padrão: usa ~/.pi/agent/auth.json e ~/.pi/agent/models.json
const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);

const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  authStorage,
  modelRegistry,
});

// Substituição de chave de API em tempo de execução (não persistida em disco)
authStorage.setRuntimeApiKey("anthropic", "sk-my-temp-key");

// Local personalizado para armazenamento de auth
const customAuth = AuthStorage.create("/my/app/auth.json");
const customRegistry = ModelRegistry.create(customAuth, "/my/app/models.json");

const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  authStorage: customAuth,
  modelRegistry: customRegistry,
});

// Sem models.json personalizado (apenas modelos embutidos)
const simpleRegistry = ModelRegistry.inMemory(authStorage);
```

> Veja [examples/sdk/09-api-keys-and-oauth.ts](../examples/sdk/09-api-keys-and-oauth.ts)

### Prompt do Sistema

Use um `ResourceLoader` para substituir o prompt do sistema:

```typescript
import { createAgentSession, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({
  systemPromptOverride: () => "You are a helpful assistant.",
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

> Veja [examples/sdk/03-custom-prompt.ts](../examples/sdk/03-custom-prompt.ts)

### Ferramentas

```typescript
import {
  codingTools,   // read, bash, edit, write (padrão)
  readOnlyTools, // read, grep, find, ls
  readTool, bashTool, editTool, writeTool,
  grepTool, findTool, lsTool,
} from "@earendil-works/pi-coding-agent";

// Usa o conjunto de ferramentas embutido
const { session } = await createAgentSession({
  tools: readOnlyTools,
});

// Seleciona ferramentas específicas
const { session } = await createAgentSession({
  tools: [readTool, bashTool, grepTool],
});
```

#### Ferramentas com cwd Personalizado

**Importante:** As instâncias de ferramentas pré-construídas (`readTool`, `bashTool`, etc.) usam `process.cwd()` para resolução de caminhos. Quando você especifica um `cwd` personalizado E fornece `tools` explícitas, deve usar as funções de fábrica de ferramentas para garantir que os caminhos sejam resolvidos corretamente:

```typescript
import {
  createCodingTools,    // Cria [read, bash, edit, write] para um cwd específico
  createReadOnlyTools,  // Cria [read, grep, find, ls] para um cwd específico
  createReadTool,
  createBashTool,
  createEditTool,
  createWriteTool,
  createGrepTool,
  createFindTool,
  createLsTool,
} from "@earendil-works/pi-coding-agent";

const cwd = "/path/to/project";

// Usa fábrica para conjuntos de ferramentas
const { session } = await createAgentSession({
  cwd,
  tools: createCodingTools(cwd),  // Ferramentas resolvem caminhos relativos ao cwd
});

// Ou seleciona ferramentas específicas
const { session } = await createAgentSession({
  cwd,
  tools: [createReadTool(cwd), createBashTool(cwd), createGrepTool(cwd)],
});
```

**Quando não é necessário usar fábricas:**
- Se você omitir `tools`, o pi as cria automaticamente com o `cwd` correto
- Se você usar `process.cwd()` como seu `cwd`, as instâncias pré-construídas funcionam normalmente

**Quando é obrigatório usar fábricas:**
- Quando você especifica tanto `cwd` (diferente de `process.cwd()`) quanto `tools`

> Veja [examples/sdk/05-tools.ts](../examples/sdk/05-tools.ts)

### Ferramentas Personalizadas

```typescript
import { Type } from "typebox";
import { createAgentSession, defineTool } from "@earendil-works/pi-coding-agent";

// Ferramenta personalizada inline
const myTool = defineTool({
  name: "my_tool",
  label: "My Tool",
  description: "Does something useful",
  parameters: Type.Object({
    input: Type.String({ description: "Input value" }),
  }),
  execute: async (_toolCallId, params) => ({
    content: [{ type: "text", text: `Result: ${params.input}` }],
    details: {},
  }),
});

// Passa ferramentas personalizadas diretamente
const { session } = await createAgentSession({
  customTools: [myTool],
});
```

Use `defineTool()` para definições independentes e arrays como `customTools: [myTool]`. O `pi.registerTool({ ... })` inline já infere os tipos de parâmetros corretamente.

Ferramentas personalizadas passadas via `customTools` são combinadas com ferramentas registradas por extensões. Extensões carregadas pelo ResourceLoader também podem registrar ferramentas via `pi.registerTool()`.

> Veja [examples/sdk/05-tools.ts](../examples/sdk/05-tools.ts)

### Extensões

Extensões são carregadas pelo `ResourceLoader`. O `DefaultResourceLoader` descobre extensões em `~/.pi/agent/extensions/`, `.pi/extensions/` e fontes de extensões em settings.json.

```typescript
import { createAgentSession, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({
  additionalExtensionPaths: ["/path/to/my-extension.ts"],
  extensionFactories: [
    (pi) => {
      pi.on("agent_start", () => {
        console.log("[Inline Extension] Agent starting");
      });
    },
  ],
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

Extensões podem registrar ferramentas, assinar eventos, adicionar comandos e muito mais. Veja [extensions.md](extensions.md) para a API completa.

**Event Bus:** Extensões podem se comunicar via `pi.events`. Passe um `eventBus` compartilhado ao `DefaultResourceLoader` se precisar emitir ou ouvir de fora:

```typescript
import { createEventBus, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

const eventBus = createEventBus();
const loader = new DefaultResourceLoader({
  eventBus,
});
await loader.reload();

eventBus.on("my-extension:status", (data) => console.log(data));
```

> Veja [examples/sdk/06-extensions.ts](../examples/sdk/06-extensions.ts) e [docs/extensions.md](extensions.md)

### Skills

```typescript
import {
  createAgentSession,
  DefaultResourceLoader,
  type Skill,
} from "@earendil-works/pi-coding-agent";

const customSkill: Skill = {
  name: "my-skill",
  description: "Custom instructions",
  filePath: "/path/to/SKILL.md",
  baseDir: "/path/to",
  source: "custom",
};

const loader = new DefaultResourceLoader({
  skillsOverride: (current) => ({
    skills: [...current.skills, customSkill],
    diagnostics: current.diagnostics,
  }),
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

> Veja [examples/sdk/04-skills.ts](../examples/sdk/04-skills.ts)

### Arquivos de Contexto

```typescript
import { createAgentSession, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({
  agentsFilesOverride: (current) => ({
    agentsFiles: [
      ...current.agentsFiles,
      { path: "/virtual/AGENTS.md", content: "# Guidelines\n\n- Be concise" },
    ],
  }),
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

> Veja [examples/sdk/07-context-files.ts](../examples/sdk/07-context-files.ts)

### Comandos Slash

```typescript
import {
  createAgentSession,
  DefaultResourceLoader,
  type PromptTemplate,
} from "@earendil-works/pi-coding-agent";

const customCommand: PromptTemplate = {
  name: "deploy",
  description: "Deploy the application",
  source: "(custom)",
  content: "# Deploy\n\n1. Build\n2. Test\n3. Deploy",
};

const loader = new DefaultResourceLoader({
  promptsOverride: (current) => ({
    prompts: [...current.prompts, customCommand],
    diagnostics: current.diagnostics,
  }),
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

> Veja [examples/sdk/08-prompt-templates.ts](../examples/sdk/08-prompt-templates.ts)

### Gerenciamento de Sessões

As sessões usam uma estrutura de árvore com vínculos por `id`/`parentId`, permitindo branching no mesmo lugar.

```typescript
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSession,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

// Em memória (sem persistência)
const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
});

// Nova sessão persistente
const { session: persisted } = await createAgentSession({
  sessionManager: SessionManager.create(process.cwd()),
});

// Continua a mais recente
const { session: continued, modelFallbackMessage } = await createAgentSession({
  sessionManager: SessionManager.continueRecent(process.cwd()),
});
if (modelFallbackMessage) {
  console.log("Note:", modelFallbackMessage);
}

// Abre arquivo específico
const { session: opened } = await createAgentSession({
  sessionManager: SessionManager.open("/path/to/session.jsonl"),
});

// Lista sessões
const currentProjectSessions = await SessionManager.list(process.cwd());
const allSessions = await SessionManager.listAll(process.cwd());

// API de substituição de sessão para /new, /resume, /fork, /clone e fluxos de import.
const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({
      services,
      sessionManager,
      sessionStartEvent,
    })),
    services,
    diagnostics: services.diagnostics,
  };
};

const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});

// Substitui a sessão ativa por uma nova
await runtime.newSession();

// Substitui a sessão ativa por outra sessão salva
await runtime.switchSession("/path/to/session.jsonl");

// Substitui a sessão ativa por um fork a partir de uma entrada de usuário específica
await runtime.fork("entry-id");

// Clona o caminho ativo passando por uma entrada específica
await runtime.fork("entry-id", { position: "at" });
```

**API de árvore do SessionManager:**

```typescript
const sm = SessionManager.open("/path/to/session.jsonl");

// Listagem de sessões
const currentProjectSessions = await SessionManager.list(process.cwd());
const allSessions = await SessionManager.listAll(process.cwd());

// Travessia da árvore
const entries = sm.getEntries();        // Todas as entradas (exclui cabeçalho)
const tree = sm.getTree();              // Estrutura completa da árvore
const path = sm.getPath();              // Caminho da raiz até a folha atual
const leaf = sm.getLeafEntry();         // Entrada de folha atual
const entry = sm.getEntry(id);          // Obtém entrada por ID
const children = sm.getChildren(id);    // Filhos diretos da entrada

// Labels
const label = sm.getLabel(id);          // Obtém label da entrada
sm.appendLabelChange(id, "checkpoint"); // Define label

// Branching
sm.branch(entryId);                     // Move a folha para uma entrada anterior
sm.branchWithSummary(id, "Summary...");  // Branch com resumo de contexto
sm.createBranchedSession(leafId);       // Extrai caminho para novo arquivo
```

> Veja [examples/sdk/11-sessions.ts](../examples/sdk/11-sessions.ts) e [Formato de Sessão](session-format.md)

### Gerenciamento de Configurações

```typescript
import { createAgentSession, SettingsManager, SessionManager } from "@earendil-works/pi-coding-agent";

// Padrão: carrega de arquivos (global + projeto mesclados)
const { session } = await createAgentSession({
  settingsManager: SettingsManager.create(),
});

// Com substituições
const settingsManager = SettingsManager.create();
settingsManager.applyOverrides({
  compaction: { enabled: false },
  retry: { enabled: true, maxRetries: 5 },
});

const { session } = await createAgentSession({ settingsManager });

// Em memória (sem I/O de arquivo, para testes)
const { session } = await createAgentSession({
  settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
  sessionManager: SessionManager.inMemory(),
});

// Diretórios personalizados
const { session } = await createAgentSession({
  settingsManager: SettingsManager.create("/custom/cwd", "/custom/agent"),
});
```

**Fábricas estáticas:**
- `SettingsManager.create(cwd?, agentDir?)` - Carrega de arquivos
- `SettingsManager.inMemory(settings?)` - Sem I/O de arquivo

**Configurações específicas do projeto:**

As configurações são carregadas de dois locais e mescladas:
1. Global: `~/.pi/agent/settings.json`
2. Projeto: `<cwd>/.pi/settings.json`

O projeto substitui o global. Objetos aninhados mesclam as chaves. Os setters modificam as configurações globais por padrão.

**Semântica de persistência e tratamento de erros:**

- Os getters/setters de configurações são síncronos para o estado em memória.
- Os setters enfileiram gravações de persistência de forma assíncrona.
- Chame `await settingsManager.flush()` quando precisar de um limite de durabilidade (por exemplo, antes do processo encerrar ou antes de verificar o conteúdo de arquivos em testes).
- O `SettingsManager` não exibe erros de I/O de configurações. Use `settingsManager.drainErrors()` e reporte-os na camada da sua aplicação.

> Veja [examples/sdk/10-settings.ts](../examples/sdk/10-settings.ts)

## ResourceLoader

Use o `DefaultResourceLoader` para descobrir extensões, skills, prompts, temas e arquivos de contexto.

```typescript
import {
  DefaultResourceLoader,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({
  cwd,
  agentDir: getAgentDir(),
});
await loader.reload();

const extensions = loader.getExtensions();
const skills = loader.getSkills();
const prompts = loader.getPrompts();
const themes = loader.getThemes();
const contextFiles = loader.getAgentsFiles().agentsFiles;
```

## Valor de Retorno

`createAgentSession()` retorna:

```typescript
interface CreateAgentSessionResult {
  // A sessão
  session: AgentSession;
  
  // Resultado das extensões (para configuração do runner)
  extensionsResult: LoadExtensionsResult;
  
  // Aviso se o modelo da sessão não pôde ser restaurado
  modelFallbackMessage?: string;
}

interface LoadExtensionsResult {
  extensions: Extension[];
  errors: Array<{ path: string; error: string }>;
  runtime: ExtensionRuntime;
}
```

## Exemplo Completo

```typescript
import { getModel } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import {
  AuthStorage,
  bashTool,
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  ModelRegistry,
  readTool,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

// Configura o armazenamento de auth (local personalizado)
const authStorage = AuthStorage.create("/custom/agent/auth.json");

// Substituição de chave de API em tempo de execução (não persistida)
if (process.env.MY_KEY) {
  authStorage.setRuntimeApiKey("anthropic", process.env.MY_KEY);
}

// Registro de modelos (sem models.json personalizado)
const modelRegistry = ModelRegistry.create(authStorage);

// Ferramenta inline
const statusTool = defineTool({
  name: "status",
  label: "Status",
  description: "Get system status",
  parameters: Type.Object({}),
  execute: async () => ({
    content: [{ type: "text", text: `Uptime: ${process.uptime()}s` }],
    details: {},
  }),
});

const model = getModel("anthropic", "claude-opus-4-5");
if (!model) throw new Error("Model not found");

// Configurações em memória com substituições
const settingsManager = SettingsManager.inMemory({
  compaction: { enabled: false },
  retry: { enabled: true, maxRetries: 2 },
});

const loader = new DefaultResourceLoader({
  cwd: process.cwd(),
  agentDir: "/custom/agent",
  settingsManager,
  systemPromptOverride: () => "You are a minimal assistant. Be concise.",
});
await loader.reload();

const { session } = await createAgentSession({
  cwd: process.cwd(),
  agentDir: "/custom/agent",

  model,
  thinkingLevel: "off",
  authStorage,
  modelRegistry,

  tools: [readTool, bashTool],
  customTools: [statusTool],
  resourceLoader: loader,

  sessionManager: SessionManager.inMemory(),
  settingsManager,
});

session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await session.prompt("Get status and list files.");
```

## Modos de Execução

O SDK exporta utilitários de modo de execução para construir interfaces personalizadas sobre `createAgentSession()`:

### InteractiveMode

Modo interativo TUI completo com editor, histórico de chat e todos os comandos embutidos:

```typescript
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  InteractiveMode,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent })),
    services,
    diagnostics: services.diagnostics,
  };
};
const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});

const mode = new InteractiveMode(runtime, {
  migratedProviders: [],
  modelFallbackMessage: undefined,
  initialMessage: "Hello",
  initialImages: [],
  initialMessages: [],
});

await mode.run();
```

### runPrintMode

Modo de execução única: envia prompts, exibe o resultado e encerra:

```typescript
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  runPrintMode,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent })),
    services,
    diagnostics: services.diagnostics,
  };
};
const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});

await runPrintMode(runtime, {
  mode: "text",
  initialMessage: "Hello",
  initialImages: [],
  messages: ["Follow up"],
});
```

### runRpcMode

Modo JSON-RPC para integração via subprocesso:

```typescript
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  runRpcMode,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent })),
    services,
    diagnostics: services.diagnostics,
  };
};
const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});

await runRpcMode(runtime);
```

Veja a [documentação do RPC](rpc.md) para o protocolo JSON.

## Alternativa ao Modo RPC

Para integração baseada em subprocesso sem precisar compilar com o SDK, use o CLI diretamente:

```bash
pi --mode rpc --no-session
```

Veja a [documentação do RPC](rpc.md) para o protocolo JSON.

O SDK é preferível quando:
- Você quer segurança de tipos
- Você está no mesmo processo Node.js
- Você precisa de acesso direto ao estado do agente
- Você quer personalizar ferramentas/extensões de forma programática

O modo RPC é preferível quando:
- Você está integrando a partir de outra linguagem
- Você quer isolamento de processos
- Você está construindo um cliente agnóstico de linguagem

## Exportações

O ponto de entrada principal exporta:

```typescript
// Fábrica
createAgentSession
createAgentSessionRuntime
AgentSessionRuntime

// Auth e Modelos
AuthStorage
ModelRegistry

// Carregamento de recursos
DefaultResourceLoader
type ResourceLoader
createEventBus

// Utilitários
defineTool

// Gerenciamento de sessões
SessionManager
SettingsManager

// Ferramentas embutidas (usam process.cwd())
codingTools
readOnlyTools
readTool, bashTool, editTool, writeTool
grepTool, findTool, lsTool

// Fábricas de ferramentas (para cwd personalizado)
createCodingTools
createReadOnlyTools
createReadTool, createBashTool, createEditTool, createWriteTool
createGrepTool, createFindTool, createLsTool

// Tipos
type CreateAgentSessionOptions
type CreateAgentSessionResult
type ExtensionFactory
type ExtensionAPI
type ToolDefinition
type Skill
type PromptTemplate
type Tool
```

Para tipos de extensão, veja [extensions.md](extensions.md) para a API completa.
