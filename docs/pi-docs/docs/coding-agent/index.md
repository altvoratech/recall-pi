# Documentação do Pi

Pi é um harness de codificação para terminal minimalista. Foi projetado para manter um núcleo enxuto, sendo estendido por meio de extensões TypeScript, skills, prompt templates, temas e pacotes pi.

## Início rápido

No Linux ou Mac, você pode instalar o Pi com curl:

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

Ou alternativamente com npm:

```bash
npm install -g @earendil-works/pi-coding-agent
```

Em seguida, execute-o em um diretório de projeto:

```bash
pi
```

Autentique-se com `/login` para provedores de assinatura, ou defina uma chave de API como `ANTHROPIC_API_KEY` antes de iniciar o pi.

Para o fluxo completo de primeira execução, consulte [Início Rápido](quickstart.md).

## Comece por aqui

- [Início Rápido](quickstart.md) - instalação, autenticação e execução de uma primeira sessão.
- [Usando o Pi](usage.md) - modo interativo, slash commands, arquivos de contexto e referência da CLI.
- [Provedores](providers.md) - configuração de assinatura e chave de API para provedores integrados.
- [Configurações](settings.md) - configurações globais e de projeto.
- [Atalhos de Teclado](keybindings.md) - atalhos padrão e atalhos personalizados.
- [Sessões](sessions.md) - gerenciamento de sessões, branching e navegação em árvore.
- [Compactação](compaction.md) - compactação de contexto e sumarização de branches.

## Personalização

- [Extensões](extensions.md) - módulos TypeScript para ferramentas, comandos, eventos e UI personalizada.
- [Skills](skills.md) - Skills de agente para capacidades reutilizáveis sob demanda.
- [Prompt templates](prompt-templates.md) - prompts reutilizáveis que se expandem a partir de slash commands.
- [Temas](themes.md) - temas de terminal integrados e personalizados.
- [Pacotes pi](packages.md) - empacote e compartilhe extensões, skills, prompts e temas.
- [Modelos personalizados](models.md) - adicione entradas de modelos para APIs de provedores suportados.
- [Provedores personalizados](custom-provider.md) - implemente APIs personalizadas e fluxos OAuth.

## Uso programático

- [SDK](sdk.md) - incorpore o pi em aplicações Node.js.
- [Modo RPC](rpc.md) - integre via JSONL por stdin/stdout.
- [Modo de stream de eventos JSON](json.md) - modo de impressão com eventos estruturados.
- [Componentes TUI](tui.md) - construa interfaces de terminal personalizadas para extensões.

## Referência

- [Formato de sessão](session-format.md) - formato de arquivo de sessão JSONL, tipos de entrada e API do SessionManager.

## Configuração de plataforma

- [Windows](windows.md)
- [Termux no Android](termux.md)
- [tmux](tmux.md)
- [Configuração de terminal](terminal-setup.md)
- [Shell aliases](shell-aliases.md)

## Desenvolvimento

- [Desenvolvimento](development.md) - configuração local, estrutura do projeto e depuração.
