# Início Rápido

Esta página leva você da instalação até uma primeira sessão útil com o pi.

## Instalar

O pi é distribuído como um pacote npm:

```bash
npm install -g @earendil-works/pi-coding-agent
```

Em seguida, inicie o pi no diretório do projeto em que deseja trabalhar:

```bash
cd /path/to/project
pi
```

## Autenticar

O pi pode usar provedores por assinatura via `/login`, ou provedores com chave de API por meio de variáveis de ambiente ou do arquivo de autenticação.

### Opção 1: login por assinatura

Inicie o pi e execute:

```text
/login
```

Em seguida, selecione um provedor. Os logins por assinatura nativos incluem Claude Pro/Max, ChatGPT Plus/Pro (Codex) e GitHub Copilot.

### Opção 2: chave de API

Defina uma chave de API antes de iniciar o pi:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
pi
```

Você também pode executar `/login` e selecionar um provedor de chave de API para armazenar a chave em `~/.pi/agent/auth.json`.

Consulte [Provedores](providers.md) para todos os provedores suportados, variáveis de ambiente e configuração de provedores em nuvem.

## Primeira sessão

Assim que o pi iniciar, digite uma solicitação e pressione Enter:

```text
Summarize this repository and tell me how to run its checks.
```

Por padrão, o pi fornece ao modelo quatro ferramentas:

- `read` - ler arquivos
- `write` - criar ou sobrescrever arquivos
- `edit` - aplicar patches em arquivos
- `bash` - executar comandos shell

Ferramentas nativas somente leitura adicionais (`grep`, `find`, `ls`) estão disponíveis por meio das opções de ferramentas. O pi é executado no seu diretório de trabalho atual e pode modificar arquivos nele. Use git ou outro fluxo de trabalho de checkpointing se quiser facilitar o rollback.

## Fornecer instruções de projeto ao pi

O pi carrega arquivos de contexto na inicialização. Adicione um arquivo `AGENTS.md` para informar como trabalhar em um projeto:

```markdown
# Project Instructions

- Run `npm run check` after code changes.
- Do not run production migrations locally.
- Keep responses concise.
```

O pi carrega:

- `~/.pi/agent/AGENTS.md` para instruções globais
- `AGENTS.md` ou `CLAUDE.md` dos diretórios pai e do diretório atual

Reinicie o pi, ou execute `/reload`, após alterar os arquivos de contexto.

## Coisas comuns para experimentar

### Referenciar arquivos

Digite `@` no editor para buscar arquivos por correspondência aproximada, ou passe arquivos pela linha de comando:

```bash
pi @README.md "Summarize this"
pi @src/app.ts @src/app.test.ts "Review these together"
```

Imagens podem ser coladas com Ctrl+V (Alt+V no Windows) ou arrastadas para terminais compatíveis.

### Executar comandos shell

No modo interativo:

```text
!npm run lint
```

A saída do comando é enviada ao modelo. Use `!!comando` para executar um comando sem adicionar sua saída ao contexto do modelo.

### Trocar de modelo

Use `/model` ou Ctrl+L para escolher um modelo. Use Shift+Tab para alternar o nível de raciocínio. Use Ctrl+P / Shift+Ctrl+P para alternar entre modelos com escopo.

### Continuar depois

As sessões são salvas automaticamente:

```bash
pi -c                  # Continua a sessão mais recente
pi -r                  # Navega pelas sessões anteriores
pi --session <path|id> # Abre uma sessão específica
```

Dentro do pi, use `/resume`, `/new`, `/tree`, `/fork` e `/clone` para gerenciar sessões.

### Modo não interativo

Para prompts de uso único:

```bash
pi -p "Summarize this codebase"
cat README.md | pi -p "Summarize this text"
pi -p @screenshot.png "What's in this image?"
```

Use `--mode json` para saída de eventos em JSON ou `--mode rpc` para integração com processos.

## Próximos passos

- [Usando o Pi](usage.md) - modo interativo, slash commands, sessões, arquivos de contexto e referência de CLI.
- [Provedores](providers.md) - autenticação e configuração de modelos.
- [Configurações](settings.md) - configuração global e por projeto.
- [Keybindings](keybindings.md) - atalhos e personalização.
- [Pacotes Pi](packages.md) - instale extensões, skills, prompts e temas compartilhados.

Notas por plataforma: [Windows](windows.md), [Termux](termux.md), [tmux](tmux.md), [Configuração de terminal](terminal-setup.md), [Aliases de shell](shell-aliases.md).
