# Sessões

O Pi salva conversas como sessões para que você possa continuar o trabalho, fazer branch a partir de turnos anteriores e revisitar caminhos anteriores.

## Armazenamento de Sessão

As sessões são salvas automaticamente em `~/.pi/agent/sessions/`, organizadas por diretório de trabalho. Cada sessão é um arquivo JSONL com estrutura em árvore.

```bash
pi -c                  # Continuar sessão mais recente
pi -r                  # Navegar e selecionar entre sessões anteriores
pi --no-session        # Modo efêmero; não salvar
pi --session <path|id> # Usar um arquivo de sessão específico ou ID de sessão parcial
pi --fork <path|id>    # Fazer fork de um arquivo de sessão ou ID de sessão parcial para uma nova sessão
```

Use `/session` no modo interativo para ver o arquivo de sessão atual, ID de sessão, contagem de mensagens, tokens e custo.

Para o formato de arquivo JSONL e a API do SessionManager, veja [Formato de Sessão](session-format.md).

## Comandos de Sessão

| Comando | Descrição |
|---------|-----------|
| `/resume` | Navegar e selecionar sessões anteriores |
| `/new` | Iniciar nova sessão |
| `/name <nome>` | Definir o nome de exibição da sessão atual |
| `/session` | Mostrar informações da sessão |
| `/tree` | Navegar na árvore da sessão atual |
| `/fork` | Criar nova sessão a partir de uma mensagem de usuário anterior |
| `/clone` | Duplicar o branch ativo atual em uma nova sessão |
| `/compact [prompt]` | Resumir contexto antigo; veja [Compactação](compaction.md) |
| `/export [arquivo]` | Exportar sessão para HTML |
| `/share` | Fazer upload como gist privado do GitHub com link HTML compartilhável |

## Retomando e Excluindo Sessões

`/resume` abre um seletor interativo de sessões para o projeto atual. `pi -r` abre o mesmo seletor na inicialização.

No seletor você pode:

- pesquisar digitando
- alternar exibição de caminho com Ctrl+P
- alternar modo de ordenação com Ctrl+S
- filtrar para sessões nomeadas com Ctrl+N
- renomear com Ctrl+R
- excluir com Ctrl+D, depois confirmar

Quando disponível, o pi usa o CLI `trash` para exclusão em vez de remover arquivos permanentemente.

## Nomeando Sessões

Use `/name <nome>` para definir um nome de sessão legível por humanos:

```text
/name Refatorar módulo de autenticação
```

Sessões nomeadas são mais fáceis de encontrar em `/resume` e `pi -r`.

## Branching com `/tree`

As sessões são armazenadas como árvores. Cada entrada tem um `id` e `parentId`, e a posição atual é a folha ativa. `/tree` permite que você salte para qualquer ponto anterior e continue a partir daí sem criar um novo arquivo.

<p align="center"><img src="images/tree-view.png" alt="Visão de Árvore" width="600"></p>

Exemplo de estrutura:

```text
├─ usuário: "Olá, você pode me ajudar..."
│  └─ assistente: "Claro! Posso..."
│     ├─ usuário: "Vamos tentar a abordagem A..."
│     │  └─ assistente: "Para a abordagem A..."
│     │     └─ usuário: "Funcionou..."  ← ativo
│     └─ usuário: "Na verdade, a abordagem B..."
│        └─ assistente: "Para a abordagem B..."
```

### Controles da Árvore

| Tecla | Ação |
|-------|------|
| ↑/↓ | Navegar nas entradas visíveis |
| ←/→ | Página acima/abaixo |
| Ctrl+←/Ctrl+→ ou Alt+←/Alt+→ | Dobrar/desdobrar ou saltar entre segmentos de branch |
| Shift+L | Definir ou limpar um label na entrada selecionada |
| Shift+T | Alternar timestamps dos labels |
| Enter | Selecionar entrada |
| Escape/Ctrl+C | Cancelar |
| Ctrl+O | Alternar modo de filtro |

Os modos de filtro são: padrão, sem-ferramentas, somente-usuário, somente-com-label e todos. Configure o padrão com `treeFilterMode` em [Configurações](settings.md).

### Comportamento de Seleção

Ao selecionar uma mensagem de usuário ou personalizada:

1. Move a folha para o pai da mensagem selecionada.
2. Coloca o texto da mensagem selecionada no editor.
3. Permite que você edite e reenvie, criando um novo branch.

Ao selecionar uma entrada de assistente, ferramenta, compactação ou outra não-usuário:

1. Move a folha para essa entrada.
2. Deixa o editor vazio.
3. Permite que você continue a partir desse ponto.

Selecionar a mensagem raiz do usuário reseta a folha para uma conversa vazia e coloca o prompt original no editor.

## `/tree`, `/fork` e `/clone`

| Funcionalidade | `/tree` | `/fork` | `/clone` |
|----------------|---------|---------|----------|
| Saída | Mesmo arquivo de sessão | Novo arquivo de sessão | Novo arquivo de sessão |
| Visualização | Árvore completa | Seletor de mensagens do usuário | Branch ativo atual |
| Uso típico | Explorar alternativas no local | Iniciar nova sessão a partir de um prompt anterior | Duplicar trabalho atual antes de continuar |
| Resumo | Resumo de branch opcional | Nenhum | Nenhum |

Use `/tree` quando quiser manter as alternativas juntas. Use `/fork` ou `/clone` quando quiser um arquivo de sessão separado.

## Resumos de Branch

Quando `/tree` muda de um branch para outro, o pi pode resumir o branch abandonado e anexar esse resumo na nova posição. Isso preserva contexto importante do caminho que você deixou sem reproduzir o branch inteiro.

Quando solicitado, escolha uma das opções:

1. sem resumo
2. resumir com o prompt padrão
3. resumir com instruções de foco personalizadas

Veja [Compactação](compaction.md) para internos de sumarização de branch e hooks de extensão.

## Formato de Sessão

Os arquivos de sessão são JSONL e contêm entradas de mensagens, mudanças de modelo, mudanças de nível de raciocínio, labels, compactações, resumos de branch e entradas de extensão.

Para parsers, extensões, uso do SDK e a API completa do SessionManager, veja [Formato de Sessão](session-format.md).
