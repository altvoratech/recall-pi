# Provedores Personalizados

Extensões podem registrar provedores de modelos personalizados via `pi.registerProvider()`. Isso possibilita:

- **Proxies** - Rotear requisições através de proxies corporativos ou gateways de API
- **Endpoints personalizados** - Usar implantações de modelos auto-hospedados ou privados
- **OAuth/SSO** - Adicionar fluxos de autenticação para provedores corporativos
- **APIs personalizadas** - Implementar streaming para APIs LLM não padrão

## Exemplos de Extensão

Veja estes exemplos completos de provedor:

- [`examples/extensions/custom-provider-anthropic/`](../examples/extensions/custom-provider-anthropic/)
- [`examples/extensions/custom-provider-gitlab-duo/`](../examples/extensions/custom-provider-gitlab-duo/)

## Índice

- [Exemplos de Extensão](#exemplos-de-extensão)
- [Referência Rápida](#referência-rápida)
- [Substituir Provedor Existente](#substituir-provedor-existente)
- [Registrar Novo Provedor](#registrar-novo-provedor)
- [Cancelar Registro de Provedor](#cancelar-registro-de-provedor)
- [Suporte a OAuth](#suporte-a-oauth)
- [API de Streaming Personalizada](#api-de-streaming-personalizada)
- [Testando Sua Implementação](#testando-sua-implementação)
- [Referência de Configuração](#referência-de-configuração)
- [Referência de Definição de Modelo](#referência-de-definição-de-modelo)

## Referência Rápida

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Substituir baseUrl para provedor existente
  pi.registerProvider("anthropic", {
    baseUrl: "https://proxy.example.com"
  });

  // Registrar novo provedor com modelos
  pi.registerProvider("my-provider", {
    name: "Meu Provedor",
    baseUrl: "https://api.example.com",
    apiKey: "MY_API_KEY",
    api: "openai-completions",
    models: [
      {
        id: "my-model",
        name: "Meu Modelo",
        reasoning: false,
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096
      }
    ]
  });
}
```

A factory da extensão também pode ser `async`. Para descoberta dinâmica de modelos, busque e registre modelos na factory em vez de `session_start`. O pi aguarda a factory antes de continuar a inicialização, então o provedor está disponível durante a inicialização interativa e para `pi --list-models`.

## Substituir Provedor Existente

O caso de uso mais simples: redirecionar um provedor existente através de um proxy.

```typescript
// Todas as requisições do Anthropic agora vão através do seu proxy
pi.registerProvider("anthropic", {
  baseUrl: "https://proxy.example.com"
});

// Adicionar cabeçalhos personalizados às requisições do OpenAI
pi.registerProvider("openai", {
  headers: {
    "X-Custom-Header": "value"
  }
});

// Tanto baseUrl quanto headers
pi.registerProvider("google", {
  baseUrl: "https://ai-gateway.corp.com/google",
  headers: {
    "X-Corp-Auth": "CORP_AUTH_TOKEN"  // variável de ambiente ou literal
  }
});
```

Quando apenas `baseUrl` e/ou `headers` são fornecidos (sem `models`), todos os modelos existentes para esse provedor são preservados com o novo endpoint.

## Registrar Novo Provedor

Para adicionar um provedor completamente novo, especifique `models` junto com a configuração necessária.

Se a lista de modelos vem de um endpoint remoto, use uma factory de extensão async:

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

Isso registra os modelos buscados antes que a inicialização termine.

```typescript
pi.registerProvider("my-llm", {
  baseUrl: "https://api.my-llm.com/v1",
  apiKey: "MY_LLM_API_KEY",  // nome de variável de ambiente ou valor literal
  api: "openai-completions",  // qual API de streaming usar
  models: [
    {
      id: "my-llm-large",
      name: "My LLM Large",
      reasoning: true,        // suporta raciocínio estendido
      input: ["text", "image"],
      cost: {
        input: 3.0,           // $/milhão de tokens
        output: 15.0,
        cacheRead: 0.3,
        cacheWrite: 3.75
      },
      contextWindow: 200000,
      maxTokens: 16384
    }
  ]
});
```

Quando `models` é fornecido, ele **substitui** todos os modelos existentes para esse provedor.

## Cancelar Registro de Provedor

Use `pi.unregisterProvider(name)` para remover um provedor que foi previamente registrado via `pi.registerProvider(name, ...)`:

```typescript
// Registrar
pi.registerProvider("my-llm", {
  baseUrl: "https://api.my-llm.com/v1",
  apiKey: "MY_LLM_API_KEY",
  api: "openai-completions",
  models: [
    {
      id: "my-llm-large",
      name: "My LLM Large",
      reasoning: true,
      input: ["text", "image"],
      cost: { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
      contextWindow: 200000,
      maxTokens: 16384
    }
  ]
});

// Mais tarde, remover
pi.unregisterProvider("my-llm");
```

Cancelar o registro remove os modelos dinâmicos desse provedor, o fallback de chave de API, o registro de provedor OAuth e os registros de handler de stream personalizado. Qualquer modelo integrado ou comportamento de provedor que foi substituído é restaurado.

Chamadas feitas após a fase de carregamento inicial da extensão são aplicadas imediatamente, então nenhum `/reload` é necessário.

### Tipos de API

O campo `api` determina qual implementação de streaming é usada:

| API | Use para |
|-----|---------|
| `anthropic-messages` | API Claude do Anthropic e compatíveis |
| `openai-completions` | API OpenAI Chat Completions e compatíveis |
| `openai-responses` | OpenAI Responses API |
| `azure-openai-responses` | Azure OpenAI Responses API |
| `openai-codex-responses` | OpenAI Codex Responses API |
| `mistral-conversations` | SDK Mistral Conversations/Chat streaming |
| `google-generative-ai` | Google Generative AI API |
| `google-vertex` | Google Vertex AI API |
| `bedrock-converse-stream` | Amazon Bedrock Converse API |

A maioria dos provedores compatíveis com OpenAI funciona com `openai-completions`. Use `thinkingLevelMap` no nível do modelo para níveis de raciocínio específicos do modelo, e `compat` para peculiaridades do provedor:

```typescript
models: [{
  id: "custom-model",
  // ...
  reasoning: true,
  thinkingLevelMap: {              // mapeia níveis do pi para valores do provedor; null oculta níveis não suportados
    minimal: null,
    low: null,
    medium: null,
    high: "default",
    xhigh: "max"
  },
  compat: {
    supportsDeveloperRole: false,   // usar "system" em vez de "developer"
    supportsReasoningEffort: true,
    maxTokensField: "max_tokens",   // em vez de "max_completion_tokens"
    requiresToolResultName: true,   // resultados de ferramenta precisam do campo name
    thinkingFormat: "qwen",        // enable_thinking: true de nível superior
    cacheControlFormat: "anthropic" // marcadores cache_control no estilo Anthropic
  }
}]
```

Use `openrouter` para controles `reasoning: { effort }` no estilo OpenRouter. Use `together` para controles `reasoning: { enabled }` no estilo Together; com `supportsReasoningEffort`, também envia `reasoning_effort`. Use `qwen-chat-template` para servidores locais compatíveis com Qwen que leem `chat_template_kwargs.enable_thinking`.
Use `cacheControlFormat: "anthropic"` para provedores compatíveis com OpenAI que expõem cache de prompt no estilo Anthropic via `cache_control` no prompt de sistema, última definição de ferramenta e último conteúdo de texto usuário/assistente.

> Nota de migração: O Mistral passou de `openai-completions` para `mistral-conversations`.
> Use `mistral-conversations` para modelos Mistral nativos.
> Se você intencionalmente roteia endpoints compatíveis com Mistral/personalizados através de `openai-completions`, defina flags de `compat` explicitamente conforme necessário.

### Cabeçalho de Autenticação

Se o seu provedor espera `Authorization: Bearer <key>` mas não usa uma API padrão, defina `authHeader: true`:

```typescript
pi.registerProvider("custom-api", {
  baseUrl: "https://api.example.com",
  apiKey: "MY_API_KEY",
  authHeader: true,  // adiciona cabeçalho Authorization: Bearer automaticamente
  api: "openai-completions",
  models: [...]
});
```

## Suporte a OAuth

Adicione autenticação OAuth/SSO que se integra ao `/login`:

```typescript
import type { OAuthCredentials, OAuthLoginCallbacks } from "@earendil-works/pi-ai";

pi.registerProvider("corporate-ai", {
  baseUrl: "https://ai.corp.com/v1",
  api: "openai-responses",
  models: [...],
  oauth: {
    name: "Corporate AI (SSO)",

    async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
      // Opção 1: OAuth baseado em navegador
      callbacks.onAuth({ url: "https://sso.corp.com/authorize?..." });

      // Opção 2: Fluxo de código de dispositivo
      callbacks.onDeviceCode({
        userCode: "ABCD-1234",
        verificationUri: "https://sso.corp.com/device"
      });

      // Opção 3: Solicitar token/código
      const code = await callbacks.onPrompt({ message: "Insira o código SSO:" });

      // Trocar por tokens (sua implementação)
      const tokens = await exchangeCodeForTokens(code);

      return {
        refresh: tokens.refreshToken,
        access: tokens.accessToken,
        expires: Date.now() + tokens.expiresIn * 1000
      };
    },

    async refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
      const tokens = await refreshAccessToken(credentials.refresh);
      return {
        refresh: tokens.refreshToken ?? credentials.refresh,
        access: tokens.accessToken,
        expires: Date.now() + tokens.expiresIn * 1000
      };
    },

    getApiKey(credentials: OAuthCredentials): string {
      return credentials.access;
    },

    // Opcional: modificar modelos com base na assinatura do usuário
    modifyModels(models, credentials) {
      const region = decodeRegionFromToken(credentials.access);
      return models.map(m => ({
        ...m,
        baseUrl: `https://${region}.ai.corp.com/v1`
      }));
    }
  }
});
```

Após o registro, os usuários podem se autenticar via `/login corporate-ai`.

### OAuthLoginCallbacks

O objeto `callbacks` fornece três formas de autenticar:

```typescript
interface OAuthLoginCallbacks {
  // Abrir URL no navegador (para redirecionamentos OAuth)
  onAuth(params: { url: string }): void;

  // Mostrar código de dispositivo (para fluxo de autorização de dispositivo)
  onDeviceCode(params: { userCode: string; verificationUri: string }): void;

  // Solicitar entrada do usuário (para entrada manual de token)
  onPrompt(params: { message: string }): Promise<string>;
}
```

### OAuthCredentials

As credenciais são persistidas em `~/.pi/agent/auth.json`:

```typescript
interface OAuthCredentials {
  refresh: string;   // Token de atualização (para refreshToken())
  access: string;    // Token de acesso (retornado por getApiKey())
  expires: number;   // Timestamp de expiração em milissegundos
}
```

## API de Streaming Personalizada

Para provedores com APIs não padrão, implemente `streamSimple`. Estude as implementações de provedor existentes antes de escrever a sua:

**Implementações de referência:**
- [anthropic.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/ai/src/providers/anthropic.ts) - Anthropic Messages API
- [mistral.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/ai/src/providers/mistral.ts) - Mistral Conversations API
- [openai-completions.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/ai/src/providers/openai-completions.ts) - OpenAI Chat Completions
- [openai-responses.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/ai/src/providers/openai-responses.ts) - OpenAI Responses API
- [google.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/ai/src/providers/google.ts) - Google Generative AI
- [amazon-bedrock.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/ai/src/providers/amazon-bedrock.ts) - AWS Bedrock

### Padrão de Stream

Todos os provedores seguem o mesmo padrão:

```typescript
import {
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
  calculateCost,
  createAssistantMessageEventStream,
} from "@earendil-works/pi-ai";

function streamMyProvider(
  model: Model<any>,
  context: Context,
  options?: SimpleStreamOptions
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();

  (async () => {
    // Inicializar mensagem de saída
    const output: AssistantMessage = {
      role: "assistant",
      content: [],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: Date.now(),
    };

    try {
      // Enviar evento de início
      stream.push({ type: "start", partial: output });

      // Fazer requisição de API e processar resposta...
      // Enviar eventos de conteúdo conforme chegam...

      // Enviar evento de conclusão
      stream.push({
        type: "done",
        reason: output.stopReason as "stop" | "length" | "toolUse",
        message: output
      });
      stream.end();
    } catch (error) {
      output.stopReason = options?.signal?.aborted ? "aborted" : "error";
      output.errorMessage = error instanceof Error ? error.message : String(error);
      stream.push({ type: "error", reason: output.stopReason, error: output });
      stream.end();
    }
  })();

  return stream;
}
```

### Tipos de Eventos

Envie eventos via `stream.push()` nesta ordem:

1. `{ type: "start", partial: output }` - Stream iniciado

2. Eventos de conteúdo (repetíveis, acompanhe `contentIndex` para cada bloco):
   - `{ type: "text_start", contentIndex, partial }` - Bloco de texto iniciado
   - `{ type: "text_delta", contentIndex, delta, partial }` - Fragmento de texto
   - `{ type: "text_end", contentIndex, content, partial }` - Bloco de texto encerrado
   - `{ type: "thinking_start", contentIndex, partial }` - Raciocínio iniciado
   - `{ type: "thinking_delta", contentIndex, delta, partial }` - Fragmento de raciocínio
   - `{ type: "thinking_end", contentIndex, content, partial }` - Raciocínio encerrado
   - `{ type: "toolcall_start", contentIndex, partial }` - Chamada de ferramenta iniciada
   - `{ type: "toolcall_delta", contentIndex, delta, partial }` - Fragmento JSON da chamada de ferramenta
   - `{ type: "toolcall_end", contentIndex, toolCall, partial }` - Chamada de ferramenta encerrada

3. `{ type: "done", reason, message }` ou `{ type: "error", reason, error }` - Stream encerrado

O campo `partial` em cada evento contém o estado atual de `AssistantMessage`. Atualize `output.content` conforme você recebe dados e inclua `output` como `partial`.

### Blocos de Conteúdo

Adicione blocos de conteúdo a `output.content` conforme chegam:

```typescript
// Bloco de texto
output.content.push({ type: "text", text: "" });
stream.push({ type: "text_start", contentIndex: output.content.length - 1, partial: output });

// Conforme o texto chega
const block = output.content[contentIndex];
if (block.type === "text") {
  block.text += delta;
  stream.push({ type: "text_delta", contentIndex, delta, partial: output });
}

// Quando o bloco é concluído
stream.push({ type: "text_end", contentIndex, content: block.text, partial: output });
```

### Chamadas de Ferramenta

Chamadas de ferramenta requerem acumulação e análise de JSON:

```typescript
// Iniciar chamada de ferramenta
output.content.push({
  type: "toolCall",
  id: toolCallId,
  name: toolName,
  arguments: {}
});
stream.push({ type: "toolcall_start", contentIndex: output.content.length - 1, partial: output });

// Acumular JSON
let partialJson = "";
partialJson += jsonDelta;
try {
  block.arguments = JSON.parse(partialJson);
} catch {}
stream.push({ type: "toolcall_delta", contentIndex, delta: jsonDelta, partial: output });

// Concluir
stream.push({
  type: "toolcall_end",
  contentIndex,
  toolCall: { type: "toolCall", id, name, arguments: block.arguments },
  partial: output
});
```

### Uso e Custo

Atualize o uso a partir da resposta da API e calcule o custo:

```typescript
output.usage.input = response.usage.input_tokens;
output.usage.output = response.usage.output_tokens;
output.usage.cacheRead = response.usage.cache_read_tokens ?? 0;
output.usage.cacheWrite = response.usage.cache_write_tokens ?? 0;
output.usage.totalTokens = output.usage.input + output.usage.output +
                           output.usage.cacheRead + output.usage.cacheWrite;
calculateCost(model, output.usage);
```

### Registro

Registre sua função de stream:

```typescript
pi.registerProvider("my-provider", {
  baseUrl: "https://api.example.com",
  apiKey: "MY_API_KEY",
  api: "my-custom-api",
  models: [...],
  streamSimple: streamMyProvider
});
```

## Testando Sua Implementação

Teste seu provedor contra os mesmos conjuntos de testes usados pelos provedores integrados. Copie e adapte estes arquivos de teste de [packages/ai/test/](https://github.com/earendil-works/pi-mono/tree/main/packages/ai/test):

| Teste | Finalidade |
|-------|-----------|
| `stream.test.ts` | Streaming básico, saída de texto |
| `tokens.test.ts` | Contagem de tokens e uso |
| `abort.test.ts` | Tratamento de AbortSignal |
| `empty.test.ts` | Respostas vazias/mínimas |
| `context-overflow.test.ts` | Limites da janela de contexto |
| `image-limits.test.ts` | Tratamento de entrada de imagem |
| `unicode-surrogate.test.ts` | Casos extremos de Unicode |
| `tool-call-without-result.test.ts` | Casos extremos de chamada de ferramenta |
| `image-tool-result.test.ts` | Imagens em resultados de ferramenta |
| `total-tokens.test.ts` | Cálculo total de tokens |
| `cross-provider-handoff.test.ts` | Handoff de contexto entre provedores |

Execute os testes com seus pares de provedor/modelo para verificar a compatibilidade.

## Referência de Configuração

```typescript
interface ProviderConfig {
  /** Nome de exibição do provedor na UI, como /login. */
  name?: string;

  /** URL do endpoint da API. Necessário ao definir modelos. */
  baseUrl?: string;

  /** Chave de API ou nome da variável de ambiente. Necessário ao definir modelos (exceto se oauth). */
  apiKey?: string;

  /** Tipo de API para streaming. Necessário no nível do provedor ou do modelo ao definir modelos. */
  api?: Api;

  /** Implementação de streaming personalizada para APIs não padrão. */
  streamSimple?: (
    model: Model<Api>,
    context: Context,
    options?: SimpleStreamOptions
  ) => AssistantMessageEventStream;

  /** Cabeçalhos personalizados para incluir nas requisições. Valores podem ser nomes de variáveis de ambiente. */
  headers?: Record<string, string>;

  /** Se true, adiciona cabeçalho Authorization: Bearer com a chave de API resolvida. */
  authHeader?: boolean;

  /** Modelos para registrar. Se fornecido, substitui todos os modelos existentes para este provedor. */
  models?: ProviderModelConfig[];

  /** Provedor OAuth para suporte ao /login. */
  oauth?: {
    name: string;
    login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials>;
    refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials>;
    getApiKey(credentials: OAuthCredentials): string;
    modifyModels?(models: Model<Api>[], credentials: OAuthCredentials): Model<Api>[];
  };
}
```

## Referência de Definição de Modelo

```typescript
interface ProviderModelConfig {
  /** ID do modelo (ex.: "claude-sonnet-4-20250514"). */
  id: string;

  /** Nome de exibição (ex.: "Claude 4 Sonnet"). */
  name: string;

  /** Substituição do tipo de API para este modelo específico. */
  api?: Api;

  /** Substituição da URL do endpoint da API para este modelo específico. */
  baseUrl?: string;

  /** Se o modelo suporta raciocínio estendido. */
  reasoning: boolean;

  /** Mapeia níveis de raciocínio do pi para valores específicos do provedor/modelo; null marca um nível como não suportado. */
  thinkingLevelMap?: Partial<Record<"off" | "minimal" | "low" | "medium" | "high" | "xhigh", string | null>>;

  /** Tipos de entrada suportados. */
  input: ("text" | "image")[];

  /** Custo por milhão de tokens (para rastreamento de uso). */
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };

  /** Tamanho máximo da janela de contexto em tokens. */
  contextWindow: number;

  /** Máximo de tokens de saída. */
  maxTokens: number;

  /** Cabeçalhos personalizados para este modelo específico. */
  headers?: Record<string, string>;

  /** Configurações de compatibilidade OpenAI para API openai-completions. */
  compat?: {
    supportsStore?: boolean;
    supportsDeveloperRole?: boolean;
    supportsReasoningEffort?: boolean;
    supportsUsageInStreaming?: boolean;
    maxTokensField?: "max_completion_tokens" | "max_tokens";
    requiresToolResultName?: boolean;
    requiresAssistantAfterToolResult?: boolean;
    requiresThinkingAsText?: boolean;
    requiresReasoningContentOnAssistantMessages?: boolean;
    thinkingFormat?: "openai" | "openrouter" | "deepseek" | "together" | "zai" | "qwen" | "qwen-chat-template";
    cacheControlFormat?: "anthropic";
  };
}
```

`openrouter` envia `reasoning: { effort }`. `deepseek` envia `thinking: { type: "enabled" | "disabled" }` e `reasoning_effort` quando habilitado. `together` envia `reasoning: { enabled }` e também `reasoning_effort` quando `supportsReasoningEffort` está habilitado. `qwen` é para `enable_thinking` de nível superior no estilo DashScope. Use `qwen-chat-template` para servidores locais compatíveis com Qwen que leem `chat_template_kwargs.enable_thinking`.
`cacheControlFormat: "anthropic"` aplica marcadores `cache_control` no estilo Anthropic ao prompt de sistema, última definição de ferramenta e último conteúdo de texto usuário/assistente.
