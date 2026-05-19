# Usando o Pi

Esta página reúne detalhes de uso cotidiano que não cabem na página de início rápido.

## Modo Interativo

<p align="center"><img src="images/interactive-mode.png" alt="Modo Interativo" width="600"></p>

A interface possui quatro áreas principais:

- **Cabeçalho de inicialização** - atalhos, arquivos de contexto carregados, templates de prompt, skills e extensões
- **Mensagens** - mensagens do usuário, respostas do assistente, chamadas de ferramentas, resultados de ferramentas, notificações, erros e interface de extensões
- **Editor** - onde você digita; a cor da borda indica o nível de thinking atual
- **Rodapé** - diretório de trabalho, nome da sessão, uso de tokens/cache, custo, uso do contexto e modelo atual

O editor pode ser substituído temporariamente por interfaces integradas como `/settings` ou por interfaces de extensões personalizadas.

### Recursos do Editor

| Recurso | Como usar |
|---------|-----------|
| Referência de arquivo | Digite `@` para busca fuzzy nos arquivos do projeto |
| Autocompletar caminho | Pressione Tab para completar caminhos |
| Entrada multilinha | Shift+Enter, ou Ctrl+Enter no Windows Terminal |
| Imagens | Cole com Ctrl+V, Alt+V no Windows, ou arraste para o terminal |
| Comando shell | `!comando` executa e envia a saída para o modelo |
| Comando shell oculto | `!!comando` executa sem enviar a saída para o modelo |
| Editor externo | Ctrl+G abre `$VISUAL` ou `$EDITOR` |

Consulte [Keybindings](keybindings.md) para todos os atalhos e personalizações.

## Comandos Slash

Digite `/` no editor para abrir o autocompletar de comandos. Extensões podem registrar comandos personalizados, skills estão disponíveis como `/skill:name`, e templates de prompt são expandidos via `/nometemplate`.

| Comando | Descrição |
|---------|-----------|
| `/login`, `/logout` | Gerenciar credenciais OAuth ou chave de API |
| `/model` | Trocar de modelo |
| `/scoped-models` | Ativar/desativar modelos para ciclagem via Ctrl+P |
| `/settings` | Nível de thinking, tema, entrega de mensagens, transport |
| `/resume` | Escolher entre sessões anteriores |
| `/new` | Iniciar uma nova sessão |
| `/name <nome>` | Definir nome de exibição da sessão |
| `/session` | Mostrar arquivo de sessão, ID, mensagens, tokens e custo |
| `/tree` | Ir para qualquer ponto da sessão e continuar a partir daí |
| `/fork` | Criar uma nova sessão a partir de uma mensagem anterior do usuário |
| `/clone` | Duplicar o branch ativo atual em uma nova sessão |
| `/compact [prompt]` | Compactar o contexto manualmente, opcionalmente com instruções personalizadas |
| `/copy` | Copiar a última mensagem do assistente para a área de transferência |
| `/export [arquivo]` | Exportar sessão para HTML |
| `/share` | Fazer upload como gist privado no GitHub com link HTML compartilhável |
| `/reload` | Recarregar keybindings, extensões, skills, prompts e arquivos de contexto |
| `/hotkeys` | Mostrar todos os atalhos de teclado |
| `/changelog` | Exibir histórico de versões |
| `/quit` | Sair do pi |

## Fila de Mensagens

Você pode enviar mensagens enquanto o agente ainda está trabalhando:

- **Enter** enfileira uma mensagem de direcionamento, entregue após o turno atual do assistente terminar de executar suas chamadas de ferramentas.
- **Alt+Enter** enfileira uma mensagem de acompanhamento, entregue após o agente concluir todo o trabalho.
- **Escape** interrompe e restaura as mensagens enfileiradas para o editor.
- **Alt+Up** recupera as mensagens enfileiradas de volta para o editor.

No Windows Terminal, Alt+Enter é tela cheia por padrão. Remapeie conforme descrito em [Configuração do terminal](terminal-setup.md) se quiser que o pi receba esse atalho.

Configure a entrega em [Configurações](settings.md) com `steeringMode` e `followUpMode`.

## Sessões

As sessões são salvas automaticamente em `~/.pi/agent/sessions/`, organizadas por diretório de trabalho.

```bash
pi -c                  # Continuar a sessão mais recente
pi -r                  # Navegar e selecionar uma sessão
pi --no-session        # Modo efêmero; não salvar
pi --session <path|id> # Usar um arquivo de sessão ou ID de sessão específico
pi --fork <path|id>    # Fazer fork de uma sessão em um novo arquivo de sessão
```

Comandos úteis para sessões:

- `/session` mostra o arquivo de sessão atual e o ID.
- `/tree` navega pela árvore de sessão dentro do arquivo e pode resumir branches abandonados.
- `/fork` cria uma nova sessão a partir de uma mensagem anterior do usuário.
- `/clone` duplica o branch ativo atual em um novo arquivo de sessão.
- `/compact` resume mensagens mais antigas para liberar contexto.

Consulte [Sessions](sessions.md) e [Compaction](compaction.md) para detalhes.

## Arquivos de Contexto

Pi carrega `AGENTS.md` ou `CLAUDE.md` na inicialização a partir de:

- `~/.pi/agent/AGENTS.md` para instruções globais
- diretórios pai, percorrendo a hierarquia a partir do diretório de trabalho atual
- o diretório atual

Use arquivos de contexto para convenções de projeto, comandos, regras de segurança e preferências. Desative o carregamento com `--no-context-files` ou `-nc`.

### Arquivos de Prompt de Sistema

Substitua o prompt de sistema padrão com:

- `.pi/SYSTEM.md` para um projeto
- `~/.pi/agent/SYSTEM.md` globalmente

Adicione ao prompt padrão sem substituí-lo usando `APPEND_SYSTEM.md` em qualquer um dos locais.

## Exportando e Compartilhando Sessões

Use `/export [arquivo]` para salvar uma sessão em HTML.

Use `/share` para fazer upload de um gist privado no GitHub com um link HTML compartilhável.

Se você usa o pi para trabalho open source e deseja publicar sessões para pesquisa de modelos, prompts, ferramentas e avaliação, consulte [`badlogic/pi-share-hf`](https://github.com/badlogic/pi-share-hf). Ele publica sessões em datasets do Hugging Face.

## Referência da CLI

```bash
pi [options] [@files...] [messages...]
```

### Comandos de Pacote

```bash
pi install <source> [-l]     # Instalar pacote, -l para projeto local
pi remove <source> [-l]      # Remover pacote
pi uninstall <source> [-l]   # Alias para remove
pi update [source|self|pi]   # Atualizar pi e pacotes; ignora pacotes fixados
pi update --extensions       # Atualizar apenas pacotes
pi update --self             # Atualizar apenas o pi
pi update --extension <src>  # Atualizar um pacote específico
pi list                      # Listar pacotes instalados
pi config                    # Ativar/desativar recursos de pacotes
```

Consulte [Pi Packages](packages.md) para fontes de pacotes e notas de segurança.

### Modos

| Flag | Descrição |
|------|-----------|
| padrão | Modo interativo |
| `-p`, `--print` | Imprimir resposta e sair |
| `--mode json` | Exibir todos os eventos como linhas JSON; veja [modo JSON](json.md) |
| `--mode rpc` | Modo RPC via stdin/stdout; veja [modo RPC](rpc.md) |
| `--export <in> [out]` | Exportar uma sessão para HTML |

No modo print, pi também lê stdin por pipe e mescla no prompt inicial:

```bash
cat README.md | pi -p "Summarize this text"
```

### Opções de Modelo

| Opção | Descrição |
|-------|-----------|
| `--provider <name>` | Provedor, como `anthropic`, `openai` ou `google` |
| `--model <pattern>` | Padrão ou ID de modelo; suporta `provider/id` e `:thinking` opcional |
| `--api-key <key>` | Chave de API, sobrescrevendo variáveis de ambiente |
| `--thinking <level>` | `off`, `minimal`, `low`, `medium`, `high`, `xhigh` |
| `--models <patterns>` | Padrões separados por vírgula para ciclagem via Ctrl+P |
| `--list-models [search]` | Listar modelos disponíveis |

### Opções de Sessão

| Opção | Descrição |
|-------|-----------|
| `-c`, `--continue` | Continuar a sessão mais recente |
| `-r`, `--resume` | Navegar e selecionar uma sessão |
| `--session <path\|id>` | Usar um arquivo de sessão específico ou UUID parcial |
| `--fork <path\|id>` | Fazer fork de um arquivo de sessão ou UUID parcial em uma nova sessão |
| `--session-dir <dir>` | Diretório de armazenamento de sessão personalizado |
| `--no-session` | Modo efêmero; não salvar |

### Opções de Ferramentas

| Opção | Descrição |
|-------|-----------|
| `--tools <list>`, `-t <list>` | Lista de permissão de ferramentas integradas, de extensão e personalizadas específicas |
| `--no-builtin-tools`, `-nbt` | Desativar ferramentas integradas, mantendo ferramentas de extensão/personalizadas ativas |
| `--no-tools`, `-nt` | Desativar todas as ferramentas |

Ferramentas integradas: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`.

### Opções de Recursos

| Opção | Descrição |
|-------|-----------|
| `-e`, `--extension <source>` | Carregar uma extensão de caminho, npm ou git; repetível |
| `--no-extensions` | Desativar descoberta de extensões |
| `--skill <path>` | Carregar uma skill; repetível |
| `--no-skills` | Desativar descoberta de skills |
| `--prompt-template <path>` | Carregar um template de prompt; repetível |
| `--no-prompt-templates` | Desativar descoberta de templates de prompt |
| `--theme <path>` | Carregar um tema; repetível |
| `--no-themes` | Desativar descoberta de temas |
| `--no-context-files`, `-nc` | Desativar descoberta de `AGENTS.md` e `CLAUDE.md` |

Combine `--no-*` com flags explícitas para carregar exatamente o que você precisa, ignorando as configurações. Exemplo:

```bash
pi --no-extensions -e ./my-extension.ts
```

### Outras Opções

| Opção | Descrição |
|-------|-----------|
| `--system-prompt <text>` | Substituir o prompt padrão; arquivos de contexto e skills ainda são adicionados |
| `--append-system-prompt <text>` | Adicionar ao prompt de sistema |
| `--verbose` | Forçar inicialização detalhada |
| `-h`, `--help` | Mostrar ajuda |
| `-v`, `--version` | Mostrar versão |

### Argumentos de Arquivo

Prefixe arquivos com `@` para incluí-los na mensagem:

```bash
pi @prompt.md "Answer this"
pi -p @screenshot.png "What's in this image?"
pi @code.ts @test.ts "Review these files"
```

### Exemplos

```bash
# Interativo com prompt inicial
pi "List all .ts files in src/"

# Não interativo
pi -p "Summarize this codebase"

# Não interativo com stdin por pipe
cat README.md | pi -p "Summarize this text"

# Modelo diferente
pi --provider openai --model gpt-4o "Help me refactor"

# Modelo com prefixo de provedor
pi --model openai/gpt-4o "Help me refactor"

# Modelo com atalho de nível de thinking
pi --model sonnet:high "Solve this complex problem"

# Limitar ciclagem de modelos
pi --models "claude-*,gpt-4o"

# Modo somente leitura
pi --tools read,grep,find,ls -p "Review the code"
```

### Variáveis de Ambiente

| Variável | Descrição |
|----------|-----------|
| `PI_CODING_AGENT_DIR` | Substituir diretório de configuração; padrão é `~/.pi/agent` |
| `PI_CODING_AGENT_SESSION_DIR` | Substituir diretório de armazenamento de sessão; sobrescrito por `--session-dir` |
| `PI_PACKAGE_DIR` | Substituir diretório de pacotes, útil para caminhos do Nix/Guix store |
| `PI_OFFLINE` | Desativar operações de rede na inicialização, incluindo verificações de atualização, verificações de atualização de pacotes e telemetria de instalação/atualização |
| `PI_SKIP_VERSION_CHECK` | Ignorar a verificação de atualização de versão do Pi na inicialização. Isso impede a requisição de versão mais recente ao `pi.dev` |
| `PI_TELEMETRY` | Substituir telemetria de instalação/atualização: `1`/`true`/`yes` ou `0`/`false`/`no`. Não desativa verificações de atualização |
| `PI_CACHE_RETENTION` | Defina como `long` para cache de prompt estendido onde suportado |
| `VISUAL`, `EDITOR` | Editor externo para Ctrl+G |

## Princípios de Design

Pi mantém o núcleo enxuto e delega comportamentos específicos de fluxo de trabalho para extensões, skills, templates de prompt e pacotes.

Intencionalmente, não inclui MCP integrado, sub-agentes, popups de permissão, modo de planejamento, to-dos ou bash em segundo plano. Você pode construir ou instalar esses fluxos de trabalho como extensões ou pacotes, ou usar ferramentas externas como containers e tmux.

Para a justificativa completa, leia o [post do blog](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/).
