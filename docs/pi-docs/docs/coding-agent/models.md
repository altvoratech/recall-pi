# Modelos Personalizados

Adicione provedores e modelos personalizados (Ollama, vLLM, LM Studio, proxies) via `~/.pi/agent/models.json`.

## Índice

- [Exemplo Mínimo](#exemplo-mínimo)
- [Exemplo Completo](#exemplo-completo)
- [APIs Suportadas](#apis-suportadas)
- [Configuração do Provedor](#configuração-do-provedor)
- [Configuração do Modelo](#configuração-do-modelo)
- [Substituindo Provedores Integrados](#substituindo-provedores-integrados)
- [Substituições Por Modelo](#substituições-por-modelo)
- [Compatibilidade com Anthropic Messages](#compatibilidade-com-anthropic-messages)
- [Compatibilidade com OpenAI](#compatibilidade-com-openai)

## Exemplo Mínimo

Para modelos locais (Ollama, LM Studio, vLLM), apenas `id` é necessário por modelo:

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [
        { "id": "llama3.1:8b" },
        { "id": "qwen2.5-coder:7b" }
      ]
    }
  }
}
```

A `apiKey` é obrigatória, mas o Ollama a ignora, então qualquer valor funciona.

Alguns servidores compatíveis com OpenAI não entendem o papel `developer` usado para modelos com capacidade de raciocínio. Para esses provedores, defina `compat.supportsDeveloperRole` como `false` para que o pi envie o prompt de sistema como uma mensagem `system`. Se o servidor também não suportar `reasoning_effort`, defina `compat.supportsReasoningEffort` como `false` também.

Você pode definir `compat` no nível do provedor para aplicar a todos os modelos, ou no nível do modelo para substituir um modelo específico. Isso se aplica comumente ao Ollama, vLLM, SGLang e servidores semelhantes compatíveis com OpenAI.

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false
      },
      "models": [
        {
          "id": "gpt-oss:20b",
          "reasoning": true
        }
      ]
    }
  }
}
```

## Exemplo Completo

Substitua padrões quando você precisar de valores específicos:

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [
        {
          "id": "llama3.1:8b",
          "name": "Llama 3.1 8B (Local)",
          "reasoning": false,
          "input": ["text"],
          "contextWindow": 128000,
          "maxTokens": 32000,
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
        }
      ]
    }
  }
}
```

O arquivo é recarregado cada vez que você abre `/model`. Edite durante a sessão; sem necessidade de reiniciar.

## Exemplo Google AI Studio

Use `google-generative-ai` com uma `baseUrl` para adicionar modelos do Google AI Studio, incluindo entradas personalizadas do Gemma 4:

```json
{
  "providers": {
    "my-google": {
      "baseUrl": "https://generativelanguage.googleapis.com/v1beta",
      "api": "google-generative-ai",
      "apiKey": "GEMINI_API_KEY",
      "models": [
        {
          "id": "gemma-4-31b-it",
          "name": "Gemma 4 31B",
          "input": ["text", "image"],
          "contextWindow": 262144,
          "reasoning": true
        }
      ]
    }
  }
}
```

A `baseUrl` é obrigatória ao adicionar modelos personalizados ao tipo de API `google-generative-ai`.

## APIs Suportadas

| API | Descrição |
|-----|-----------|
| `openai-completions` | OpenAI Chat Completions (mais compatível) |
| `openai-responses` | OpenAI Responses API |
| `anthropic-messages` | Anthropic Messages API |
| `google-generative-ai` | Google Generative AI |

Defina `api` no nível do provedor (padrão para todos os modelos) ou no nível do modelo (substituição por modelo).

## Configuração do Provedor

| Campo | Descrição |
|-------|-----------|
| `baseUrl` | URL do endpoint da API |
| `api` | Tipo de API (veja acima) |
| `apiKey` | Chave de API (veja resolução de valor abaixo) |
| `headers` | Cabeçalhos personalizados (veja resolução de valor abaixo) |
| `authHeader` | Defina `true` para adicionar `Authorization: Bearer <apiKey>` automaticamente |
| `models` | Array de configurações de modelos |
| `modelOverrides` | Substituições por modelo para modelos integrados neste provedor |

### Resolução de Valor

Os campos `apiKey` e `headers` suportam três formatos:

- **Comando shell:** `"!comando"` executa e usa o stdout
  ```json
  "apiKey": "!security find-generic-password -ws 'anthropic'"
  "apiKey": "!op read 'op://vault/item/credential'"
  ```
- **Variável de ambiente:** Usa o valor da variável nomeada
  ```json
  "apiKey": "MY_API_KEY"
  ```
- **Valor literal:** Usado diretamente
  ```json
  "apiKey": "sk-..."
  ```

Para `models.json`, comandos shell são resolvidos no momento da requisição. O pi intencionalmente não aplica TTL integrado, reutilização obsoleta ou lógica de recuperação para comandos arbitrários. Diferentes comandos precisam de estratégias diferentes de cache e falha, e o pi não pode inferir a correta.

Se o seu comando for lento, caro, sujeito a limitação de taxa, ou dever continuar usando um valor anterior em falhas transitórias, envolva-o em seu próprio script ou comando que implemente o comportamento de cache ou TTL desejado.

As verificações de disponibilidade de `/model` usam a presença de autenticação configurada e não executam comandos shell.

### Cabeçalhos Personalizados

```json
{
  "providers": {
    "custom-proxy": {
      "baseUrl": "https://proxy.example.com/v1",
      "apiKey": "MY_API_KEY",
      "api": "anthropic-messages",
      "headers": {
        "x-portkey-api-key": "PORTKEY_API_KEY",
        "x-secret": "!op read 'op://vault/item/secret'"
      },
      "models": [...]
    }
  }
}
```

## Configuração do Modelo

| Campo | Obrigatório | Padrão | Descrição |
|-------|-------------|--------|-----------|
| `id` | Sim | — | Identificador do modelo (passado para a API) |
| `name` | Não | `id` | Rótulo legível do modelo. Usado para correspondência (padrões `--model`) e exibido nos detalhes/texto de status do modelo. |
| `api` | Não | `api` do provedor | Substituir a API do provedor para este modelo |
| `reasoning` | Não | `false` | Suporta raciocínio estendido |
| `thinkingLevelMap` | Não | omitido | Mapeia níveis de raciocínio do pi para valores do provedor e marca níveis não suportados (veja abaixo) |
| `input` | Não | `["text"]` | Tipos de entrada: `["text"]` ou `["text", "image"]` |
| `contextWindow` | Não | `128000` | Tamanho da janela de contexto em tokens |
| `maxTokens` | Não | `16384` | Máximo de tokens de saída |
| `cost` | Não | todos zeros | `{"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0}` (por milhão de tokens) |
| `compat` | Não | `compat` do provedor | Substituições de compatibilidade do provedor. Mesclado com `compat` do nível do provedor quando ambos estão definidos. |

Comportamento atual:
- `/model` e `--list-models` listam entradas pelo `id` do modelo.
- O `name` configurado é usado para correspondência de modelo e texto de detalhe/status.

### Mapa de Nível de Raciocínio

Use `thinkingLevelMap` em um modelo para descrever controles de raciocínio específicos do modelo. As chaves são os níveis de raciocínio do pi: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`.

Os valores são tristatos:

| Valor | Significado |
|-------|-------------|
| omitido | O nível é suportado e usa o mapeamento padrão do provedor |
| string | O nível é suportado e este valor é enviado ao provedor |
| `null` | O nível não é suportado e fica oculto/ignorado/limitado |

Exemplo para um modelo que suporta apenas raciocínio desativado, alto e máximo:

```json
{
  "id": "deepseek-v4-pro",
  "reasoning": true,
  "thinkingLevelMap": {
    "minimal": null,
    "low": null,
    "medium": null,
    "high": "high",
    "xhigh": "max"
  }
}
```

Exemplo para um modelo onde o raciocínio não pode ser desativado:

```json
{
  "id": "always-thinking-model",
  "reasoning": true,
  "thinkingLevelMap": {
    "off": null
  }
}
```

Migração: configurações antigas que usavam `compat.reasoningEffortMap` devem mover esse mapeamento para `thinkingLevelMap` no nível do modelo. Use `null` para níveis que não devem aparecer na UI.

## Substituindo Provedores Integrados

Roteie um provedor integrado através de um proxy sem redefinir os modelos:

```json
{
  "providers": {
    "anthropic": {
      "baseUrl": "https://my-proxy.example.com/v1"
    }
  }
}
```

Todos os modelos integrados do Anthropic permanecem disponíveis. A autenticação OAuth ou por chave de API existente continua funcionando.

Para mesclar modelos personalizados em um provedor integrado, inclua o array `models`:

```json
{
  "providers": {
    "anthropic": {
      "baseUrl": "https://my-proxy.example.com/v1",
      "apiKey": "ANTHROPIC_API_KEY",
      "api": "anthropic-messages",
      "models": [...]
    }
  }
}
```

Semântica de mesclagem:
- Modelos integrados são mantidos.
- Modelos personalizados são inseridos/atualizados por `id` dentro do provedor.
- Se um `id` de modelo personalizado corresponder a um `id` de modelo integrado, o modelo personalizado substitui o modelo integrado.
- Se um `id` de modelo personalizado for novo, ele é adicionado junto com os modelos integrados.

## Substituições Por Modelo

Use `modelOverrides` para personalizar modelos integrados específicos sem substituir a lista completa de modelos do provedor.

```json
{
  "providers": {
    "openrouter": {
      "modelOverrides": {
        "anthropic/claude-sonnet-4": {
          "name": "Claude Sonnet 4 (Rota Bedrock)",
          "compat": {
            "openRouterRouting": {
              "only": ["amazon-bedrock"]
            }
          }
        }
      }
    }
  }
}
```

`modelOverrides` suporta estes campos por modelo: `name`, `reasoning`, `input`, `cost` (parcial), `contextWindow`, `maxTokens`, `headers`, `compat`.

Notas de comportamento:
- `modelOverrides` são aplicados aos modelos integrados do provedor.
- IDs de modelo desconhecidos são ignorados.
- Você pode combinar `baseUrl`/`headers` no nível do provedor com `modelOverrides`.
- Se `models` também estiver definido para um provedor, os modelos personalizados são mesclados após as substituições integradas. Um modelo personalizado com o mesmo `id` substitui a entrada de modelo integrado substituída.

## Compatibilidade com Anthropic Messages

Para provedores ou proxies usando `api: "anthropic-messages"`, use `compat.supportsEagerToolInputStreaming` para controlar a compatibilidade de streaming fino de ferramentas do Anthropic.

Por padrão, o pi envia `eager_input_streaming: true` por ferramenta. Se um proxy ou backend compatível com Anthropic rejeitar esse campo, defina `supportsEagerToolInputStreaming` como `false`. O Pi omitirá `tools[].eager_input_streaming` e enviará o cabeçalho beta legado `fine-grained-tool-streaming-2025-05-14` para requisições com ferramentas habilitadas.

```json
{
  "providers": {
    "anthropic-proxy": {
      "baseUrl": "https://proxy.example.com",
      "api": "anthropic-messages",
      "apiKey": "ANTHROPIC_PROXY_KEY",
      "compat": {
        "supportsEagerToolInputStreaming": false,
        "supportsLongCacheRetention": true
      },
      "models": [
        {
          "id": "claude-opus-4-7",
          "reasoning": true,
          "input": ["text", "image"]
        }
      ]
    }
  }
}
```

| Campo | Descrição |
|-------|-----------|
| `supportsEagerToolInputStreaming` | Se o provedor aceita `eager_input_streaming` por ferramenta. Padrão: `true`. Defina como `false` para omitir esse campo e usar o cabeçalho beta legado de streaming fino de ferramentas em requisições com ferramentas. |
| `supportsLongCacheRetention` | Se o provedor aceita retenção de cache longa do Anthropic (`cache_control.ttl: "1h"`) quando a retenção de cache é `long`. Padrão: `true`. |

## Compatibilidade com OpenAI

Para provedores com compatibilidade parcial com OpenAI, use o campo `compat`.

- `compat` no nível do provedor aplica padrões a todos os modelos sob esse provedor.
- `compat` no nível do modelo substitui os valores no nível do provedor para esse modelo.

```json
{
  "providers": {
    "local-llm": {
      "baseUrl": "http://localhost:8080/v1",
      "api": "openai-completions",
      "compat": {
        "supportsUsageInStreaming": false,
        "maxTokensField": "max_tokens"
      },
      "models": [...]
    }
  }
}
```

| Campo | Descrição |
|-------|-----------|
| `supportsStore` | Provedor suporta campo `store` |
| `supportsDeveloperRole` | Usar papel `developer` vs `system` |
| `supportsReasoningEffort` | Suporte para parâmetro `reasoning_effort` |
| `supportsUsageInStreaming` | Suporta `stream_options: { include_usage: true }` (padrão: `true`) |
| `maxTokensField` | Usar `max_completion_tokens` ou `max_tokens` |
| `requiresToolResultName` | Incluir `name` em mensagens de resultado de ferramenta |
| `requiresAssistantAfterToolResult` | Inserir uma mensagem do assistente antes de uma mensagem do usuário após resultados de ferramenta |
| `requiresThinkingAsText` | Converter blocos de raciocínio para texto simples |
| `requiresReasoningContentOnAssistantMessages` | Incluir `reasoning_content` vazio em todas as mensagens do assistente reproduzidas quando o raciocínio está habilitado |
| `thinkingFormat` | Usar parâmetros de raciocínio `reasoning_effort`, `openrouter`, `deepseek`, `together`, `zai`, `qwen` ou `qwen-chat-template` |
| `cacheControlFormat` | Usar marcadores `cache_control` no estilo Anthropic no prompt de sistema, última definição de ferramenta e último conteúdo de texto usuário/assistente. Atualmente apenas `anthropic` é suportado. |
| `supportsStrictMode` | Incluir o campo `strict` nas definições de ferramentas |
| `supportsLongCacheRetention` | Se o provedor aceita retenção de cache longa quando a retenção de cache é `long`: `prompt_cache_retention: "24h"` para cache de prompt OpenAI, ou `cache_control.ttl: "1h"` quando `cacheControlFormat` é `anthropic`. Padrão: `true`. |
| `openRouterRouting` | Preferências de roteamento de provedor do OpenRouter. Este objeto é enviado como está no campo `provider` da [requisição de API do OpenRouter](https://openrouter.ai/docs/guides/routing/provider-selection). |
| `vercelGatewayRouting` | Configuração de roteamento do Vercel AI Gateway para seleção de provedor (`only`, `order`) |

`openrouter` usa `reasoning: { effort }`. `together` usa `reasoning: { enabled }` e também `reasoning_effort` quando `supportsReasoningEffort` está habilitado. `qwen` usa `enable_thinking` de nível superior. Use `qwen-chat-template` para servidores locais compatíveis com Qwen que requerem `chat_template_kwargs.enable_thinking`.

`cacheControlFormat: "anthropic"` é para provedores compatíveis com OpenAI que expõem cache de prompt no estilo Anthropic através de marcadores `cache_control` em conteúdo de texto e definições de ferramentas.

Exemplo:

```json
{
  "providers": {
    "openrouter": {
      "baseUrl": "https://openrouter.ai/api/v1",
      "apiKey": "OPENROUTER_API_KEY",
      "api": "openai-completions",
      "models": [
        {
          "id": "openrouter/anthropic/claude-3.5-sonnet",
          "name": "OpenRouter Claude 3.5 Sonnet",
          "compat": {
            "openRouterRouting": {
              "allow_fallbacks": true,
              "require_parameters": false,
              "data_collection": "deny",
              "zdr": true,
              "enforce_distillable_text": false,
              "order": ["anthropic", "amazon-bedrock", "google-vertex"],
              "only": ["anthropic", "amazon-bedrock"],
              "ignore": ["gmicloud", "friendli"],
              "quantizations": ["fp16", "bf16"],
              "sort": {
                "by": "price",
                "partition": "model"
              },
              "max_price": {
                "prompt": 10,
                "completion": 20
              },
              "preferred_min_throughput": {
                "p50": 100,
                "p90": 50
              },
              "preferred_max_latency": {
                "p50": 1,
                "p90": 3,
                "p99": 5
              }
            }
          }
        }
      ]
    }
  }
}
```

Exemplo com Vercel AI Gateway:

```json
{
  "providers": {
    "vercel-ai-gateway": {
      "baseUrl": "https://ai-gateway.vercel.sh/v1",
      "apiKey": "AI_GATEWAY_API_KEY",
      "api": "openai-completions",
      "models": [
        {
          "id": "moonshotai/kimi-k2.5",
          "name": "Kimi K2.5 (Fireworks via Vercel)",
          "reasoning": true,
          "input": ["text", "image"],
          "cost": { "input": 0.6, "output": 3, "cacheRead": 0, "cacheWrite": 0 },
          "contextWindow": 262144,
          "maxTokens": 262144,
          "compat": {
            "vercelGatewayRouting": {
              "only": ["fireworks", "novita"],
              "order": ["fireworks", "novita"]
            }
          }
        }
      ]
    }
  }
}
```
