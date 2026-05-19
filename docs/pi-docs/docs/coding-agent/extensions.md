> o pi pode criar extensões. Peça para ele construir uma para o seu caso de uso.

# Extensões

Extensões são módulos TypeScript que estendem o comportamento do pi. Elas podem se inscrever em eventos de ciclo de vida, registrar ferramentas personalizadas chamáveis pelo LLM, adicionar comandos e muito mais.

> **Posicionamento para /reload:** Coloque as extensões em `~/.pi/agent/extensions/` (global) ou `.pi/extensions/` (local do projeto) para auto-descoberta. Use `pi -e ./path.ts` apenas para testes rápidos. Extensões em locais auto-descobertos podem ser recarregadas a quente com `/reload`.

**Principais capacidades:**
- **Ferramentas personalizadas** - Registre ferramentas que o LLM pode chamar via `pi.registerTool()`
- **Interceptação de eventos** - Bloqueie ou modifique chamadas de ferramentas, injete contexto, personalize a compactação
- **Interação com o usuário** - Solicite entradas do usuário via `ctx.ui` (select, confirm, input, notify)
- **Componentes de UI personalizados** - Componentes TUI completos com entrada de teclado via `ctx.ui.custom()` para interações complexas
- **Comandos personalizados** - Registre comandos como `/mycommand` via `pi.registerCommand()`
- **Persistência de sessão** - Armazene estado que sobrevive a reinicializações via `pi.appendEntry()`
- **Renderização personalizada** - Controle como chamadas/resultados de ferramentas e mensagens aparecem na TUI

**Exemplos de casos de uso:**
- Gates de permissão (confirmar antes de `rm -rf`, `sudo`, etc.)
- Checkpointing do Git (stash a cada turno, restaurar ao fazer branch)
- Proteção de caminhos (bloquear escritas em `.env`, `node_modules/`)
- Compactação personalizada (resumir a conversa do seu jeito)
- Resumos de conversa (veja o exemplo `summarize.ts`)
- Ferramentas interativas (perguntas, wizards, diálogos personalizados)
- Ferramentas com estado (listas de tarefas, pools de conexão)
- Integrações externas (file watchers, webhooks, gatilhos de CI)
- Jogos enquanto você espera (veja o exemplo `snake.ts`)

Veja [examples/extensions/](../examples/extensions/) para implementações funcionais.

## Índice

- [Início Rápido](#quick-start)
- [Localizações de Extensões](#extension-locations)
- [Imports Disponíveis](#available-imports)
- [Escrevendo uma Extensão](#writing-an-extension)
  - [Estilos de Extensão](#extension-styles)
- [Eventos](#events)
  - [Visão Geral do Ciclo de Vida](#lifecycle-overview)
  - [Eventos de Recurso](#resource-events)
  - [Eventos de Sessão](#session-events)
  - [Eventos de Agente](#agent-events)
  - [Eventos de Modelo](#model-events)
  - [Eventos de Ferramenta](#tool-events)
- [ExtensionContext](#extensioncontext)
- [ExtensionCommandContext](#extensioncommandcontext)
- [Métodos da ExtensionAPI](#extensionapi-methods)
- [Gerenciamento de Estado](#state-management)
- [Ferramentas Personalizadas](#custom-tools)
- [UI Personalizada](#custom-ui)
- [Tratamento de Erros](#error-handling)
- [Comportamento por Modo](#mode-behavior)
- [Referência de Exemplos](#examples-reference)

## Início Rápido

Crie `~/.pi/agent/extensions/my-extension.ts`:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  // Reage a eventos
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("Extension loaded!", "info");
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" && event.input.command?.includes("rm -rf")) {
      const ok = await ctx.ui.confirm("Dangerous!", "Allow rm -rf?");
      if (!ok) return { block: true, reason: "Blocked by user" };
    }
  });

  // Registra uma ferramenta personalizada
  pi.registerTool({
    name: "greet",
    label: "Greet",
    description: "Greet someone by name",
    parameters: Type.Object({
      name: Type.String({ description: "Name to greet" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return {
        content: [{ type: "text", text: `Hello, ${params.name}!` }],
        details: {},
      };
    },
  });

  // Registra um comando
  pi.registerCommand("hello", {
    description: "Say hello",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Hello ${args || "world"}!`, "info");
    },
  });
}
```

Teste com a flag `--extension` (ou `-e`):

```bash
pi -e ./my-extension.ts
```

## Localizações de Extensões

> **Segurança:** Extensões rodam com todas as suas permissões de sistema e podem executar código arbitrário. Instale apenas de fontes em que você confia.

Extensões são auto-descobertas a partir de:

| Localização | Escopo |
|----------|-------|
| `~/.pi/agent/extensions/*.ts` | Global (todos os projetos) |
| `~/.pi/agent/extensions/*/index.ts` | Global (subdiretório) |
| `.pi/extensions/*.ts` | Local do projeto |
| `.pi/extensions/*/index.ts` | Local do projeto (subdiretório) |

Caminhos adicionais via `settings.json`:

```json
{
  "packages": [
    "npm:@foo/bar@1.0.0",
    "git:github.com/user/repo@v1"
  ],
  "extensions": [
    "/path/to/local/extension.ts",
    "/path/to/local/extension/dir"
  ]
}
```

Para compartilhar extensões via npm ou git como pacotes pi, veja [packages.md](packages.md).

## Imports Disponíveis

| Pacote | Propósito |
|---------|---------|
| `@earendil-works/pi-coding-agent` | Tipos de extensão (`ExtensionAPI`, `ExtensionContext`, eventos) |
| `typebox` | Definições de schema para parâmetros de ferramentas |
| `@earendil-works/pi-ai` | Utilitários de IA (`StringEnum` para enums compatíveis com o Google) |
| `@earendil-works/pi-tui` | Componentes TUI para renderização personalizada |

Dependências npm também funcionam. Adicione um `package.json` ao lado da sua extensão (ou em um diretório pai), execute `npm install`, e imports de `node_modules/` são resolvidos automaticamente.

Para pacotes pi distribuídos instalados com `pi install` (npm ou git), as deps de runtime devem estar em `dependencies`. A instalação de pacotes usa instalações de produção (`npm install --omit=dev`) por padrão, então `devDependencies` não estão disponíveis em runtime; quando `npmCommand` está configurado, pacotes git usam `install` simples para compatibilidade com wrappers.

Built-ins do Node.js (`node:fs`, `node:path`, etc.) também estão disponíveis.

## Escrevendo uma Extensão

Uma extensão exporta uma factory function padrão que recebe `ExtensionAPI`. A factory pode ser síncrona ou assíncrona:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Inscreve-se em eventos
  pi.on("event_name", async (event, ctx) => {
    // ctx.ui para interação com o usuário
    const ok = await ctx.ui.confirm("Title", "Are you sure?");
    ctx.ui.notify("Done!", "success");
    ctx.ui.setStatus("my-ext", "Processing...");  // Status no rodapé
    ctx.ui.setWidget("my-ext", ["Line 1", "Line 2"]);  // Widget acima do editor (padrão)
  });

  // Registra ferramentas, comandos, atalhos, flags
  pi.registerTool({ ... });
  pi.registerCommand("name", { ... });
  pi.registerShortcut("ctrl+x", { ... });
  pi.registerFlag("my-flag", { ... });
}
```

Extensões são carregadas via [jiti](https://github.com/unjs/jiti), então TypeScript funciona sem compilação.

Se a factory retornar uma `Promise`, o pi aguarda sua conclusão antes de continuar a inicialização. Isso significa que a inicialização assíncrona é concluída antes de `session_start`, antes de `resources_discover`, e antes que os registros de provedores enfileirados via `pi.registerProvider()` sejam descarregados.

### Factory functions assíncronas

Use uma factory assíncrona para trabalho único de inicialização, como buscar configuração remota ou descobrir dinamicamente os modelos disponíveis.

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default async function (pi: ExtensionAPI) {
  const response = await fetch("http://localhost:1234/v1/models");
  const payload = (await response.json()) as {
    data: Array<{
      id: string;
      name?: string;
      context_window?: number;
      max_tokens?: number;
    }>;
  };

  pi.registerProvider("local-openai", {
    baseUrl: "http://localhost:1234/v1",
    apiKey: "LOCAL_OPENAI_API_KEY",
    api: "openai-completions",
    models: payload.data.map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: model.context_window ?? 128000,
      maxTokens: model.max_tokens ?? 4096,
    })),
  });
}
```

Esse padrão torna os modelos buscados disponíveis durante a inicialização normal e para `pi --list-models`.

### Estilos de Extensão

**Arquivo único** - mais simples, para extensões pequenas:

```
~/.pi/agent/extensions/
└── my-extension.ts
```

**Diretório com index.ts** - para extensões com múltiplos arquivos:

```
~/.pi/agent/extensions/
└── my-extension/
    ├── index.ts        # Ponto de entrada (exporta a função padrão)
    ├── tools.ts        # Módulo auxiliar
    └── utils.ts        # Módulo auxiliar
```

**Pacote com dependências** - para extensões que precisam de pacotes npm:

```
~/.pi/agent/extensions/
└── my-extension/
    ├── package.json    # Declara dependências e pontos de entrada
    ├── package-lock.json
    ├── node_modules/   # Após npm install
    └── src/
        └── index.ts
```

```json
// package.json
{
  "name": "my-extension",
  "dependencies": {
    "zod": "^3.0.0",
    "chalk": "^5.0.0"
  },
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
```

Execute `npm install` no diretório da extensão, então imports de `node_modules/` funcionam automaticamente.

## Eventos

### Visão Geral do Ciclo de Vida

```
pi inicia
  │
  ├─► session_start { reason: "startup" }
  └─► resources_discover { reason: "startup" }
      │
      ▼
usuário envia prompt ──────────────────────────────────────┐
  │                                                        │
  ├─► (comandos de extensão verificados primeiro, ignora se encontrado)  │
  ├─► input (pode interceptar, transformar ou tratar)      │
  ├─► (expansão de skill/template se não tratado)          │
  ├─► before_agent_start (pode injetar mensagem, modificar system prompt)
  ├─► agent_start                                          │
  ├─► message_start / message_update / message_end         │
  │                                                        │
  │   ┌─── turn (repete enquanto o LLM chama ferramentas) ───┐       │
  │   │                                            │       │
  │   ├─► turn_start                               │       │
  │   ├─► context (pode modificar mensagens)       │       │
  │   ├─► before_provider_request (pode inspecionar ou substituir payload)
  │   ├─► after_provider_response (status + headers, antes de consumir o stream)
  │   │                                            │       │
  │   │   LLM responde, pode chamar ferramentas:   │       │
  │   │     ├─► tool_execution_start               │       │
  │   │     ├─► tool_call (pode bloquear)          │       │
  │   │     ├─► tool_execution_update              │       │
  │   │     ├─► tool_result (pode modificar)       │       │
  │   │     └─► tool_execution_end                 │       │
  │   │                                            │       │
  │   └─► turn_end                                 │       │
  │                                                        │
  └─► agent_end                                            │
                                                           │
usuário envia outro prompt ◄────────────────────────────────┘

/new (nova sessão) ou /resume (trocar sessão)
  ├─► session_before_switch (pode cancelar)
  ├─► session_shutdown
  ├─► session_start { reason: "new" | "resume", previousSessionFile? }
  └─► resources_discover { reason: "startup" }

/fork ou /clone
  ├─► session_before_fork (pode cancelar)
  ├─► session_shutdown
  ├─► session_start { reason: "fork", previousSessionFile }
  └─► resources_discover { reason: "startup" }

/compact ou auto-compactação
  ├─► session_before_compact (pode cancelar ou personalizar)
  └─► session_compact

navegação /tree
  ├─► session_before_tree (pode cancelar ou personalizar)
  └─► session_tree

/model ou Ctrl+P (seleção/ciclagem de modelo)
  ├─► thinking_level_select (se a troca de modelo alterar/limitar o nível de thinking)
  └─► model_select

mudanças de nível de thinking (settings, keybinding, pi.setThinkingLevel())
  └─► thinking_level_select

saída (Ctrl+C, Ctrl+D, SIGHUP, SIGTERM)
  └─► session_shutdown
```

### Eventos de Recurso

#### resources_discover

Disparado após `session_start` para que extensões possam contribuir com caminhos adicionais de skills, prompts e temas.
O caminho de inicialização usa `reason: "startup"`. O reload usa `reason: "reload"`.

```typescript
pi.on("resources_discover", async (event, _ctx) => {
  // event.cwd - diretório de trabalho atual
  // event.reason - "startup" | "reload"
  return {
    skillPaths: ["/path/to/skills"],
    promptPaths: ["/path/to/prompts"],
    themePaths: ["/path/to/themes"],
  };
});
```

### Eventos de Sessão

Veja [Formato de Sessão](session-format.md) para detalhes internos de armazenamento de sessão e a API do SessionManager.

#### session_start

Disparado quando uma sessão é iniciada, carregada ou recarregada.

```typescript
pi.on("session_start", async (event, ctx) => {
  // event.reason - "startup" | "reload" | "new" | "resume" | "fork"
  // event.previousSessionFile - presente para "new", "resume" e "fork"
  ctx.ui.notify(`Session: ${ctx.sessionManager.getSessionFile() ?? "ephemeral"}`, "info");
});
```

#### session_before_switch

Disparado antes de iniciar uma nova sessão (`/new`) ou trocar de sessões (`/resume`).

```typescript
pi.on("session_before_switch", async (event, ctx) => {
  // event.reason - "new" ou "resume"
  // event.targetSessionFile - sessão para a qual estamos trocando (apenas para "resume")

  if (event.reason === "new") {
    const ok = await ctx.ui.confirm("Clear?", "Delete all messages?");
    if (!ok) return { cancel: true };
  }
});
```

Após uma troca bem-sucedida ou ação de nova sessão, o pi emite `session_shutdown` para a instância antiga da extensão, recarrega e revincula extensões para a nova sessão, e então emite `session_start` com `reason: "new" | "resume"` e `previousSessionFile`.
Faça o trabalho de limpeza em `session_shutdown`, e então restabeleça qualquer estado em memória em `session_start`.

#### session_before_fork

Disparado ao fazer fork via `/fork` ou clone via `/clone`.

```typescript
pi.on("session_before_fork", async (event, ctx) => {
  // event.entryId - ID da entrada selecionada
  // event.position - "before" para /fork, "at" para /clone
  return { cancel: true }; // Cancela fork/clone
  // OU
  return { skipConversationRestore: true }; // Reservado para controle futuro de restauração de conversa
});
```

Após um fork ou clone bem-sucedido, o pi emite `session_shutdown` para a instância antiga da extensão, recarrega e revincula extensões para a nova sessão, e então emite `session_start` com `reason: "fork"` e `previousSessionFile`.
Faça o trabalho de limpeza em `session_shutdown`, e então restabeleça qualquer estado em memória em `session_start`.

#### session_before_compact / session_compact

Disparado na compactação. Veja [compaction.md](compaction.md) para detalhes.

```typescript
pi.on("session_before_compact", async (event, ctx) => {
  const { preparation, branchEntries, customInstructions, signal } = event;

  // Cancelar:
  return { cancel: true };

  // Resumo personalizado:
  return {
    compaction: {
      summary: "...",
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
    }
  };
});

pi.on("session_compact", async (event, ctx) => {
  // event.compactionEntry - a compactação salva
  // event.fromExtension - se a extensão a forneceu
});
```

#### session_before_tree / session_tree

Disparado na navegação `/tree`. Veja [Sessões](sessions.md) para conceitos de navegação em árvore.

```typescript
pi.on("session_before_tree", async (event, ctx) => {
  const { preparation, signal } = event;
  return { cancel: true };
  // OU forneça um resumo personalizado:
  return { summary: { summary: "...", details: {} } };
});

pi.on("session_tree", async (event, ctx) => {
  // event.newLeafId, oldLeafId, summaryEntry, fromExtension
});
```

#### session_shutdown

Disparado antes de um runtime de extensão ser desmontado.

```typescript
pi.on("session_shutdown", async (event, ctx) => {
  // event.reason - "quit" | "reload" | "new" | "resume" | "fork"
  // event.targetSessionFile - sessão de destino para fluxos de substituição de sessão
  // Limpeza, salvar estado, etc.
});
```

### Eventos de Agente

#### before_agent_start

Disparado após o usuário enviar o prompt, antes do loop do agente. Pode injetar uma mensagem e/ou modificar o system prompt.

```typescript
pi.on("before_agent_start", async (event, ctx) => {
  // event.prompt - texto do prompt do usuário
  // event.images - imagens anexadas (se houver)
  // event.systemPrompt - system prompt encadeado atual para este handler
  //   (inclui mudanças de handlers before_agent_start anteriores)
  // event.systemPromptOptions - opções estruturadas usadas para construir o system prompt
  //   .customPrompt - qualquer system prompt personalizado (de --system-prompt, SYSTEM.md, ou templates personalizados)
  //   .selectedTools - ferramentas atualmente ativas no prompt
  //   .toolSnippets - descrições de uma linha para cada ferramenta
  //   .promptGuidelines - bullets de diretrizes personalizadas
  //   .appendSystemPrompt - texto das flags --append-system-prompt
  //   .cwd - diretório de trabalho
  //   .contextFiles - arquivos AGENTS.md e outros arquivos de contexto carregados
  //   .skills - skills carregadas

  return {
    // Injeta uma mensagem persistente (armazenada na sessão, enviada ao LLM)
    message: {
      customType: "my-extension",
      content: "Additional context for the LLM",
      display: true,
    },
    // Substitui o system prompt para este turno (encadeado entre extensões)
    systemPrompt: event.systemPrompt + "\n\nExtra instructions for this turn...",
  };
});
```

O campo `systemPromptOptions` dá às extensões acesso aos mesmos dados estruturados que o Pi usa para construir o system prompt. Isso permite inspecionar o que o Pi carregou — prompts personalizados, diretrizes, snippets de ferramentas, arquivos de contexto, skills — sem redescobrir recursos ou reanalisar flags. Use-o quando sua extensão precisar fazer mudanças profundas e informadas no system prompt, respeitando a configuração fornecida pelo usuário.

Dentro de `before_agent_start`, `event.systemPrompt` e `ctx.getSystemPrompt()` ambos refletem o system prompt encadeado a partir do handler atual. Handlers `before_agent_start` posteriores ainda podem modificá-lo novamente.

#### agent_start / agent_end

Disparado uma vez por prompt do usuário.

```typescript
pi.on("agent_start", async (_event, ctx) => {});

pi.on("agent_end", async (event, ctx) => {
  // event.messages - mensagens deste prompt
});
```

#### turn_start / turn_end

Disparado para cada turno (uma resposta do LLM + chamadas de ferramentas).

```typescript
pi.on("turn_start", async (event, ctx) => {
  // event.turnIndex, event.timestamp
});

pi.on("turn_end", async (event, ctx) => {
  // event.turnIndex, event.message, event.toolResults
});
```

#### message_start / message_update / message_end

Disparado para atualizações de ciclo de vida de mensagens.

- `message_start` e `message_end` disparam para mensagens de user, assistant e toolResult.
- `message_update` dispara para atualizações de streaming do assistant.
- Handlers de `message_end` podem retornar `{ message }` para substituir a mensagem finalizada. A substituição deve manter o mesmo `role`.

```typescript
pi.on("message_start", async (event, ctx) => {
  // event.message
});

pi.on("message_update", async (event, ctx) => {
  // event.message
  // event.assistantMessageEvent (evento de stream token a token)
});

pi.on("message_end", async (event, ctx) => {
  if (event.message.role !== "assistant") return;

  return {
    message: {
      ...event.message,
      usage: {
        ...event.message.usage,
        cost: {
          ...event.message.usage.cost,
          total: 0.123,
        },
      },
    },
  };
});
```

#### tool_execution_start / tool_execution_update / tool_execution_end

Disparado para atualizações de ciclo de vida de execução de ferramentas.

No modo de ferramentas paralelas:
- `tool_execution_start` é emitido na ordem de origem do assistant durante a fase de preflight
- eventos `tool_execution_update` podem se intercalar entre ferramentas
- `tool_execution_end` é emitido na ordem de conclusão das ferramentas após cada ferramenta ser finalizada
- eventos finais de mensagem `toolResult` ainda são emitidos depois na ordem de origem do assistant

```typescript
pi.on("tool_execution_start", async (event, ctx) => {
  // event.toolCallId, event.toolName, event.args
});

pi.on("tool_execution_update", async (event, ctx) => {
  // event.toolCallId, event.toolName, event.args, event.partialResult
});

pi.on("tool_execution_end", async (event, ctx) => {
  // event.toolCallId, event.toolName, event.result, event.isError
});
```

#### context

Disparado antes de cada chamada ao LLM. Modifique mensagens de forma não destrutiva. Veja [Formato de Sessão](session-format.md) para tipos de mensagem.

```typescript
pi.on("context", async (event, ctx) => {
  // event.messages - cópia profunda, seguro para modificar
  const filtered = event.messages.filter(m => !shouldPrune(m));
  return { messages: filtered };
});
```

#### before_provider_request

Disparado depois que o payload específico do provedor é construído, logo antes de a requisição ser enviada. Os handlers rodam na ordem de carregamento das extensões. Retornar `undefined` mantém o payload inalterado. Retornar qualquer outro valor substitui o payload para os handlers posteriores e para a requisição real.

Este hook pode reescrever instruções de sistema em nível de provedor ou removê-las inteiramente. Essas mudanças em nível de payload não são refletidas por `ctx.getSystemPrompt()`, que reporta a string do system prompt do Pi em vez do payload final serializado do provedor.

```typescript
pi.on("before_provider_request", (event, ctx) => {
  console.log(JSON.stringify(event.payload, null, 2));

  // Opcional: substituir o payload
  // return { ...event.payload, temperature: 0 };
});
```

Isso é principalmente útil para depurar a serialização do provedor e o comportamento de cache.

#### after_provider_response

Disparado depois que uma resposta HTTP é recebida e antes que seu corpo de stream seja consumido. Os handlers rodam na ordem de carregamento das extensões.

```typescript
pi.on("after_provider_response", (event, ctx) => {
  // event.status - código de status HTTP
  // event.headers - headers de resposta normalizados
  if (event.status === 429) {
    console.log("rate limited", event.headers["retry-after"]);
  }
});
```

A disponibilidade de headers depende do provedor e do transporte. Provedores que abstraem respostas HTTP podem não expor headers.

### Eventos de Modelo

#### model_select

Disparado quando o modelo muda via comando `/model`, ciclagem de modelo (`Ctrl+P`) ou restauração de sessão.

```typescript
pi.on("model_select", async (event, ctx) => {
  // event.model - modelo recém-selecionado
  // event.previousModel - modelo anterior (undefined se for a primeira seleção)
  // event.source - "set" | "cycle" | "restore"

  const prev = event.previousModel
    ? `${event.previousModel.provider}/${event.previousModel.id}`
    : "none";
  const next = `${event.model.provider}/${event.model.id}`;

  ctx.ui.notify(`Model changed (${event.source}): ${prev} -> ${next}`, "info");
});
```

Use isso para atualizar elementos de UI (barras de status, rodapés) ou realizar inicialização específica de modelo quando o modelo ativo muda.

#### thinking_level_select

Disparado quando o nível de thinking muda. Isso é apenas notificação; valores de retorno do handler são ignorados.

```typescript
pi.on("thinking_level_select", async (event, ctx) => {
  // event.level - nível de thinking recém-selecionado
  // event.previousLevel - nível de thinking anterior

  ctx.ui.setStatus("thinking", `thinking: ${event.level}`);
});
```

Use isso para atualizar a UI da extensão quando `pi.setThinkingLevel()`, mudanças de modelo, ou controles internos de nível de thinking alterarem o nível de thinking ativo.

### Eventos de Ferramenta

#### tool_call

Disparado após `tool_execution_start`, antes de a ferramenta executar. **Pode bloquear.** Use `isToolCallEventType` para refinar e obter inputs tipados.

Antes de `tool_call` rodar, o pi aguarda que os eventos de Agente emitidos anteriormente terminem de drenar através do `AgentSession`. Isso significa que `ctx.sessionManager` está atualizado até a mensagem de chamada de ferramenta do assistant atual.

No modo padrão de execução paralela de ferramentas, chamadas de ferramentas irmãs da mesma mensagem do assistant são pré-validadas sequencialmente, e então executadas concorrentemente. Não há garantia de que `tool_call` veja resultados de ferramentas irmãs dessa mesma mensagem do assistant em `ctx.sessionManager`.

`event.input` é mutável. Mute-o no local para corrigir os argumentos da ferramenta antes da execução.

Garantias de comportamento:
- Mutações em `event.input` afetam a execução real da ferramenta
- Handlers `tool_call` posteriores veem mutações feitas por handlers anteriores
- Nenhuma revalidação é realizada após sua mutação
- Valores de retorno de `tool_call` só controlam o bloqueio via `{ block: true, reason?: string }`

```typescript
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

pi.on("tool_call", async (event, ctx) => {
  // event.toolName - "bash", "read", "write", "edit", etc.
  // event.toolCallId
  // event.input - parâmetros da ferramenta (mutável)

  // Ferramentas built-in: nenhum parâmetro de tipo necessário
  if (isToolCallEventType("bash", event)) {
    // event.input é { command: string; timeout?: number }
    event.input.command = `source ~/.profile\n${event.input.command}`;

    if (event.input.command.includes("rm -rf")) {
      return { block: true, reason: "Dangerous command" };
    }
  }

  if (isToolCallEventType("read", event)) {
    // event.input é { path: string; offset?: number; limit?: number }
    console.log(`Reading: ${event.input.path}`);
  }
});
```

#### Tipando input de ferramenta personalizada

Ferramentas personalizadas devem exportar seu tipo de input:

```typescript
// my-extension.ts
export type MyToolInput = Static<typeof myToolSchema>;
```

Use `isToolCallEventType` com parâmetros de tipo explícitos:

```typescript
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import type { MyToolInput } from "my-extension";

pi.on("tool_call", (event) => {
  if (isToolCallEventType<"my_tool", MyToolInput>("my_tool", event)) {
    event.input.action;  // tipado
  }
});
```

#### tool_result

Disparado depois que a execução da ferramenta termina e antes que `tool_execution_end` e os eventos finais de mensagem de resultado da ferramenta sejam emitidos. **Pode modificar o resultado.**

No modo de ferramentas paralelas, `tool_result` e `tool_execution_end` podem se intercalar na ordem de conclusão das ferramentas, enquanto os eventos finais de mensagem `toolResult` ainda são emitidos depois na ordem de origem do assistant.

Handlers de `tool_result` encadeiam como middleware:
- Os handlers rodam na ordem de carregamento das extensões
- Cada handler vê o resultado mais recente após as mudanças do handler anterior
- Handlers podem retornar patches parciais (`content`, `details` ou `isError`); campos omitidos mantêm seus valores atuais

Use `ctx.signal` para trabalho assíncrono aninhado dentro do handler. Isso permite que Esc cancele chamadas de modelo, `fetch()`, e outras operações cientes de abort iniciadas pela extensão.

```typescript
import { isBashToolResult } from "@earendil-works/pi-coding-agent";

pi.on("tool_result", async (event, ctx) => {
  // event.toolName, event.toolCallId, event.input
  // event.content, event.details, event.isError

  if (isBashToolResult(event)) {
    // event.details é tipado como BashToolDetails
  }

  const response = await fetch("https://example.com/summarize", {
    method: "POST",
    body: JSON.stringify({ content: event.content }),
    signal: ctx.signal,
  });

  // Modifica o resultado:
  return { content: [...], details: {...}, isError: false };
});
```

### Eventos de Bash do Usuário

#### user_bash

Disparado quando o usuário executa comandos `!` ou `!!`. **Pode interceptar.**

```typescript
import { createLocalBashOperations } from "@earendil-works/pi-coding-agent";

pi.on("user_bash", (event, ctx) => {
  // event.command - o comando bash
  // event.excludeFromContext - true se prefixo !!
  // event.cwd - diretório de trabalho

  // Opção 1: Fornecer operações personalizadas (ex: SSH)
  return { operations: remoteBashOps };

  // Opção 2: Encapsular o backend de bash local built-in do pi
  const local = createLocalBashOperations();
  return {
    operations: {
      exec(command, cwd, options) {
        return local.exec(`source ~/.profile\n${command}`, cwd, options);
      }
    }
  };

  // Opção 3: Substituição completa - retornar o resultado diretamente
  return { result: { output: "...", exitCode: 0, cancelled: false, truncated: false } };
});
```

### Eventos de Input

#### input

Disparado quando a entrada do usuário é recebida, depois que os comandos de extensão são verificados mas antes da expansão de skill e template. O evento vê o texto de entrada bruto, então `/skill:foo` e `/template` ainda não foram expandidos.

**Ordem de processamento:**
1. Comandos de extensão (`/cmd`) verificados primeiro - se encontrados, o handler roda e o evento de input é ignorado
2. Evento `input` dispara - pode interceptar, transformar ou tratar
3. Se não tratado: comandos de skill (`/skill:name`) expandidos para o conteúdo da skill
4. Se não tratado: prompt templates (`/template`) expandidos para o conteúdo do template
5. O processamento do agente começa (`before_agent_start`, etc.)

```typescript
pi.on("input", async (event, ctx) => {
  // event.text - entrada bruta (antes da expansão de skill/template)
  // event.images - imagens anexadas, se houver
  // event.source - "interactive" (digitado), "rpc" (API), ou "extension" (via sendUserMessage)

  // Transformar: reescrever a entrada antes da expansão
  if (event.text.startsWith("?quick "))
    return { action: "transform", text: `Respond briefly: ${event.text.slice(7)}` };

  // Tratar: responder sem o LLM (a extensão mostra seu próprio feedback)
  if (event.text === "ping") {
    ctx.ui.notify("pong", "info");
    return { action: "handled" };
  }

  // Rotear por origem: pular processamento para mensagens injetadas por extensão
  if (event.source === "extension") return { action: "continue" };

  // Interceptar comandos de skill antes da expansão
  if (event.text.startsWith("/skill:")) {
    // Pode transformar, bloquear ou deixar passar
  }

  return { action: "continue" };  // Padrão: passar adiante para a expansão
});
```

**Resultados:**
- `continue` - passa adiante inalterado (padrão se o handler não retornar nada)
- `transform` - modifica texto/imagens, então continua para a expansão
- `handled` - pula o agente inteiramente (o primeiro handler que retornar isso vence)

Transformações encadeiam entre handlers. Veja [input-transform.ts](../examples/extensions/input-transform.ts).

## ExtensionContext

Todos os handlers recebem `ctx: ExtensionContext`.

### ctx.ui

Métodos de UI para interação com o usuário. Veja [UI Personalizada](#custom-ui) para detalhes completos.

### ctx.hasUI

`false` no modo print (`-p`) e no modo JSON. `true` no modo interativo e RPC. No modo RPC, métodos de diálogo (`select`, `confirm`, `input`, `editor`) funcionam via o subprotocolo de UI de extensão, e métodos fire-and-forget (`notify`, `setStatus`, `setWidget`, `setTitle`, `setEditorText`) emitem requisições ao cliente. Alguns métodos específicos da TUI são no-ops ou retornam padrões (veja [rpc.md](rpc.md#extension-ui-protocol)).

### ctx.cwd

Diretório de trabalho atual.

### ctx.sessionManager

Acesso somente leitura ao estado da sessão. Veja [Formato de Sessão](session-format.md) para a API completa do SessionManager e tipos de entrada.

Para `tool_call`, esse estado é sincronizado através da mensagem do assistant atual antes de os handlers rodarem. No modo de execução paralela de ferramentas, ainda não há garantia de que ele inclua resultados de ferramentas irmãs da mesma mensagem do assistant.

```typescript
ctx.sessionManager.getEntries()       // Todas as entradas
ctx.sessionManager.getBranch()        // Branch atual
ctx.sessionManager.getLeafId()        // ID da entrada folha atual
```

### ctx.modelRegistry / ctx.model

Acesso a modelos e chaves de API.

### ctx.signal

O abort signal atual do agente, ou `undefined` quando nenhum turno de agente está ativo.

Use isso para trabalho aninhado ciente de abort iniciado por handlers de extensão, por exemplo:
- `fetch(..., { signal: ctx.signal })`
- chamadas de modelo que aceitam `signal`
- auxiliares de arquivo ou processo que aceitam `AbortSignal`

`ctx.signal` é tipicamente definido durante eventos de turno ativo como `tool_call`, `tool_result`, `message_update` e `turn_end`.
Geralmente é `undefined` em contextos ociosos ou fora de turno, como eventos de sessão, comandos de extensão e atalhos disparados enquanto o pi está ocioso.

```typescript
pi.on("tool_result", async (event, ctx) => {
  const response = await fetch("https://example.com/api", {
    method: "POST",
    body: JSON.stringify(event),
    signal: ctx.signal,
  });

  const data = await response.json();
  return { details: data };
});
```

### ctx.isIdle() / ctx.abort() / ctx.hasPendingMessages()

Auxiliares de controle de fluxo.

### ctx.shutdown()

Solicita um shutdown gracioso do pi.

- **Modo interativo:** Adiado até o agente ficar ocioso (após processar todas as mensagens de steering e follow-up enfileiradas).
- **Modo RPC:** Adiado até o próximo estado ocioso (após concluir a resposta do comando atual, quando aguardando o próximo comando).
- **Modo print:** No-op. O processo sai automaticamente quando todos os prompts são processados.

Emite o evento `session_shutdown` para todas as extensões antes de sair. Disponível em todos os contextos (handlers de eventos, ferramentas, comandos, atalhos).

```typescript
pi.on("tool_call", (event, ctx) => {
  if (isFatal(event.input)) {
    ctx.shutdown();
  }
});
```

### ctx.getContextUsage()

Retorna o uso de contexto atual para o modelo ativo. Usa o último uso do assistant quando disponível, e então estima os tokens para mensagens finais.

```typescript
const usage = ctx.getContextUsage();
if (usage && usage.tokens > 100_000) {
  // ...
}
```

### ctx.compact()

Aciona a compactação sem aguardar a conclusão. Use `onComplete` e `onError` para ações de acompanhamento.

```typescript
ctx.compact({
  customInstructions: "Focus on recent changes",
  onComplete: (result) => {
    ctx.ui.notify("Compaction completed", "info");
  },
  onError: (error) => {
    ctx.ui.notify(`Compaction failed: ${error.message}`, "error");
  },
});
```

### ctx.getSystemPrompt()

Retorna a string atual do system prompt do Pi.

- Durante `before_agent_start`, isso reflete as mudanças encadeadas de system prompt feitas até agora para o turno atual.
- Não inclui mutações de mensagem de `context` posteriores.
- Não inclui reescritas de payload de `before_provider_request`.
- Se extensões carregadas posteriormente rodarem depois da sua, elas ainda podem mudar o que é enviado em última instância.

```typescript
pi.on("before_agent_start", (event, ctx) => {
  const prompt = ctx.getSystemPrompt();
  console.log(`System prompt length: ${prompt.length}`);
});
```

## ExtensionCommandContext

Handlers de comando recebem `ExtensionCommandContext`, que estende `ExtensionContext` com métodos de controle de sessão. Eles só estão disponíveis em comandos porque podem causar deadlock se chamados de handlers de eventos.

### ctx.waitForIdle()

Aguarda o agente terminar o streaming:

```typescript
pi.registerCommand("my-cmd", {
  handler: async (args, ctx) => {
    await ctx.waitForIdle();
    // O agente agora está ocioso, seguro para modificar a sessão
  },
});
```

### ctx.newSession(options?)

Cria uma nova sessão:

```typescript
const parentSession = ctx.sessionManager.getSessionFile();
const kickoff = "Continue in the replacement session";

const result = await ctx.newSession({
  parentSession,
  setup: async (sm) => {
    sm.appendMessage({
      role: "user",
      content: [{ type: "text", text: "Context from previous session..." }],
      timestamp: Date.now(),
    });
  },
  withSession: async (ctx) => {
    // Use apenas o ctx da sessão de substituição aqui.
    await ctx.sendUserMessage(kickoff);
  },
});

if (result.cancelled) {
  // Uma extensão cancelou a nova sessão
}
```

Opções:
- `parentSession`: arquivo da sessão pai a registrar no cabeçalho da nova sessão
- `setup`: muta o `SessionManager` da nova sessão antes de `withSession` rodar
- `withSession`: executa trabalho pós-troca contra um contexto fresco de sessão de substituição. Não use os objetos antigos `pi` / comando `ctx` capturados; veja [Ciclo de vida e armadilhas da substituição de sessão](#session-replacement-lifecycle-and-footguns).

### ctx.fork(entryId, options?)

Faz fork a partir de uma entrada específica, criando um novo arquivo de sessão:

```typescript
const result = await ctx.fork("entry-id-123", {
  withSession: async (ctx) => {
    // Use apenas o ctx da sessão de substituição aqui.
    ctx.ui.notify("Now in the forked session", "info");
  },
});
if (result.cancelled) {
  // Uma extensão cancelou o fork
}

const cloneResult = await ctx.fork("entry-id-456", { position: "at" });
if (cloneResult.cancelled) {
  // Uma extensão cancelou o clone
}
```

Opções:
- `position`: `"before"` (padrão) faz fork antes da mensagem de usuário selecionada, restaurando aquele prompt no editor
- `position`: `"at"` duplica o caminho ativo através da entrada selecionada sem restaurar o texto do editor
- `withSession`: executa trabalho pós-troca contra um contexto fresco de sessão de substituição. Não use os objetos antigos `pi` / comando `ctx` capturados; veja [Ciclo de vida e armadilhas da substituição de sessão](#session-replacement-lifecycle-and-footguns).

### ctx.navigateTree(targetId, options?)

Navega para um ponto diferente na árvore da sessão:

```typescript
const result = await ctx.navigateTree("entry-id-456", {
  summarize: true,
  customInstructions: "Focus on error handling changes",
  replaceInstructions: false, // true = substitui o prompt padrão inteiramente
  label: "review-checkpoint",
});
```

Opções:
- `summarize`: Se deve gerar um resumo do branch abandonado
- `customInstructions`: Instruções personalizadas para o sumarizador
- `replaceInstructions`: Se true, `customInstructions` substitui o prompt padrão em vez de ser anexado
- `label`: Label a anexar à entrada de resumo do branch (ou à entrada de destino se não estiver resumindo)

### ctx.switchSession(sessionPath, options?)

Troca para um arquivo de sessão diferente:

```typescript
const result = await ctx.switchSession("/path/to/session.jsonl", {
  withSession: async (ctx) => {
    await ctx.sendUserMessage("Resume work in the replacement session");
  },
});
if (result.cancelled) {
  // Uma extensão cancelou a troca via session_before_switch
}
```

Opções:
- `withSession`: executa trabalho pós-troca contra um contexto fresco de sessão de substituição. Não use os objetos antigos `pi` / comando `ctx` capturados; veja [Ciclo de vida e armadilhas da substituição de sessão](#session-replacement-lifecycle-and-footguns).

Para descobrir sessões disponíveis, use os métodos estáticos `SessionManager.list()` ou `SessionManager.listAll()`:

```typescript
import { SessionManager } from "@earendil-works/pi-coding-agent";

pi.registerCommand("switch", {
  description: "Switch to another session",
  handler: async (args, ctx) => {
    const sessions = await SessionManager.list(ctx.cwd);
    if (sessions.length === 0) return;
    const choice = await ctx.ui.select(
      "Pick session:",
      sessions.map(s => s.file),
    );
    if (choice) {
      await ctx.switchSession(choice, {
        withSession: async (ctx) => {
          ctx.ui.notify("Switched session", "info");
        },
      });
    }
  },
});
```

### Ciclo de vida e armadilhas da substituição de sessão

`withSession` recebe um `ReplacedSessionContext` fresco, que estende `ExtensionCommandContext` com auxiliares assíncronos `sendMessage()` e `sendUserMessage()` vinculados à sessão de substituição.

Ciclo de vida e armadilhas:
- `withSession` roda somente após a sessão antiga ter emitido `session_shutdown`, o runtime antigo ter sido desmontado, a sessão de substituição ter sido revinculada, e a nova instância da extensão já ter recebido `session_start`.
- O callback ainda executa no closure original, não dentro da nova instância da extensão. Isso significa que sua instância antiga da extensão pode já ter rodado sua limpeza de shutdown antes de `withSession` começar.
- Objetos vinculados à sessão antigos `pi` / comando `ctx` capturados ficam obsoletos após a substituição e lançarão erro se usados. Use apenas o `ctx` passado para `withSession` para trabalho vinculado à sessão.
- Objetos brutos extraídos previamente ainda são sua responsabilidade. Por exemplo, se você capturar `const sm = ctx.sessionManager` antes da substituição, `sm` ainda é o objeto `SessionManager` antigo. Não o reutilize após a substituição.
- Código em `withSession` deve assumir que qualquer estado invalidado pelo seu handler `session_shutdown` já se foi. Capture apenas dados simples que sobrevivem ao shutdown de forma limpa, como strings, ids e config serializada.

Padrão seguro:

```typescript
pi.registerCommand("handoff", {
  handler: async (_args, ctx) => {
    const kickoff = "Continue from the replacement session";
    await ctx.newSession({
      withSession: async (ctx) => {
        await ctx.sendUserMessage(kickoff);
      },
    });
  },
});
```

Padrão inseguro:

```typescript
pi.registerCommand("handoff", {
  handler: async (_args, ctx) => {
    const oldSessionManager = ctx.sessionManager;
    await ctx.newSession({
      withSession: async (_ctx) => {
        // objetos antigos obsoletos: não faça isso
        oldSessionManager.getSessionFile();
        pi.sendUserMessage("wrong");
      },
    });
  },
});
```

### ctx.reload()

Roda o mesmo fluxo de reload que `/reload`.

```typescript
pi.registerCommand("reload-runtime", {
  description: "Reload extensions, skills, prompts, and themes",
  handler: async (_args, ctx) => {
    await ctx.reload();
    return;
  },
});
```

Comportamento importante:
- `await ctx.reload()` emite `session_shutdown` para o runtime de extensão atual
- Ele então recarrega recursos e emite `session_start` com `reason: "reload"` e `resources_discover` com reason `"reload"`
- O handler de comando atualmente em execução ainda continua no frame de chamada antigo
- Código após `await ctx.reload()` ainda roda da versão pré-reload
- Código após `await ctx.reload()` não deve assumir que o estado antigo em memória da extensão ainda é válido
- Após o handler retornar, futuros comandos/eventos/chamadas de ferramentas usam a nova versão da extensão

Para comportamento previsível, trate o reload como terminal para aquele handler (`await ctx.reload(); return;`).

Ferramentas rodam com `ExtensionContext`, então não podem chamar `ctx.reload()` diretamente. Use um comando como ponto de entrada do reload, e então exponha uma ferramenta que enfileire aquele comando como uma mensagem de usuário de follow-up.

Exemplo de ferramenta que o LLM pode chamar para acionar o reload:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("reload-runtime", {
    description: "Reload extensions, skills, prompts, and themes",
    handler: async (_args, ctx) => {
      await ctx.reload();
      return;
    },
  });

  pi.registerTool({
    name: "reload_runtime",
    label: "Reload Runtime",
    description: "Reload extensions, skills, prompts, and themes",
    parameters: Type.Object({}),
    async execute() {
      pi.sendUserMessage("/reload-runtime", { deliverAs: "followUp" });
      return {
        content: [{ type: "text", text: "Queued /reload-runtime as a follow-up command." }],
      };
    },
  });
}
```

## Métodos da ExtensionAPI

### pi.on(event, handler)

Inscreve-se em eventos. Veja [Eventos](#events) para tipos de eventos e valores de retorno.

### pi.registerTool(definition)

Registra uma ferramenta personalizada chamável pelo LLM. Veja [Ferramentas Personalizadas](#custom-tools) para detalhes completos.

`pi.registerTool()` funciona tanto durante o carregamento da extensão quanto após a inicialização. Você pode chamá-lo dentro de `session_start`, handlers de comando ou outros handlers de eventos. Novas ferramentas são atualizadas imediatamente na mesma sessão, então elas aparecem em `pi.getAllTools()` e são chamáveis pelo LLM sem `/reload`.

Use `pi.setActiveTools()` para habilitar ou desabilitar ferramentas (incluindo ferramentas adicionadas dinamicamente) em runtime.

Use `promptSnippet` para inscrever uma ferramenta personalizada em uma entrada de uma linha em `Available tools`, e `promptGuidelines` para anexar bullets específicos da ferramenta à seção padrão `Guidelines` quando a ferramenta está ativa.

**Importante:** Bullets de `promptGuidelines` são anexados de forma plana à seção `Guidelines` sem prefixo de nome de ferramenta. Cada diretriz deve nomear a ferramenta a que se refere — evite "Use this tool when..." porque o LLM não consegue dizer a qual ferramenta "this" se refere. Escreva "Use my_tool when..." em vez disso.

Veja [dynamic-tools.ts](../examples/extensions/dynamic-tools.ts) para um exemplo completo.

```typescript
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";

pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "What this tool does",
  promptSnippet: "Summarize or transform text according to action",
  promptGuidelines: ["Use my_tool when the user asks to summarize previously generated text."],
  parameters: Type.Object({
    action: StringEnum(["list", "add"] as const),
    text: Type.Optional(Type.String()),
  }),
  prepareArguments(args) {
    // Shim de compatibilidade opcional. Roda antes da validação de schema.
    // Retorna o formato atual do schema, por exemplo para dobrar campos legados
    // no objeto de parâmetros moderno.
    return args;
  },

  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // Faz streaming do progresso
    onUpdate?.({ content: [{ type: "text", text: "Working..." }] });

    return {
      content: [{ type: "text", text: "Done" }],
      details: { result: "..." },
    };
  },

  // Opcional: Renderização personalizada
  renderCall(args, theme, context) { ... },
  renderResult(result, options, theme, context) { ... },
});
```

### pi.sendMessage(message, options?)

Injeta uma mensagem personalizada na sessão.

```typescript
pi.sendMessage({
  customType: "my-extension",
  content: "Message text",
  display: true,
  details: { ... },
}, {
  triggerTurn: true,
  deliverAs: "steer",
});
```

**Opções:**
- `deliverAs` - Modo de entrega:
  - `"steer"` (padrão) - Enfileira a mensagem durante o streaming. Entregue depois que o turno atual do assistant termina de executar suas chamadas de ferramentas, antes da próxima chamada ao LLM.
  - `"followUp"` - Aguarda o agente terminar. Entregue apenas quando o agente não tem mais chamadas de ferramentas.
  - `"nextTurn"` - Enfileirada para o próximo prompt do usuário. Não interrompe nem aciona nada.
- `triggerTurn: true` - Se o agente estiver ocioso, aciona uma resposta do LLM imediatamente. Aplica-se apenas aos modos `"steer"` e `"followUp"` (ignorado para `"nextTurn"`).

### pi.sendUserMessage(content, options?)

Envia uma mensagem de usuário ao agente. Diferente de `sendMessage()` que envia mensagens personalizadas, este envia uma mensagem de usuário real que aparece como se digitada pelo usuário. Sempre aciona um turno.

```typescript
// Mensagem de texto simples
pi.sendUserMessage("What is 2+2?");

// Com array de conteúdo (texto + imagens)
pi.sendUserMessage([
  { type: "text", text: "Describe this image:" },
  { type: "image", source: { type: "base64", mediaType: "image/png", data: "..." } },
]);

// Durante o streaming - deve especificar o modo de entrega
pi.sendUserMessage("Focus on error handling", { deliverAs: "steer" });
pi.sendUserMessage("And then summarize", { deliverAs: "followUp" });
```

**Opções:**
- `deliverAs` - Obrigatório quando o agente está em streaming:
  - `"steer"` - Enfileira a mensagem para entrega depois que o turno atual do assistant termina de executar suas chamadas de ferramentas
  - `"followUp"` - Aguarda o agente terminar todas as ferramentas

Quando não está em streaming, a mensagem é enviada imediatamente e aciona um novo turno. Quando em streaming sem `deliverAs`, lança um erro.

Veja [send-user-message.ts](../examples/extensions/send-user-message.ts) para um exemplo completo.

### pi.appendEntry(customType, data?)

Persiste o estado da extensão (NÃO participa do contexto do LLM).

```typescript
pi.appendEntry("my-state", { count: 42 });

// Restaura no reload
pi.on("session_start", async (_event, ctx) => {
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "custom" && entry.customType === "my-state") {
      // Reconstrói a partir de entry.data
    }
  }
});
```

### pi.setSessionName(name)

Define o nome de exibição da sessão (mostrado no seletor de sessão em vez da primeira mensagem).

```typescript
pi.setSessionName("Refactor auth module");
```

### pi.getSessionName()

Obtém o nome da sessão atual, se definido.

```typescript
const name = pi.getSessionName();
if (name) {
  console.log(`Session: ${name}`);
}
```

### pi.setLabel(entryId, label)

Define ou limpa um label em uma entrada. Labels são marcadores definidos pelo usuário para bookmarking e navegação (mostrados no seletor `/tree`).

```typescript
// Define um label
pi.setLabel(entryId, "checkpoint-before-refactor");

// Limpa um label
pi.setLabel(entryId, undefined);

// Lê labels via sessionManager
const label = ctx.sessionManager.getLabel(entryId);
```

Labels persistem na sessão e sobrevivem a reinicializações. Use-os para marcar pontos importantes (turnos, checkpoints) na árvore da conversa.

### pi.registerCommand(name, options)

Registra um comando.

Se múltiplas extensões registrarem o mesmo nome de comando, o pi mantém todas elas e atribui sufixos numéricos de invocação na ordem de carregamento, por exemplo `/review:1` e `/review:2`.

```typescript
pi.registerCommand("stats", {
  description: "Show session statistics",
  handler: async (args, ctx) => {
    const count = ctx.sessionManager.getEntries().length;
    ctx.ui.notify(`${count} entries`, "info");
  }
});
```

Opcional: adicione auto-completar de argumentos para `/command ...`:

```typescript
import type { AutocompleteItem } from "@earendil-works/pi-tui";

pi.registerCommand("deploy", {
  description: "Deploy to an environment",
  getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
    const envs = ["dev", "staging", "prod"];
    const items = envs.map((e) => ({ value: e, label: e }));
    const filtered = items.filter((i) => i.value.startsWith(prefix));
    return filtered.length > 0 ? filtered : null;
  },
  handler: async (args, ctx) => {
    ctx.ui.notify(`Deploying: ${args}`, "info");
  },
});
```

### pi.getCommands()

Obtém os slash commands disponíveis para invocação via `prompt` na sessão atual. Inclui comandos de extensão, prompt templates e comandos de skill.
A lista corresponde à ordenação do `get_commands` do RPC: extensões primeiro, depois templates, depois skills.

```typescript
const commands = pi.getCommands();
const bySource = commands.filter((command) => command.source === "extension");
const userScoped = commands.filter((command) => command.sourceInfo.scope === "user");
```

Cada entrada tem este formato:

```typescript
{
  name: string; // Nome do comando invocável sem a barra inicial. Pode ter sufixo como "review:1"
  description?: string;
  source: "extension" | "prompt" | "skill";
  sourceInfo: {
    path: string;
    source: string;
    scope: "user" | "project" | "temporary";
    origin: "package" | "top-level";
    baseDir?: string;
  };
}
```

Use `sourceInfo` como o campo canônico de procedência. Não infira propriedade a partir de nomes de comando ou de parsing de caminho ad hoc.

Comandos interativos built-in (como `/model` e `/settings`) não são incluídos aqui. Eles são tratados apenas no modo
interativo e não executariam se enviados via `prompt`.

### pi.registerMessageRenderer(customType, renderer)

Registra um renderizador TUI personalizado para mensagens com seu `customType`. Veja [UI Personalizada](#custom-ui).

### pi.registerShortcut(shortcut, options)

Registra um atalho de teclado. Veja [keybindings.md](keybindings.md) para o formato de atalho e keybindings built-in.

```typescript
pi.registerShortcut("ctrl+shift+p", {
  description: "Toggle plan mode",
  handler: async (ctx) => {
    ctx.ui.notify("Toggled!");
  },
});
```

### pi.registerFlag(name, options)

Registra uma flag de CLI.

```typescript
pi.registerFlag("plan", {
  description: "Start in plan mode",
  type: "boolean",
  default: false,
});

// Verifica o valor
if (pi.getFlag("plan")) {
  // Modo plan habilitado
}
```

### pi.exec(command, args, options?)

Executa um comando shell.

```typescript
const result = await pi.exec("git", ["status"], { signal, timeout: 5000 });
// result.stdout, result.stderr, result.code, result.killed
```

### pi.getActiveTools() / pi.getAllTools() / pi.setActiveTools(names)

Gerencia ferramentas ativas. Isso funciona tanto para ferramentas built-in quanto para ferramentas registradas dinamicamente.

```typescript
const active = pi.getActiveTools();
const all = pi.getAllTools();
// [{
//   name: "read",
//   description: "Read file contents...",
//   parameters: ..., 
//   sourceInfo: { path: "<builtin:read>", source: "builtin", scope: "temporary", origin: "top-level" }
// }, ...]
const names = all.map(t => t.name);
const builtinTools = all.filter((t) => t.sourceInfo.source === "builtin");
const extensionTools = all.filter((t) => t.sourceInfo.source !== "builtin" && t.sourceInfo.source !== "sdk");
pi.setActiveTools(["read", "bash"]); // Muda para somente leitura
```

`pi.getAllTools()` retorna `name`, `description`, `parameters` e `sourceInfo`.

Valores típicos de `sourceInfo.source`:
- `builtin` para ferramentas built-in
- `sdk` para ferramentas passadas via `createAgentSession({ customTools })`
- metadados de origem de extensão para ferramentas registradas por extensões

### pi.setModel(model)

Define o modelo atual. Retorna `false` se nenhuma chave de API estiver disponível para o modelo. Veja [models.md](models.md) para configurar modelos personalizados.

```typescript
const model = ctx.modelRegistry.find("anthropic", "claude-sonnet-4-5");
if (model) {
  const success = await pi.setModel(model);
  if (!success) {
    ctx.ui.notify("No API key for this model", "error");
  }
}
```

### pi.getThinkingLevel() / pi.setThinkingLevel(level)

Obtém ou define o nível de thinking. O nível é limitado às capacidades do modelo (modelos não-reasoning sempre usam "off"). Mudanças emitem `thinking_level_select`.

```typescript
const current = pi.getThinkingLevel();  // "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
pi.setThinkingLevel("high");
```

### pi.events

Barramento de eventos compartilhado para comunicação entre extensões:

```typescript
pi.events.on("my:event", (data) => { ... });
pi.events.emit("my:event", { ... });
```

### pi.registerProvider(name, config)

Registra ou sobrescreve um provedor de modelo dinamicamente. Útil para proxies, endpoints personalizados ou configurações de modelo para toda a equipe.

Chamadas feitas durante a factory function da extensão são enfileiradas e aplicadas assim que o runner inicializa. Chamadas feitas depois disso — por exemplo de um handler de comando após um fluxo de configuração do usuário — têm efeito imediato sem exigir um `/reload`.

Se você precisar descobrir modelos de um endpoint remoto, prefira uma factory de extensão assíncrona em vez de adiar o fetch para `session_start`. O pi aguarda a factory antes de a inicialização continuar, então os modelos registrados ficam disponíveis imediatamente, inclusive para `pi --list-models`.

```typescript
// Registra um novo provedor com modelos personalizados
pi.registerProvider("my-proxy", {
  name: "My Proxy",
  baseUrl: "https://proxy.example.com",
  apiKey: "PROXY_API_KEY",  // nome de variável de ambiente ou literal
  api: "anthropic-messages",
  models: [
    {
      id: "claude-sonnet-4-20250514",
      name: "Claude 4 Sonnet (proxy)",
      reasoning: false,
      input: ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000,
      maxTokens: 16384
    }
  ]
});

// Sobrescreve baseUrl para um provedor existente (mantém todos os modelos)
pi.registerProvider("anthropic", {
  baseUrl: "https://proxy.example.com"
});

// Registra provedor com suporte a OAuth para /login
pi.registerProvider("corporate-ai", {
  baseUrl: "https://ai.corp.com",
  api: "openai-responses",
  models: [...],
  oauth: {
    name: "Corporate AI (SSO)",
    async login(callbacks) {
      // Fluxo OAuth personalizado
      callbacks.onAuth({ url: "https://sso.corp.com/..." });
      const code = await callbacks.onPrompt({ message: "Enter code:" });
      return { refresh: code, access: code, expires: Date.now() + 3600000 };
    },
    async refreshToken(credentials) {
      // Lógica de refresh
      return credentials;
    },
    getApiKey(credentials) {
      return credentials.access;
    }
  }
});
```

**Opções de config:**
- `name` - Nome de exibição para o provedor na UI, como em `/login`.
- `baseUrl` - URL do endpoint da API. Obrigatório ao definir modelos.
- `apiKey` - Chave de API ou nome de variável de ambiente. Obrigatório ao definir modelos (a menos que `oauth` seja fornecido).
- `api` - Tipo de API: `"anthropic-messages"`, `"openai-completions"`, `"openai-responses"`, etc.
- `headers` - Headers personalizados a incluir nas requisições.
- `authHeader` - Se true, adiciona o header `Authorization: Bearer` automaticamente.
- `models` - Array de definições de modelo. Se fornecido, substitui todos os modelos existentes para este provedor. Definições de modelo podem definir `baseUrl` para sobrescrever o endpoint do provedor para aquele modelo.
- `oauth` - Config de provedor OAuth para suporte a `/login`. Quando fornecido, o provedor aparece no menu de login.
- `streamSimple` - Implementação de streaming personalizada para APIs não padrão.

Veja [custom-provider.md](custom-provider.md) para tópicos avançados: APIs de streaming personalizadas, detalhes de OAuth, referência de definição de modelo.

### pi.unregisterProvider(name)

Remove um provedor registrado anteriormente e seus modelos. Modelos built-in que foram sobrescritos pelo provedor são restaurados. Não tem efeito se o provedor não foi registrado.

Como `registerProvider`, isso tem efeito imediato quando chamado após a fase de carregamento inicial, então um `/reload` não é necessário.

```typescript
pi.registerCommand("my-setup-teardown", {
  description: "Remove the custom proxy provider",
  handler: async (_args, _ctx) => {
    pi.unregisterProvider("my-proxy");
  },
});
```

## Gerenciamento de Estado

Extensões com estado devem armazená-lo no `details` do resultado da ferramenta para suporte adequado a branching:

```typescript
export default function (pi: ExtensionAPI) {
  let items: string[] = [];

  // Reconstrói o estado a partir da sessão
  pi.on("session_start", async (_event, ctx) => {
    items = [];
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "message" && entry.message.role === "toolResult") {
        if (entry.message.toolName === "my_tool") {
          items = entry.message.details?.items ?? [];
        }
      }
    }
  });

  pi.registerTool({
    name: "my_tool",
    // ...
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      items.push("new item");
      return {
        content: [{ type: "text", text: "Added" }],
        details: { items: [...items] },  // Armazena para reconstrução
      };
    },
  });
}
```

## Ferramentas Personalizadas

Registre ferramentas que o LLM pode chamar via `pi.registerTool()`. Ferramentas aparecem no system prompt e podem ter renderização personalizada.

Use `promptSnippet` para uma entrada curta de uma linha na seção `Available tools` no system prompt padrão. Se omitido, ferramentas personalizadas ficam fora dessa seção.

Use `promptGuidelines` para adicionar bullets específicos da ferramenta à seção `Guidelines` do system prompt padrão. Esses bullets são incluídos apenas enquanto a ferramenta está ativa (por exemplo, após `pi.setActiveTools([...])`).

**Importante:** Bullets de `promptGuidelines` são anexados de forma plana à seção `Guidelines` sem prefixo de nome de ferramenta ou agrupamento. Cada diretriz deve nomear a ferramenta a que se refere — evite "Use this tool when..." porque o LLM não consegue dizer a qual ferramenta "this" se refere. Escreva "Use my_tool when..." em vez disso.

Nota: Alguns modelos são idiotas e incluem o prefixo @ em argumentos de caminho de ferramenta. Ferramentas built-in removem um @ inicial antes de resolver caminhos. Se sua ferramenta personalizada aceita um caminho, normalize um @ inicial também.

Se sua ferramenta personalizada muta arquivos, use `withFileMutationQueue()` para que ela participe da mesma fila por arquivo que o `edit` e `write` built-in. Isso importa porque chamadas de ferramentas rodam em paralelo por padrão. Sem a fila, duas ferramentas podem ler o mesmo conteúdo antigo de arquivo, computar atualizações diferentes, e então a escrita que pousar por último sobrescreve a outra.

Exemplo de caso de falha: sua ferramenta personalizada edita `foo.ts` enquanto o `edit` built-in também muda `foo.ts` no mesmo turno do assistant. Se sua ferramenta não participa da fila, ambas podem ler o `foo.ts` original, aplicar mudanças separadas, e uma dessas mudanças é perdida.

Passe o caminho real do arquivo de destino para `withFileMutationQueue()`, não o argumento bruto do usuário. Resolva-o primeiro para um caminho absoluto, relativo a `ctx.cwd` ou ao diretório de trabalho da sua ferramenta. Para arquivos existentes, o auxiliar canonicaliza através de `realpath()`, então aliases de symlink para o mesmo arquivo compartilham uma fila. Para arquivos novos, ele recorre ao caminho absoluto resolvido porque ainda não há nada para fazer `realpath()`.

Enfileire toda a janela de mutação naquele caminho de destino. Isso inclui a lógica de read-modify-write, não apenas a escrita final.

```typescript
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
  const absolutePath = resolve(ctx.cwd, params.path);

  return withFileMutationQueue(absolutePath, async () => {
    await mkdir(dirname(absolutePath), { recursive: true });
    const current = await readFile(absolutePath, "utf8");
    const next = current.replace(params.oldText, params.newText);
    await writeFile(absolutePath, next, "utf8");

    return {
      content: [{ type: "text", text: `Updated ${params.path}` }],
      details: {},
    };
  });
}
```

### Definição de Ferramenta

```typescript
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";

pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "What this tool does (shown to LLM)",
  promptSnippet: "List or add items in the project todo list",
  promptGuidelines: [
    "Use my_tool for todo planning instead of direct file edits when the user asks for a task list."
  ],
  parameters: Type.Object({
    action: StringEnum(["list", "add"] as const),  // Use StringEnum para compatibilidade com o Google
    text: Type.Optional(Type.String()),
  }),
  prepareArguments(args) {
    if (!args || typeof args !== "object") return args;
    const input = args as { action?: string; oldAction?: string };
    if (typeof input.oldAction === "string" && input.action === undefined) {
      return { ...input, action: input.oldAction };
    }
    return args;
  },

  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // Verifica cancelamento
    if (signal?.aborted) {
      return { content: [{ type: "text", text: "Cancelled" }] };
    }

    // Faz streaming de atualizações de progresso
    onUpdate?.({
      content: [{ type: "text", text: "Working..." }],
      details: { progress: 50 },
    });

    // Roda comandos via pi.exec (capturado do closure da extensão)
    const result = await pi.exec("some-command", [], { signal });

    // Retorna o resultado
    return {
      content: [{ type: "text", text: "Done" }],  // Enviado ao LLM
      details: { data: result },                   // Para renderização e estado
      // Opcional: para após este lote de ferramentas quando todo resultado de ferramenta finalizado
      // no lote também retornar terminate: true.
      terminate: true,
    };
  },

  // Opcional: Renderização personalizada
  renderCall(args, theme, context) { ... },
  renderResult(result, options, theme, context) { ... },
});
```

**Sinalizando erros:** Para marcar uma execução de ferramenta como falha (define `isError: true` no resultado e reporta ao LLM), lance um erro de `execute`. Retornar um valor nunca define a flag de erro, independentemente de quais propriedades você inclua no objeto de retorno.

**Terminação antecipada:** Retorne `terminate: true` de `execute()` para sugerir que a chamada automática de follow-up ao LLM deve ser pulada após o lote de ferramentas atual. Isso só tem efeito quando todo resultado de ferramenta finalizado naquele lote é terminante. Veja [examples/extensions/structured-output.ts](../examples/extensions/structured-output.ts) para um exemplo mínimo onde o agente termina em uma chamada final de ferramenta de structured-output.

```typescript
// Correto: lançar para sinalizar um erro
async execute(toolCallId, params) {
  if (!isValid(params.input)) {
    throw new Error(`Invalid input: ${params.input}`);
  }
  return { content: [{ type: "text", text: "OK" }], details: {} };
}
```

**Importante:** Use `StringEnum` de `@earendil-works/pi-ai` para enums de string. `Type.Union`/`Type.Literal` não funciona com a API do Google.

**Preparação de argumentos:** `prepareArguments(args)` é opcional. Se definido, roda antes da validação de schema e antes de `execute()`. Use-o para imitar um formato de input antigo aceito quando o pi retoma uma sessão antiga cujos argumentos de chamada de ferramenta armazenados não correspondem mais ao schema atual. Retorne o objeto que você quer validado contra `parameters`. Mantenha o schema público estrito. Não adicione campos de compatibilidade depreciados a `parameters` apenas para manter sessões antigas retomadas funcionando.

Exemplo: uma sessão antiga pode conter uma chamada da ferramenta `edit` com `oldText` e `newText` de nível superior, enquanto o schema atual só aceita `edits: [{ oldText, newText }]`.

```typescript
pi.registerTool({
  name: "edit",
  label: "Edit",
  description: "Edit a single file using exact text replacement",
  parameters: Type.Object({
    path: Type.String(),
    edits: Type.Array(
      Type.Object({
        oldText: Type.String(),
        newText: Type.String(),
      }),
    ),
  }),
  prepareArguments(args) {
    if (!args || typeof args !== "object") return args;

    const input = args as {
      path?: string;
      edits?: Array<{ oldText: string; newText: string }>;
      oldText?: unknown;
      newText?: unknown;
    };

    if (typeof input.oldText !== "string" || typeof input.newText !== "string") {
      return args;
    }

    return {
      ...input,
      edits: [...(input.edits ?? []), { oldText: input.oldText, newText: input.newText }],
    };
  },
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // params agora corresponde ao schema atual
    return {
      content: [{ type: "text", text: `Applying ${params.edits.length} edit block(s)` }],
      details: {},
    };
  },
});
```

### Sobrescrevendo Ferramentas Built-in

Extensões podem sobrescrever ferramentas built-in (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`) registrando uma ferramenta com o mesmo nome. O modo interativo exibe um aviso quando isso acontece.

```bash
# A ferramenta read da extensão substitui o read built-in
pi -e ./tool-override.ts
```

Alternativamente, use `--no-builtin-tools` para iniciar sem nenhuma ferramenta built-in, mantendo as ferramentas de extensão habilitadas:
```bash
# Sem ferramentas built-in, apenas ferramentas de extensão
pi --no-builtin-tools -e ./my-extension.ts
```

Veja [examples/extensions/tool-override.ts](../examples/extensions/tool-override.ts) para um exemplo completo que sobrescreve `read` com logging e controle de acesso.

**Renderização:** A herança de renderizador built-in é resolvida por slot. A sobrescrita de execução e a sobrescrita de renderização são independentes. Se sua sobrescrita omite `renderCall`, o `renderCall` built-in é usado. Se sua sobrescrita omite `renderResult`, o `renderResult` built-in é usado. Se sua sobrescrita omite ambos, o renderizador built-in é usado automaticamente (syntax highlighting, diffs, etc.). Isso permite encapsular ferramentas built-in para logging ou controle de acesso sem reimplementar a UI.

**Metadados de prompt:** `promptSnippet` e `promptGuidelines` não são herdados da ferramenta built-in. Se sua sobrescrita deve manter essas instruções de prompt, defina-as explicitamente na sobrescrita.

**Sua implementação deve corresponder ao formato exato do resultado**, incluindo o tipo `details`. A UI e a lógica de sessão dependem desses formatos para renderização e rastreamento de estado.

Implementações de ferramentas built-in:
- [read.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/read.ts) - `ReadToolDetails`
- [bash.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/bash.ts) - `BashToolDetails`
- [edit.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/edit.ts)
- [write.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/write.ts)
- [grep.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/grep.ts) - `GrepToolDetails`
- [find.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/find.ts) - `FindToolDetails`
- [ls.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/ls.ts) - `LsToolDetails`

### Execução Remota

Ferramentas built-in suportam operações plugáveis para delegar a sistemas remotos (SSH, containers, etc.):

```typescript
import { createReadTool, createBashTool, type ReadOperations } from "@earendil-works/pi-coding-agent";

// Cria a ferramenta com operações personalizadas
const remoteRead = createReadTool(cwd, {
  operations: {
    readFile: (path) => sshExec(remote, `cat ${path}`),
    access: (path) => sshExec(remote, `test -r ${path}`).then(() => {}),
  }
});

// Registra, verificando a flag no momento da execução
pi.registerTool({
  ...remoteRead,
  async execute(id, params, signal, onUpdate, _ctx) {
    const ssh = getSshConfig();
    if (ssh) {
      const tool = createReadTool(cwd, { operations: createRemoteOps(ssh) });
      return tool.execute(id, params, signal, onUpdate);
    }
    return localRead.execute(id, params, signal, onUpdate);
  },
});
```

**Interfaces de operações:** `ReadOperations`, `WriteOperations`, `EditOperations`, `BashOperations`, `LsOperations`, `GrepOperations`, `FindOperations`

Para `user_bash`, extensões podem reutilizar o backend de shell local do pi via `createLocalBashOperations()` em vez de reimplementar o spawn de processos local, a resolução de shell e a terminação de árvore de processos.

A ferramenta bash também suporta um spawn hook para ajustar o comando, cwd ou env antes da execução:

```typescript
import { createBashTool } from "@earendil-works/pi-coding-agent";

const bashTool = createBashTool(cwd, {
  spawnHook: ({ command, cwd, env }) => ({
    command: `source ~/.profile\n${command}`,
    cwd: `/mnt/sandbox${cwd}`,
    env: { ...env, CI: "1" },
  }),
});
```

Veja [examples/extensions/ssh.ts](../examples/extensions/ssh.ts) para um exemplo SSH completo com a flag `--ssh`.

### Truncamento de Saída

**Ferramentas DEVEM truncar sua saída** para evitar sobrecarregar o contexto do LLM. Saídas grandes podem causar:
- Erros de overflow de contexto (prompt muito longo)
- Falhas de compactação
- Performance degradada do modelo

O limite built-in é **50KB** (~10k tokens) e **2000 linhas**, o que for atingido primeiro. Use os utilitários de truncamento exportados:

```typescript
import {
  truncateHead,      // Mantém as primeiras N linhas/bytes (bom para leituras de arquivo, resultados de busca)
  truncateTail,      // Mantém as últimas N linhas/bytes (bom para logs, saída de comando)
  truncateLine,      // Trunca uma única linha para maxBytes com reticências
  formatSize,        // Tamanho legível por humanos (ex: "50KB", "1.5MB")
  DEFAULT_MAX_BYTES, // 50KB
  DEFAULT_MAX_LINES, // 2000
} from "@earendil-works/pi-coding-agent";

async execute(toolCallId, params, signal, onUpdate, ctx) {
  const output = await runCommand();

  // Aplica truncamento
  const truncation = truncateHead(output, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  let result = truncation.content;

  if (truncation.truncated) {
    // Escreve a saída completa em um arquivo temporário
    const tempFile = writeTempFile(output);

    // Informa ao LLM onde encontrar a saída completa
    result += `\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines`;
    result += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
    result += ` Full output saved to: ${tempFile}]`;
  }

  return { content: [{ type: "text", text: result }] };
}
```

**Pontos-chave:**
- Use `truncateHead` para conteúdo onde o início importa (resultados de busca, leituras de arquivo)
- Use `truncateTail` para conteúdo onde o fim importa (logs, saída de comando)
- Sempre informe ao LLM quando a saída for truncada e onde encontrar a versão completa
- Documente os limites de truncamento na descrição da sua ferramenta

Veja [examples/extensions/truncated-tool.ts](../examples/extensions/truncated-tool.ts) para um exemplo completo encapsulando `rg` (ripgrep) com truncamento adequado.

### Múltiplas Ferramentas

Uma extensão pode registrar múltiplas ferramentas com estado compartilhado:

```typescript
export default function (pi: ExtensionAPI) {
  let connection = null;

  pi.registerTool({ name: "db_connect", ... });
  pi.registerTool({ name: "db_query", ... });
  pi.registerTool({ name: "db_close", ... });

  pi.on("session_shutdown", async () => {
    connection?.close();
  });
}
```

### Renderização Personalizada

Ferramentas podem fornecer `renderCall` e `renderResult` para exibição TUI personalizada. Veja [tui.md](tui.md) para a API completa de componentes e [tool-execution.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/modes/interactive/components/tool-execution.ts) para como as linhas de ferramentas são compostas.

Por padrão, a saída da ferramenta é encapsulada em um `Box` que trata padding e fundo. Um `renderCall` ou `renderResult` definido deve retornar um `Component`. Se um renderizador de slot não estiver definido, `tool-execution.ts` usa renderização de fallback para aquele slot.

Defina `renderShell: "self"` quando a ferramenta deve renderizar seu próprio shell em vez de usar o `Box` padrão. Isso é útil para ferramentas que precisam de controle completo sobre o framing ou comportamento de fundo, por exemplo previews grandes que devem permanecer visualmente estáveis após a ferramenta se estabilizar.

```typescript
pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "Custom shell example",
  parameters: Type.Object({}),
  renderShell: "self",
  async execute() {
    return { content: [{ type: "text", text: "ok" }], details: undefined };
  },
  renderCall(args, theme, context) {
    return new Text(theme.fg("accent", "my custom shell"), 0, 0);
  },
});
```

`renderCall` e `renderResult` cada um recebe um objeto `context` com:
- `args` - os argumentos atuais da chamada de ferramenta
- `state` - estado compartilhado local da linha entre `renderCall` e `renderResult`
- `lastComponent` - o componente retornado anteriormente para aquele slot, se houver
- `invalidate()` - solicita um rerender desta linha de ferramenta
- `toolCallId`, `cwd`, `executionStarted`, `argsComplete`, `isPartial`, `expanded`, `showImages`, `isError`

Use `context.state` para estado compartilhado entre slots. Mantenha caches locais de slot na instância do componente retornado quando você quiser reutilizar e mutar o mesmo componente entre renderizações.

#### renderCall

Renderiza a chamada de ferramenta ou cabeçalho:

```typescript
import { Text } from "@earendil-works/pi-tui";

renderCall(args, theme, context) {
  const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
  let content = theme.fg("toolTitle", theme.bold("my_tool "));
  content += theme.fg("muted", args.action);
  if (args.text) {
    content += " " + theme.fg("dim", `"${args.text}"`);
  }
  text.setText(content);
  return text;
}
```

#### renderResult

Renderiza o resultado da ferramenta ou saída:

```typescript
renderResult(result, { expanded, isPartial }, theme, context) {
  if (isPartial) {
    return new Text(theme.fg("warning", "Processing..."), 0, 0);
  }

  if (result.details?.error) {
    return new Text(theme.fg("error", `Error: ${result.details.error}`), 0, 0);
  }

  let text = theme.fg("success", "✓ Done");
  if (expanded && result.details?.items) {
    for (const item of result.details.items) {
      text += "\n  " + theme.fg("dim", item);
    }
  }
  return new Text(text, 0, 0);
}
```

Se um slot intencionalmente não tem conteúdo visível, retorne um `Component` vazio, como um `Container` vazio.

#### Dicas de Keybinding

Use `keyHint()` para exibir dicas de keybinding que respeitam a configuração de keybinding ativa:

```typescript
import { keyHint } from "@earendil-works/pi-coding-agent";

renderResult(result, { expanded }, theme, context) {
  let text = theme.fg("success", "✓ Done");
  if (!expanded) {
    text += ` (${keyHint("app.tools.expand", "to expand")})`;
  }
  return new Text(text, 0, 0);
}
```

Funções disponíveis:
- `keyHint(keybinding, description)` - Formata um id de keybinding configurado, como `"app.tools.expand"` ou `"tui.select.confirm"`
- `keyText(keybinding)` - Retorna o texto bruto da tecla configurada para um id de keybinding
- `rawKeyHint(key, description)` - Formata uma string de tecla bruta

Use ids de keybinding com namespace:
- Ids do coding-agent usam o namespace `app.*`, por exemplo `app.tools.expand`, `app.editor.external`, `app.session.rename`
- Ids compartilhados da TUI usam o namespace `tui.*`, por exemplo `tui.select.confirm`, `tui.select.cancel`, `tui.input.tab`

Para a lista exaustiva de ids de keybinding e padrões, veja [keybindings.md](keybindings.md). `keybindings.json` usa esses mesmos ids com namespace.

Editores personalizados e componentes `ctx.ui.custom()` recebem `keybindings: KeybindingsManager` como um argumento injetado. Eles devem usar esse manager injetado diretamente em vez de chamar `getKeybindings()` ou `setKeybindings()`.

#### Boas Práticas

- Use `Text` com padding `(0, 0)`. O Box padrão trata o padding.
- Use `\n` para conteúdo multilinha.
- Trate `isPartial` para progresso de streaming.
- Suporte `expanded` para detalhes sob demanda.
- Mantenha a visão padrão compacta.
- Leia `context.args` em `renderResult` em vez de copiar args para `context.state`.
- Use `context.state` apenas para dados que devem ser compartilhados entre os slots de call e result.
- Reutilize `context.lastComponent` quando a mesma instância de componente pode ser atualizada no local.
- Use `renderShell: "self"` apenas quando o shell em box padrão atrapalha. No modo self-shell a ferramenta é responsável pelo seu próprio framing, padding e fundo.

#### Fallback

Se um renderizador de slot não estiver definido ou lançar erro:
- `renderCall`: Mostra o nome da ferramenta
- `renderResult`: Mostra texto bruto de `content`

## UI Personalizada

Extensões podem interagir com usuários via métodos `ctx.ui` e personalizar como mensagens/ferramentas renderizam.

**Para componentes personalizados, veja [tui.md](tui.md)** que tem padrões prontos para copiar e colar para:
- Diálogos de seleção (SelectList)
- Operações assíncronas com cancelamento (BorderedLoader)
- Toggles de configuração (SettingsList)
- Indicadores de status (setStatus)
- Mensagem de trabalho, visibilidade e indicador durante o streaming (`setWorkingMessage`, `setWorkingVisible`, `setWorkingIndicator`)
- Widgets acima/abaixo do editor (setWidget)
- Provedores de autocomplete sobrepostos ao autocomplete built-in de slash/path (addAutocompleteProvider)
- Rodapés personalizados (setFooter)

### Diálogos

```typescript
// Seleciona entre opções
const choice = await ctx.ui.select("Pick one:", ["A", "B", "C"]);

// Diálogo de confirmação
const ok = await ctx.ui.confirm("Delete?", "This cannot be undone");

// Entrada de texto
const name = await ctx.ui.input("Name:", "placeholder");

// Editor multilinha
const text = await ctx.ui.editor("Edit:", "prefilled text");

// Notificação (não bloqueante)
ctx.ui.notify("Done!", "info");  // "info" | "warning" | "error"
```

#### Diálogos Temporizados com Contagem Regressiva

Diálogos suportam uma opção `timeout` que se auto-dispensa com um display de contagem regressiva ao vivo:

```typescript
// O diálogo mostra "Title (5s)" → "Title (4s)" → ... → auto-dispensa em 0
const confirmed = await ctx.ui.confirm(
  "Timed Confirmation",
  "This dialog will auto-cancel in 5 seconds. Confirm?",
  { timeout: 5000 }
);

if (confirmed) {
  // Usuário confirmou
} else {
  // Usuário cancelou ou expirou
}
```

**Valores de retorno em timeout:**
- `select()` retorna `undefined`
- `confirm()` retorna `false`
- `input()` retorna `undefined`

#### Dispensa Manual com AbortSignal

Para mais controle (ex: distinguir timeout de cancelamento do usuário), use `AbortSignal`:

```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000);

const confirmed = await ctx.ui.confirm(
  "Timed Confirmation",
  "This dialog will auto-cancel in 5 seconds. Confirm?",
  { signal: controller.signal }
);

clearTimeout(timeoutId);

if (confirmed) {
  // Usuário confirmou
} else if (controller.signal.aborted) {
  // O diálogo expirou
} else {
  // Usuário cancelou (pressionou Escape ou selecionou "No")
}
```

Veja [examples/extensions/timed-confirm.ts](../examples/extensions/timed-confirm.ts) para exemplos completos.

### Widgets, Status e Rodapé

```typescript
// Status no rodapé (persistente até ser limpo)
ctx.ui.setStatus("my-ext", "Processing...");
ctx.ui.setStatus("my-ext", undefined);  // Limpa

// Loader de trabalho (mostrado durante o streaming)
ctx.ui.setWorkingMessage("Thinking deeply...");
ctx.ui.setWorkingMessage();  // Restaura o padrão
ctx.ui.setWorkingVisible(false);  // Oculta a linha do loader de trabalho built-in inteiramente
ctx.ui.setWorkingVisible(true);   // Mostra a linha do loader de trabalho built-in

// Indicador de trabalho (mostrado durante o streaming)
ctx.ui.setWorkingIndicator({ frames: [ctx.ui.theme.fg("accent", "●")] });  // Ponto estático
ctx.ui.setWorkingIndicator({
  frames: [
    ctx.ui.theme.fg("dim", "·"),
    ctx.ui.theme.fg("muted", "•"),
    ctx.ui.theme.fg("accent", "●"),
    ctx.ui.theme.fg("muted", "•"),
  ],
  intervalMs: 120,
});
ctx.ui.setWorkingIndicator({ frames: [] });  // Oculta o indicador
ctx.ui.setWorkingIndicator();  // Restaura o spinner padrão

// Widget acima do editor (padrão)
ctx.ui.setWidget("my-widget", ["Line 1", "Line 2"]);
// Widget abaixo do editor
ctx.ui.setWidget("my-widget", ["Line 1", "Line 2"], { placement: "belowEditor" });
ctx.ui.setWidget("my-widget", (tui, theme) => new Text(theme.fg("accent", "Custom"), 0, 0));
ctx.ui.setWidget("my-widget", undefined);  // Limpa

// Rodapé personalizado (substitui o rodapé built-in inteiramente)
ctx.ui.setFooter((tui, theme) => ({
  render(width) { return [theme.fg("dim", "Custom footer")]; },
  invalidate() {},
}));
ctx.ui.setFooter(undefined);  // Restaura o rodapé built-in

// Título do terminal
ctx.ui.setTitle("pi - my-project");

// Texto do editor
ctx.ui.setEditorText("Prefill text");
const current = ctx.ui.getEditorText();

// Cola no editor (aciona o tratamento de paste, incluindo collapse para conteúdo grande)
ctx.ui.pasteToEditor("pasted content");

// Empilha comportamento de autocomplete personalizado sobre o provedor built-in
ctx.ui.addAutocompleteProvider((current) => ({
  async getSuggestions(lines, line, col, options) {
    const beforeCursor = (lines[line] ?? "").slice(0, col);
    const match = beforeCursor.match(/(?:^|[ \t])#([^\s#]*)$/);
    if (!match) {
      return current.getSuggestions(lines, line, col, options);
    }

    return {
      prefix: `#${match[1] ?? ""}`,
      items: [{ value: "#2983", label: "#2983", description: "Extension API for autocomplete" }],
    };
  },
  applyCompletion(lines, line, col, item, prefix) {
    return current.applyCompletion(lines, line, col, item, prefix);
  },
  shouldTriggerFileCompletion(lines, line, col) {
    return current.shouldTriggerFileCompletion?.(lines, line, col) ?? true;
  },
}));

// Expansão de saída de ferramenta
const wasExpanded = ctx.ui.getToolsExpanded();
ctx.ui.setToolsExpanded(true);
ctx.ui.setToolsExpanded(wasExpanded);

// Editor personalizado (modo vim, modo emacs, etc.)
ctx.ui.setEditorComponent((tui, theme, keybindings) => new VimEditor(tui, theme, keybindings));
const currentEditor = ctx.ui.getEditorComponent();
ctx.ui.setEditorComponent((tui, theme, keybindings) =>
  new WrappedEditor(tui, theme, keybindings, currentEditor?.(tui, theme, keybindings))
);
ctx.ui.setEditorComponent(undefined);  // Restaura o editor padrão

// Gerenciamento de tema (veja themes.md para criar temas)
const themes = ctx.ui.getAllThemes();  // [{ name: "dark", path: "/..." | undefined }, ...]
const lightTheme = ctx.ui.getTheme("light");  // Carrega sem trocar
const result = ctx.ui.setTheme("light");  // Troca pelo nome
if (!result.success) {
  ctx.ui.notify(`Failed: ${result.error}`, "error");
}
ctx.ui.setTheme(lightTheme!);  // Ou troca por objeto Theme
ctx.ui.theme.fg("accent", "styled text");  // Acessa o tema atual
```

Frames de indicador de trabalho personalizados são renderizados literalmente. Se você quiser cores, adicione-as às strings dos frames você mesmo, por exemplo com `ctx.ui.theme.fg(...)`.

### Provedores de Autocomplete

Use `ctx.ui.addAutocompleteProvider()` para empilhar lógica de autocomplete personalizada sobre o provedor built-in de slash-command e path.

Padrão típico:

- inspecione o texto antes do cursor
- retorne suas próprias sugestões quando sua sintaxe específica de extensão corresponder
- caso contrário, delegue para `current.getSuggestions(...)`
- delegue `applyCompletion(...)` a menos que você precise de comportamento de inserção personalizado

```typescript
pi.on("session_start", (_event, ctx) => {
  ctx.ui.addAutocompleteProvider((current) => ({
    async getSuggestions(lines, cursorLine, cursorCol, options) {
      const line = lines[cursorLine] ?? "";
      const beforeCursor = line.slice(0, cursorCol);
      const match = beforeCursor.match(/(?:^|[ \t])#([^\s#]*)$/);
      if (!match) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      return {
        prefix: `#${match[1] ?? ""}`,
        items: [
          { value: "#2983", label: "#2983", description: "Extension API for registering custom @ autocomplete providers" },
          { value: "#2753", label: "#2753", description: "Reload stale resource settings" },
        ],
      };
    },

    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },

    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
  }));
});
```

Veja [github-issue-autocomplete.ts](../examples/extensions/github-issue-autocomplete.ts) para um exemplo completo que pré-carrega as últimas issues abertas do GitHub com `gh issue list` e as filtra localmente para completar `#...` rapidamente. Requer o GitHub CLI (`gh`) e um checkout de repositório do GitHub.

### Componentes Personalizados

Para UI complexa, use `ctx.ui.custom()`. Isso substitui temporariamente o editor pelo seu componente até `done()` ser chamado:

```typescript
import { Text, Component } from "@earendil-works/pi-tui";

const result = await ctx.ui.custom<boolean>((tui, theme, keybindings, done) => {
  const text = new Text("Press Enter to confirm, Escape to cancel", 1, 1);

  text.onKey = (key) => {
    if (key === "return") done(true);
    if (key === "escape") done(false);
    return true;
  };

  return text;
});

if (result) {
  // Usuário pressionou Enter
}
```

O callback recebe:
- `tui` - Instância da TUI (para dimensões de tela, gerenciamento de foco)
- `theme` - Tema atual para estilização
- `keybindings` - Manager de keybinding do app (para verificar atalhos)
- `done(value)` - Chame para fechar o componente e retornar o valor

Veja [tui.md](tui.md) para a API completa de componentes.

#### Modo Overlay (Experimental)

Passe `{ overlay: true }` para renderizar o componente como um modal flutuante sobre o conteúdo existente, sem limpar a tela:

```typescript
const result = await ctx.ui.custom<string | null>(
  (tui, theme, keybindings, done) => new MyOverlayComponent({ onClose: done }),
  { overlay: true }
);
```

Para posicionamento avançado (âncoras, margens, percentuais, visibilidade responsiva), passe `overlayOptions`. Use `onHandle` para controlar a visibilidade programaticamente:

```typescript
const result = await ctx.ui.custom<string | null>(
  (tui, theme, keybindings, done) => new MyOverlayComponent({ onClose: done }),
  {
    overlay: true,
    overlayOptions: { anchor: "top-right", width: "50%", margin: 2 },
    onHandle: (handle) => { /* handle.setHidden(true/false) */ }
  }
);
```

Veja [tui.md](tui.md) para a API completa de `OverlayOptions` e [overlay-qa-tests.ts](../examples/extensions/overlay-qa-tests.ts) para exemplos.

### Editor Personalizado

Substitui o editor de input principal por uma implementação personalizada (modo vim, modo emacs, etc.):

```typescript
import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";

class VimEditor extends CustomEditor {
  private mode: "normal" | "insert" = "insert";

  handleInput(data: string): void {
    if (matchesKey(data, "escape") && this.mode === "insert") {
      this.mode = "normal";
      return;
    }
    if (this.mode === "normal" && data === "i") {
      this.mode = "insert";
      return;
    }
    super.handleInput(data);  // Keybindings do app + edição de texto
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setEditorComponent((_tui, theme, keybindings) =>
      new VimEditor(theme, keybindings)
    );
  });
}
```

**Pontos-chave:**
- Estenda `CustomEditor` (não a base `Editor`) para obter keybindings do app (escape para abortar, ctrl+d, troca de modelo)
- Chame `super.handleInput(data)` para teclas que você não trata
- A factory recebe `theme` e `keybindings` do app
- Use `ctx.ui.getEditorComponent()` antes de `setEditorComponent()` para encapsular o editor personalizado configurado anteriormente
- Passe `undefined` para restaurar o padrão: `ctx.ui.setEditorComponent(undefined)`

Para compor com outra extensão que já substituiu o editor, capture a factory anterior antes de definir a sua:

```typescript
const previous = ctx.ui.getEditorComponent();
ctx.ui.setEditorComponent((tui, theme, keybindings) =>
  new MyEditor(tui, theme, keybindings, { base: previous?.(tui, theme, keybindings) })
);
```

Veja o Padrão 7 de [tui.md](tui.md) para um exemplo completo com indicador de modo.

### Renderização de Mensagem

Registra um renderizador personalizado para mensagens com seu `customType`:

```typescript
import { Text } from "@earendil-works/pi-tui";

pi.registerMessageRenderer("my-extension", (message, options, theme) => {
  const { expanded } = options;
  let text = theme.fg("accent", `[${message.customType}] `);
  text += message.content;

  if (expanded && message.details) {
    text += "\n" + theme.fg("dim", JSON.stringify(message.details, null, 2));
  }

  return new Text(text, 0, 0);
});
```

Mensagens são enviadas via `pi.sendMessage()`:

```typescript
pi.sendMessage({
  customType: "my-extension",  // Corresponde a registerMessageRenderer
  content: "Status update",
  display: true,               // Mostra na TUI
  details: { ... },            // Disponível no renderizador
});
```

### Cores de Tema

Todas as funções de renderização recebem um objeto `theme`. Veja [themes.md](themes.md) para criar temas personalizados e a paleta de cores completa.

```typescript
// Cores de primeiro plano
theme.fg("toolTitle", text)   // Nomes de ferramentas
theme.fg("accent", text)      // Destaques
theme.fg("success", text)     // Sucesso (verde)
theme.fg("error", text)       // Erros (vermelho)
theme.fg("warning", text)     // Avisos (amarelo)
theme.fg("muted", text)       // Texto secundário
theme.fg("dim", text)         // Texto terciário

// Estilos de texto
theme.bold(text)
theme.italic(text)
theme.strikethrough(text)
```

Para syntax highlighting em renderizadores de ferramentas personalizados:

```typescript
import { highlightCode, getLanguageFromPath } from "@earendil-works/pi-coding-agent";

// Destaca código com linguagem explícita
const highlighted = highlightCode("const x = 1;", "typescript", theme);

// Auto-detecta a linguagem a partir do caminho do arquivo
const lang = getLanguageFromPath("/path/to/file.rs");  // "rust"
const highlighted = highlightCode(code, lang, theme);
```

## Tratamento de Erros

- Erros de extensão são logados, o agente continua
- Erros de `tool_call` bloqueiam a ferramenta (fail-safe)
- Erros de `execute` da ferramenta devem ser sinalizados lançando-os; o erro lançado é capturado, reportado ao LLM com `isError: true`, e a execução continua

## Comportamento por Modo

| Modo | Métodos de UI | Notas |
|------|-----------|-------|
| Interativo | TUI completa | Operação normal |
| RPC (`--mode rpc`) | Protocolo JSON | O host trata a UI, veja [rpc.md](rpc.md) |
| JSON (`--mode json`) | No-op | Stream de eventos para stdout, veja [json.md](json.md) |
| Print (`-p`) | No-op | Extensões rodam mas não podem solicitar entrada |

Em modos não interativos, verifique `ctx.hasUI` antes de usar métodos de UI.

## Referência de Exemplos

Todos os exemplos em [examples/extensions/](../examples/extensions/).

| Exemplo | Descrição | APIs Principais |
|---------|-------------|----------|
| **Ferramentas** |||
| `hello.ts` | Registro mínimo de ferramenta | `registerTool` |
| `question.ts` | Ferramenta com interação do usuário | `registerTool`, `ui.select` |
| `questionnaire.ts` | Ferramenta wizard de múltiplos passos | `registerTool`, `ui.custom` |
| `todo.ts` | Ferramenta com estado e persistência | `registerTool`, `appendEntry`, `renderResult`, eventos de sessão |
| `dynamic-tools.ts` | Registrar ferramentas após a inicialização e durante comandos | `registerTool`, `session_start`, `registerCommand` |
| `structured-output.ts` | Ferramenta final de structured-output com `terminate: true` | `registerTool`, resultados de ferramenta terminantes |
| `truncated-tool.ts` | Exemplo de truncamento de saída | `registerTool`, `truncateHead` |
| `tool-override.ts` | Sobrescrever a ferramenta read built-in | `registerTool` (mesmo nome que built-in) |
| **Comandos** |||
| `pirate.ts` | Modificar o system prompt por turno | `registerCommand`, `before_agent_start` |
| `summarize.ts` | Comando de resumo de conversa | `registerCommand`, `ui.custom` |
| `handoff.ts` | Handoff de modelo entre provedores | `registerCommand`, `ui.editor`, `ui.custom` |
| `qna.ts` | Q&A com UI personalizada | `registerCommand`, `ui.custom`, `setEditorText` |
| `send-user-message.ts` | Injetar mensagens de usuário | `registerCommand`, `sendUserMessage` |
| `reload-runtime.ts` | Comando de reload e handoff de ferramenta do LLM | `registerCommand`, `ctx.reload()`, `sendUserMessage` |
| `shutdown-command.ts` | Comando de shutdown gracioso | `registerCommand`, `shutdown()` |
| **Eventos & Gates** |||
| `permission-gate.ts` | Bloquear comandos perigosos | `on("tool_call")`, `ui.confirm` |
| `protected-paths.ts` | Bloquear escritas em caminhos específicos | `on("tool_call")` |
| `confirm-destructive.ts` | Confirmar mudanças de sessão | `on("session_before_switch")`, `on("session_before_fork")` |
| `dirty-repo-guard.ts` | Avisar em repo git sujo | `on("session_before_*")`, `exec` |
| `input-transform.ts` | Transformar entrada do usuário | `on("input")` |
| `model-status.ts` | Reagir a mudanças de modelo | `on("model_select")`, `setStatus` |
| `provider-payload.ts` | Inspecionar payloads e headers de resposta do provedor | `on("before_provider_request")`, `on("after_provider_response")` |
| `system-prompt-header.ts` | Exibir info do system prompt | `on("agent_start")`, `getSystemPrompt` |
| `claude-rules.ts` | Carregar regras de arquivos | `on("session_start")`, `on("before_agent_start")` |
| `prompt-customizer.ts` | Adicionar orientação de ferramenta ciente de contexto usando `systemPromptOptions` | `on("before_agent_start")`, `BuildSystemPromptOptions` |
| `file-trigger.ts` | File watcher dispara mensagens | `sendMessage` |
| **Compactação & Sessões** |||
| `custom-compaction.ts` | Resumo de compactação personalizado | `on("session_before_compact")` |
| `trigger-compact.ts` | Acionar compactação manualmente | `compact()` |
| `git-checkpoint.ts` | Git stash em turnos | `on("turn_start")`, `on("session_before_fork")`, `exec` |
| `auto-commit-on-exit.ts` | Commit no shutdown | `on("session_shutdown")`, `exec` |
| **Componentes de UI** |||
| `status-line.ts` | Indicador de status no rodapé | `setStatus`, eventos de sessão |
| `working-indicator.ts` | Personalizar o indicador de trabalho do streaming | `setWorkingIndicator`, `registerCommand` |
| `github-issue-autocomplete.ts` | Adicionar completar de issues `#1234` sobre o autocomplete built-in pré-carregando issues abertas recentes de `gh issue list` | `addAutocompleteProvider`, `on("session_start")`, `exec` |
| `custom-footer.ts` | Substituir o rodapé inteiramente | `registerCommand`, `setFooter` |
| `custom-header.ts` | Substituir o cabeçalho de inicialização | `on("session_start")`, `setHeader` |
| `modal-editor.ts` | Editor modal estilo vim | `setEditorComponent`, `CustomEditor` |
| `rainbow-editor.ts` | Estilização de editor personalizada | `setEditorComponent` |
| `widget-placement.ts` | Widget acima/abaixo do editor | `setWidget` |
| `overlay-test.ts` | Componentes de overlay | `ui.custom` com opções de overlay |
| `overlay-qa-tests.ts` | Testes abrangentes de overlay | `ui.custom`, todas as opções de overlay |
| `notify.ts` | Notificações simples | `ui.notify` |
| `timed-confirm.ts` | Diálogos com timeout | `ui.confirm` com timeout/signal |
| `mac-system-theme.ts` | Auto-trocar tema | `setTheme`, `exec` |
| **Extensões Complexas** |||
| `plan-mode/` | Implementação completa de plan mode | Todos os tipos de evento, `registerCommand`, `registerShortcut`, `registerFlag`, `setStatus`, `setWidget`, `sendMessage`, `setActiveTools` |
| `preset.ts` | Presets salváveis (modelo, ferramentas, thinking) | `registerCommand`, `registerShortcut`, `registerFlag`, `setModel`, `setActiveTools`, `setThinkingLevel`, `appendEntry` |
| `tools.ts` | UI de toggle de ferramentas on/off | `registerCommand`, `setActiveTools`, `SettingsList`, eventos de sessão |
| **Remoto & Sandbox** |||
| `ssh.ts` | Execução remota SSH | `registerFlag`, `on("user_bash")`, `on("before_agent_start")`, operações de ferramenta |
| `interactive-shell.ts` | Sessão de shell persistente | `on("user_bash")` |
| `sandbox/` | Execução de ferramenta em sandbox | Operações de ferramenta |
| `subagent/` | Spawn de sub-agentes | `registerTool`, `exec` |
| **Jogos** |||
| `snake.ts` | Jogo Snake | `registerCommand`, `ui.custom`, tratamento de teclado |
| `space-invaders.ts` | Jogo Space Invaders | `registerCommand`, `ui.custom` |
| `doom-overlay/` | Doom em overlay | `ui.custom` com overlay |
| **Provedores** |||
| `custom-provider-anthropic/` | Proxy Anthropic personalizado | `registerProvider` |
| `custom-provider-gitlab-duo/` | Integração GitLab Duo | `registerProvider` com OAuth |
| **Mensagens & Comunicação** |||
| `message-renderer.ts` | Renderização de mensagem personalizada | `registerMessageRenderer`, `sendMessage` |
| `event-bus.ts` | Eventos entre extensões | `pi.events` |
| **Metadados de Sessão** |||
| `session-name.ts` | Nomear sessões para o seletor | `setSessionName`, `getSessionName` |
| `bookmark.ts` | Marcar entradas para /tree | `setLabel` |
| **Diversos** |||
| `inline-bash.ts` | Bash inline em chamadas de ferramenta | `on("tool_call")` |
| `bash-spawn-hook.ts` | Ajustar comando bash, cwd e env antes da execução | `createBashTool`, `spawnHook` |
| `with-deps/` | Extensão com dependências npm | Estrutura de pacote com `package.json` |
