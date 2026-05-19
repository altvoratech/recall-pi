# Provedores

O Pi suporta provedores baseados em assinatura via OAuth e provedores com chave de API via variáveis de ambiente ou arquivo de autenticação. Para cada provedor, o pi conhece todos os modelos disponíveis. A lista é atualizada a cada lançamento do pi.

## Índice

- [Assinaturas](#assinaturas)
- [Chaves de API](#chaves-de-api)
- [Arquivo de Autenticação](#arquivo-de-autenticação)
- [Provedores na Nuvem](#provedores-na-nuvem)
- [Provedores Personalizados](#provedores-personalizados)
- [Ordem de Resolução](#ordem-de-resolução)

## Assinaturas

Use `/login` no modo interativo e selecione um provedor:

- ChatGPT Plus/Pro (Codex)
- Claude Pro/Max
- GitHub Copilot

Use `/logout` para limpar as credenciais. Os tokens são armazenados em `~/.pi/agent/auth.json` e são renovados automaticamente quando expiram.

### OpenAI Codex

- Requer assinatura ChatGPT Plus ou Pro
- Oficialmente endossado pela OpenAI: [Codex para OSS](https://developers.openai.com/community/codex-for-oss)

### Claude Pro/Max

A autenticação por assinatura da Anthropic está ativa para contas Claude Pro/Max. O uso por harness de terceiros é debitado do [uso extra](https://claude.ai/settings/usage) e cobrado por token, não contra os limites do plano Claude.

### GitHub Copilot

- Pressione Enter para github.com, ou insira seu domínio do GitHub Enterprise Server
- Se você receber "model not supported", habilite no VS Code: Copilot Chat → seletor de modelo → selecione o modelo → "Enable"

## Chaves de API

### Variáveis de Ambiente ou Arquivo de Autenticação

Use `/login` no modo interativo e selecione um provedor para armazenar uma chave de API em `auth.json`, ou defina credenciais via variável de ambiente:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
pi
```

| Provedor | Variável de Ambiente | Chave em `auth.json` |
|----------|----------------------|----------------------|
| Anthropic | `ANTHROPIC_API_KEY` | `anthropic` |
| Azure OpenAI Responses | `AZURE_OPENAI_API_KEY` | `azure-openai-responses` |
| OpenAI | `OPENAI_API_KEY` | `openai` |
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek` |
| Google Gemini | `GEMINI_API_KEY` | `google` |
| Mistral | `MISTRAL_API_KEY` | `mistral` |
| Groq | `GROQ_API_KEY` | `groq` |
| Cerebras | `CEREBRAS_API_KEY` | `cerebras` |
| Cloudflare AI Gateway | `CLOUDFLARE_API_KEY` (+ `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_GATEWAY_ID`) | `cloudflare-ai-gateway` |
| Cloudflare Workers AI | `CLOUDFLARE_API_KEY` (+ `CLOUDFLARE_ACCOUNT_ID`) | `cloudflare-workers-ai` |
| xAI | `XAI_API_KEY` | `xai` |
| OpenRouter | `OPENROUTER_API_KEY` | `openrouter` |
| Vercel AI Gateway | `AI_GATEWAY_API_KEY` | `vercel-ai-gateway` |
| ZAI | `ZAI_API_KEY` | `zai` |
| OpenCode Zen | `OPENCODE_API_KEY` | `opencode` |
| OpenCode Go | `OPENCODE_API_KEY` | `opencode-go` |
| Hugging Face | `HF_TOKEN` | `huggingface` |
| Fireworks | `FIREWORKS_API_KEY` | `fireworks` |
| Together AI | `TOGETHER_API_KEY` | `together` |
| Kimi For Coding | `KIMI_API_KEY` | `kimi-coding` |
| MiniMax | `MINIMAX_API_KEY` | `minimax` |
| MiniMax (China) | `MINIMAX_CN_API_KEY` | `minimax-cn` |
| Xiaomi MiMo | `XIAOMI_API_KEY` | `xiaomi` |
| Xiaomi MiMo Token Plan (China) | `XIAOMI_TOKEN_PLAN_CN_API_KEY` | `xiaomi-token-plan-cn` |
| Xiaomi MiMo Token Plan (Amsterdam) | `XIAOMI_TOKEN_PLAN_AMS_API_KEY` | `xiaomi-token-plan-ams` |
| Xiaomi MiMo Token Plan (Singapore) | `XIAOMI_TOKEN_PLAN_SGP_API_KEY` | `xiaomi-token-plan-sgp` |

Referência para variáveis de ambiente e chaves de `auth.json`: [`const envMap`](https://github.com/earendil-works/pi-mono/blob/main/packages/ai/src/env-api-keys.ts) em [`packages/ai/src/env-api-keys.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/ai/src/env-api-keys.ts).

#### Arquivo de Autenticação

Armazene credenciais em `~/.pi/agent/auth.json`:

```json
{
  "anthropic": { "type": "api_key", "key": "sk-ant-..." },
  "openai": { "type": "api_key", "key": "sk-..." },
  "deepseek": { "type": "api_key", "key": "sk-..." },
  "google": { "type": "api_key", "key": "..." },
  "opencode": { "type": "api_key", "key": "..." },
  "opencode-go": { "type": "api_key", "key": "..." },
  "together": { "type": "api_key", "key": "..." },
  "xiaomi": { "type": "api_key", "key": "..." },
  "xiaomi-token-plan-cn":  { "type": "api_key", "key": "..." },
  "xiaomi-token-plan-ams": { "type": "api_key", "key": "..." },
  "xiaomi-token-plan-sgp": { "type": "api_key", "key": "..." }
}
```

O arquivo é criado com permissões `0600` (somente leitura/escrita do usuário). Credenciais do arquivo de autenticação têm prioridade sobre variáveis de ambiente.

### Resolução de Chave

O campo `key` suporta três formatos:

- **Comando shell:** `"!comando"` executa e usa o stdout (armazenado em cache pelo tempo de vida do processo)
  ```json
  { "type": "api_key", "key": "!security find-generic-password -ws 'anthropic'" }
  { "type": "api_key", "key": "!op read 'op://vault/item/credential'" }
  ```
- **Variável de ambiente:** Usa o valor da variável nomeada
  ```json
  { "type": "api_key", "key": "MY_ANTHROPIC_KEY" }
  ```
- **Valor literal:** Usado diretamente
  ```json
  { "type": "api_key", "key": "sk-ant-..." }
  ```

Credenciais OAuth também são armazenadas aqui após `/login` e gerenciadas automaticamente.

## Provedores na Nuvem

### Azure OpenAI

```bash
export AZURE_OPENAI_API_KEY=...
export AZURE_OPENAI_BASE_URL=https://your-resource.openai.azure.com
# também suportado: https://your-resource.cognitiveservices.azure.com
# endpoints raiz são normalizados automaticamente para /openai/v1
# ou use o nome do recurso em vez da URL base
export AZURE_OPENAI_RESOURCE_NAME=your-resource

# Opcional
export AZURE_OPENAI_API_VERSION=2024-02-01
export AZURE_OPENAI_DEPLOYMENT_NAME_MAP=gpt-4=my-gpt4,gpt-4o=my-gpt4o
```

### Amazon Bedrock

```bash
# Opção 1: Perfil AWS
export AWS_PROFILE=your-profile

# Opção 2: Chaves IAM
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...

# Opção 3: Token Bearer
export AWS_BEARER_TOKEN_BEDROCK=...

# Região opcional (padrão: us-east-1)
export AWS_REGION=us-west-2
```

Também suporta roles de tarefa ECS (`AWS_CONTAINER_CREDENTIALS_*`) e IRSA (`AWS_WEB_IDENTITY_TOKEN_FILE`).

```bash
pi --provider amazon-bedrock --model us.anthropic.claude-sonnet-4-20250514-v1:0
```

O cache de prompts é habilitado automaticamente para modelos Claude cujo ID contém um nome de modelo reconhecível (modelos base e perfis de inferência definidos pelo sistema). Para perfis de inferência de aplicação (cujos ARNs não contêm o nome do modelo), defina `AWS_BEDROCK_FORCE_CACHE=1` para habilitar pontos de cache:

```bash
export AWS_BEDROCK_FORCE_CACHE=1
pi --provider amazon-bedrock --model arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/abc123
```

Se você estiver se conectando a um proxy de API do Bedrock, as seguintes variáveis de ambiente podem ser usadas:

```bash
# Definir a URL para o proxy do Bedrock (variável de ambiente padrão do AWS SDK)
export AWS_ENDPOINT_URL_BEDROCK_RUNTIME=https://my.corp.proxy/bedrock

# Definir se o seu proxy não requer autenticação
export AWS_BEDROCK_SKIP_AUTH=1

# Definir se o seu proxy suporta apenas HTTP/1.1
export AWS_BEDROCK_FORCE_HTTP1=1
```

### Cloudflare AI Gateway

`CLOUDFLARE_API_KEY` pode ser definido via `/login`. O ID da conta e o slug do gateway devem ser definidos como variáveis de ambiente.

```bash
export CLOUDFLARE_API_KEY=...           # ou use /login
export CLOUDFLARE_ACCOUNT_ID=...
export CLOUDFLARE_GATEWAY_ID=...        # criar em dash.cloudflare.com → AI → AI Gateway
pi --provider cloudflare-ai-gateway --model "claude-sonnet-4-5"
```

Roteia para OpenAI, Anthropic e Workers AI através do Cloudflare AI Gateway. O Workers AI usa a API Unificada (`/compat`) e IDs de modelo prefixados (`workers-ai/@cf/...`). O OpenAI usa a rota de passagem do OpenAI (`/openai`) com IDs de modelo nativos do OpenAI como `gpt-5.1`. O Anthropic usa a rota de passagem do Anthropic (`/anthropic`) com IDs de modelo nativos do Anthropic como `claude-sonnet-4-5`.

A autenticação do AI Gateway usa `CLOUDFLARE_API_KEY` como `cf-aig-authorization`. A autenticação upstream pode ser uma de:

| Modo | Autenticação da requisição | Autenticação upstream |
|------|---------------------------|-----------------------|
| Workers AI | Somente token Cloudflare | Nativo Cloudflare |
| Faturamento unificado | Somente token Cloudflare | Cloudflare gerencia autenticação upstream e debita créditos |
| BYOK armazenado | Somente token Cloudflare | Cloudflare injeta chaves de provedor armazenadas no painel do AI Gateway |
| BYOK inline | Token Cloudflare mais cabeçalho `Authorization` upstream | A requisição fornece a chave do provedor upstream |

Para uso normal do pi, prefira faturamento unificado ou BYOK armazenado. BYOK inline requer configurar um cabeçalho `Authorization` upstream adicional para o provedor Cloudflare AI Gateway, por exemplo via uma substituição de provedor/modelo em `models.json`.

### Cloudflare Workers AI

`CLOUDFLARE_API_KEY` pode ser definido via `/login`. `CLOUDFLARE_ACCOUNT_ID` deve ser definido como variável de ambiente.

```bash
export CLOUDFLARE_API_KEY=...           # ou use /login
export CLOUDFLARE_ACCOUNT_ID=...
pi --provider cloudflare-workers-ai --model "@cf/moonshotai/kimi-k2.6"
```

O Pi define automaticamente `x-session-affinity` para descontos de [cache de prefixo](https://developers.cloudflare.com/workers-ai/features/prompt-caching/).

### Google Vertex AI

Usa credenciais padrão da aplicação:

```bash
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT=your-project
export GOOGLE_CLOUD_LOCATION=us-central1
```

Ou defina `GOOGLE_APPLICATION_CREDENTIALS` para um arquivo de chave de conta de serviço.

## Provedores Personalizados

**Via models.json:** Adicione Ollama, LM Studio, vLLM ou qualquer provedor que fale uma API suportada (OpenAI Completions, OpenAI Responses, Anthropic Messages, Google Generative AI). Veja [models.md](models.md).

**Via extensões:** Para provedores que precisam de implementações de API personalizadas ou fluxos OAuth, crie uma extensão. Veja [custom-provider.md](custom-provider.md) e [examples/extensions/custom-provider-gitlab-duo](../examples/extensions/custom-provider-gitlab-duo/).

## Ordem de Resolução

Ao resolver credenciais para um provedor:

1. Flag `--api-key` da CLI
2. Entrada de `auth.json` (chave de API ou token OAuth)
3. Variável de ambiente
4. Chaves de provedor personalizadas de `models.json`
