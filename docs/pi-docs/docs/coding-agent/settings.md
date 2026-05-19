# Configurações

Pi utiliza arquivos de configuração JSON, onde as configurações de projeto substituem as configurações globais.

| Localização | Escopo |
|-------------|--------|
| `~/.pi/agent/settings.json` | Global (todos os projetos) |
| `.pi/settings.json` | Projeto (diretório atual) |

Edite diretamente ou use `/settings` para as opções mais comuns.

## Todas as Configurações

### Modelo e Thinking

| Configuração | Tipo | Padrão | Descrição |
|--------------|------|--------|-----------|
| `defaultProvider` | string | - | Provedor padrão (ex.: `"anthropic"`, `"openai"`) |
| `defaultModel` | string | - | ID do modelo padrão |
| `defaultThinkingLevel` | string | - | `"off"`, `"minimal"`, `"low"`, `"medium"`, `"high"`, `"xhigh"` |
| `hideThinkingBlock` | boolean | `false` | Ocultar blocos de thinking na saída |
| `thinkingBudgets` | object | - | Orçamentos de tokens personalizados por nível de thinking |

#### thinkingBudgets

```json
{
  "thinkingBudgets": {
    "minimal": 1024,
    "low": 4096,
    "medium": 10240,
    "high": 32768
  }
}
```

### Interface e Exibição

| Configuração | Tipo | Padrão | Descrição |
|--------------|------|--------|-----------|
| `theme` | string | `"dark"` | Nome do tema (`"dark"`, `"light"` ou personalizado) |
| `quietStartup` | boolean | `false` | Ocultar cabeçalho de inicialização |
| `collapseChangelog` | boolean | `false` | Exibir changelog condensado após atualizações |
| `enableInstallTelemetry` | boolean | `true` | Enviar um ping anônimo de instalação/atualização após o primeiro uso ou atualizações detectadas pelo changelog. Não controla verificações de atualização |
| `doubleEscapeAction` | string | `"tree"` | Ação para duplo-escape: `"tree"`, `"fork"` ou `"none"` |
| `treeFilterMode` | string | `"default"` | Filtro padrão para `/tree`: `"default"`, `"no-tools"`, `"user-only"`, `"labeled-only"`, `"all"` |
| `editorPaddingX` | number | `0` | Preenchimento horizontal do editor de entrada (0-3) |
| `autocompleteMaxVisible` | number | `5` | Máximo de itens visíveis no dropdown de autocomplete (3-20) |
| `showHardwareCursor` | boolean | `false` | Exibir cursor do terminal |

### Telemetria e verificações de atualização

`enableInstallTelemetry` controla apenas o ping anônimo de instalação/atualização para `https://pi.dev/api/report-install`. Desativar a telemetria não desativa as verificações de atualização; o Pi ainda pode consultar `https://pi.dev/api/latest-version` para buscar a versão mais recente.

Defina `PI_SKIP_VERSION_CHECK=1` para desativar a verificação de atualização de versão do Pi. Use `--offline` ou `PI_OFFLINE=1` para desativar todas as operações de rede na inicialização descritas aqui, incluindo verificações de atualização, verificações de atualização de pacotes e telemetria de instalação/atualização.

### Avisos

| Configuração | Tipo | Padrão | Descrição |
|--------------|------|--------|-----------|
| `warnings.anthropicExtraUsage` | boolean | `true` | Exibir aviso quando a autenticação por assinatura Anthropic pode consumir uso pago adicional |

```json
{
  "warnings": {
    "anthropicExtraUsage": false
  }
}
```

### Compactação

| Configuração | Tipo | Padrão | Descrição |
|--------------|------|--------|-----------|
| `compaction.enabled` | boolean | `true` | Ativar compactação automática |
| `compaction.reserveTokens` | number | `16384` | Tokens reservados para a resposta do LLM |
| `compaction.keepRecentTokens` | number | `20000` | Tokens recentes a manter (não resumidos) |

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

### Resumo de Branch

| Configuração | Tipo | Padrão | Descrição |
|--------------|------|--------|-----------|
| `branchSummary.reserveTokens` | number | `16384` | Tokens reservados para resumo do branch |
| `branchSummary.skipPrompt` | boolean | `false` | Ignorar o prompt "Resumir branch?" na navegação via `/tree` (padrão: sem resumo) |

### Retry

| Configuração | Tipo | Padrão | Descrição |
|--------------|------|--------|-----------|
| `retry.enabled` | boolean | `true` | Ativar retry automático no nível do agente em erros transitórios |
| `retry.maxRetries` | number | `3` | Número máximo de tentativas de retry no nível do agente |
| `retry.baseDelayMs` | number | `2000` | Delay base para backoff exponencial no nível do agente (2s, 4s, 8s) |
| `retry.provider.timeoutMs` | number | padrão do SDK | Timeout da requisição do provedor/SDK em milissegundos |
| `retry.provider.maxRetries` | number | padrão do SDK | Tentativas de retry do provedor/SDK |
| `retry.provider.maxRetryDelayMs` | number | `60000` | Delay máximo solicitado pelo servidor antes de falhar (60s) |

Quando um provedor solicita um delay de retry superior a `retry.provider.maxRetryDelayMs` (ex.: "quota will reset after 5h" do Google), a requisição falha imediatamente com uma mensagem de erro informativa, em vez de aguardar silenciosamente. Defina como `0` para desativar o limite.

```json
{
  "retry": {
    "enabled": true,
    "maxRetries": 3,
    "baseDelayMs": 2000,
    "provider": {
      "timeoutMs": 3600000,
      "maxRetries": 0,
      "maxRetryDelayMs": 60000
    }
  }
}
```

### Entrega de Mensagens

| Configuração | Tipo | Padrão | Descrição |
|--------------|------|--------|-----------|
| `steeringMode` | string | `"one-at-a-time"` | Como as mensagens de direcionamento são enviadas: `"all"` ou `"one-at-a-time"` |
| `followUpMode` | string | `"one-at-a-time"` | Como as mensagens de acompanhamento são enviadas: `"all"` ou `"one-at-a-time"` |
| `transport` | string | `"sse"` | Transport preferido para provedores que suportam múltiplos transportes: `"sse"`, `"websocket"` ou `"auto"` |

### Terminal e Imagens

| Configuração | Tipo | Padrão | Descrição |
|--------------|------|--------|-----------|
| `terminal.showImages` | boolean | `true` | Exibir imagens no terminal (se suportado) |
| `terminal.imageWidthCells` | number | `60` | Largura preferida de imagem inline em células do terminal |
| `terminal.clearOnShrink` | boolean | `false` | Limpar linhas vazias quando o conteúdo diminuir (pode causar flickering) |
| `images.autoResize` | boolean | `true` | Redimensionar imagens para no máximo 2000x2000 |
| `images.blockImages` | boolean | `false` | Bloquear o envio de todas as imagens ao LLM |

### Shell

| Configuração | Tipo | Padrão | Descrição |
|--------------|------|--------|-----------|
| `shellPath` | string | - | Caminho personalizado do shell (ex.: para Cygwin no Windows) |
| `shellCommandPrefix` | string | - | Prefixo para cada comando bash (ex.: `"shopt -s expand_aliases"`) |
| `npmCommand` | string[] | - | Argumentos de comando usados para operações de busca/instalação de pacotes npm (ex.: `["mise", "exec", "node@20", "--", "npm"]`) |

```json
{
  "npmCommand": ["mise", "exec", "node@20", "--", "npm"]
}
```

`npmCommand` é utilizado em todas as operações de gerenciamento de pacotes npm, incluindo instalações, desinstalações e instalações de dependências em pacotes git. Use entradas no estilo argv exatamente como o processo deve ser iniciado. Quando `npmCommand` está configurado, as instalações de dependências de pacotes git usam simplesmente `install` para evitar flags específicas do npm em wrappers ou gerenciadores de pacotes alternativos.

Normalmente, a localização dos módulos globais do gerenciador de pacotes é consultada usando `root -g`. Como caso especial, se o primeiro elemento de `npmCommand` for `"bun"`, a localização dos módulos será consultada com `pm bin -g`.

### Sessões

| Configuração | Tipo | Padrão | Descrição |
|--------------|------|--------|-----------|
| `sessionDir` | string | - | Diretório onde os arquivos de sessão são armazenados. Aceita caminhos absolutos ou relativos, além de `~`. |

```json
{ "sessionDir": ".pi/sessions" }
```

Quando múltiplas fontes especificam um diretório de sessão, a precedência é: `--session-dir`, `PI_CODING_AGENT_SESSION_DIR` e, por último, `sessionDir` em settings.json.

### Ciclagem de Modelos

| Configuração | Tipo | Padrão | Descrição |
|--------------|------|--------|-----------|
| `enabledModels` | string[] | - | Padrões de modelos para ciclagem via Ctrl+P (mesmo formato que a flag `--models` da CLI) |

```json
{
  "enabledModels": ["claude-*", "gpt-4o", "gemini-2*"]
}
```

### Markdown

| Configuração | Tipo | Padrão | Descrição |
|--------------|------|--------|-----------|
| `markdown.codeBlockIndent` | string | `"  "` | Indentação para blocos de código |

### Recursos

Essas configurações definem de onde carregar extensões, skills, prompts e temas.

Caminhos em `~/.pi/agent/settings.json` são resolvidos relativos a `~/.pi/agent`. Caminhos em `.pi/settings.json` são resolvidos relativos a `.pi`. Caminhos absolutos e `~` são suportados.

| Configuração | Tipo | Padrão | Descrição |
|--------------|------|--------|-----------|
| `packages` | array | `[]` | Pacotes npm/git dos quais carregar recursos |
| `extensions` | string[] | `[]` | Caminhos de arquivo ou diretórios de extensões locais |
| `skills` | string[] | `[]` | Caminhos de arquivo ou diretórios de skills locais |
| `prompts` | string[] | `[]` | Caminhos de templates de prompt ou diretórios locais |
| `themes` | string[] | `[]` | Caminhos de arquivo ou diretórios de temas locais |
| `enableSkillCommands` | boolean | `true` | Registrar skills como comandos `/skill:name` |

Arrays suportam padrões glob e exclusões. Use `!pattern` para excluir. Use `+path` para forçar a inclusão de um caminho exato e `-path` para forçar a exclusão de um caminho exato.

#### packages

A forma de string carrega todos os recursos de um pacote:

```json
{
  "packages": ["pi-skills", "@org/my-extension"]
}
```

A forma de objeto filtra quais recursos carregar:

```json
{
  "packages": [
    {
      "source": "pi-skills",
      "skills": ["brave-search", "transcribe"],
      "extensions": []
    }
  ]
}
```

Consulte [packages.md](packages.md) para detalhes sobre gerenciamento de pacotes.

## Exemplo

```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-20250514",
  "defaultThinkingLevel": "medium",
  "theme": "dark",
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  },
  "retry": {
    "enabled": true,
    "maxRetries": 3
  },
  "enabledModels": ["claude-*", "gpt-4o"],
  "warnings": {
    "anthropicExtraUsage": true
  },
  "packages": ["pi-skills"]
}
```

## Sobrescritas de Projeto

As configurações de projeto (`.pi/settings.json`) substituem as configurações globais. Objetos aninhados são mesclados:

```json
// ~/.pi/agent/settings.json (global)
{
  "theme": "dark",
  "compaction": { "enabled": true, "reserveTokens": 16384 }
}

// .pi/settings.json (projeto)
{
  "compaction": { "reserveTokens": 8192 }
}

// Resultado
{
  "theme": "dark",
  "compaction": { "enabled": true, "reserveTokens": 8192 }
}
```
