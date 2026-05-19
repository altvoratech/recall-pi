# Keybindings

Todos os atalhos de teclado podem ser personalizados via `~/.pi/agent/keybindings.json`. Cada ação pode ser associada a uma ou mais teclas.

O arquivo de configuração usa os mesmos ids de keybinding com namespace que o pi usa internamente e que autores de extensões usam em `keyHint()` e nos gerenciadores de `keybindings` injetados.

Configurações antigas que usam ids sem namespace, como `cursorUp` ou `expandTools`, são migradas automaticamente para os ids com namespace na inicialização.

Após editar o `keybindings.json`, execute `/reload` no pi para aplicar as alterações sem reiniciar a sessão.

## Formato de Tecla

`modifier+key`, onde os modificadores são `ctrl`, `shift`, `alt` (combináveis) e as teclas são:

- **Letras:** `a-z`
- **Dígitos:** `0-9`
- **Especiais:** `escape`, `esc`, `enter`, `return`, `tab`, `space`, `backspace`, `delete`, `insert`, `clear`, `home`, `end`, `pageUp`, `pageDown`, `up`, `down`, `left`, `right`
- **Função:** `f1`-`f12`
- **Símbolos:** `` ` ``, `-`, `=`, `[`, `]`, `\`, `;`, `'`, `,`, `.`, `/`, `!`, `@`, `#`, `$`, `%`, `^`, `&`, `*`, `(`, `)`, `_`, `+`, `|`, `~`, `{`, `}`, `:`, `<`, `>`, `?`

Combinações de modificadores: `ctrl+shift+x`, `alt+ctrl+x`, `ctrl+shift+alt+x`, `ctrl+1`, etc.

## Todas as Ações

### Movimentação de Cursor no Editor TUI

| Id do keybinding | Padrão | Descrição |
|--------|---------|-------------|
| `tui.editor.cursorUp` | `up` | Mover cursor para cima |
| `tui.editor.cursorDown` | `down` | Mover cursor para baixo |
| `tui.editor.cursorLeft` | `left`, `ctrl+b` | Mover cursor para a esquerda |
| `tui.editor.cursorRight` | `right`, `ctrl+f` | Mover cursor para a direita |
| `tui.editor.cursorWordLeft` | `alt+left`, `ctrl+left`, `alt+b` | Mover cursor uma palavra à esquerda |
| `tui.editor.cursorWordRight` | `alt+right`, `ctrl+right`, `alt+f` | Mover cursor uma palavra à direita |
| `tui.editor.cursorLineStart` | `home`, `ctrl+a` | Ir para o início da linha |
| `tui.editor.cursorLineEnd` | `end`, `ctrl+e` | Ir para o fim da linha |
| `tui.editor.jumpForward` | `ctrl+]` | Saltar para frente até um caractere |
| `tui.editor.jumpBackward` | `ctrl+alt+]` | Saltar para trás até um caractere |
| `tui.editor.pageUp` | `pageUp` | Rolar página acima |
| `tui.editor.pageDown` | `pageDown` | Rolar página abaixo |

### Exclusão no Editor TUI

| Id do keybinding | Padrão | Descrição |
|--------|---------|-------------|
| `tui.editor.deleteCharBackward` | `backspace` | Apagar caractere para trás |
| `tui.editor.deleteCharForward` | `delete`, `ctrl+d` | Apagar caractere para frente |
| `tui.editor.deleteWordBackward` | `ctrl+w`, `alt+backspace` | Apagar palavra para trás |
| `tui.editor.deleteWordForward` | `alt+d`, `alt+delete` | Apagar palavra para frente |
| `tui.editor.deleteToLineStart` | `ctrl+u` | Apagar até o início da linha |
| `tui.editor.deleteToLineEnd` | `ctrl+k` | Apagar até o fim da linha |

### Entrada TUI

| Id do keybinding | Padrão | Descrição |
|--------|---------|-------------|
| `tui.input.newLine` | `shift+enter` | Inserir nova linha |
| `tui.input.submit` | `enter` | Enviar entrada |
| `tui.input.tab` | `tab` | Tab / autocompletar |

### Kill Ring TUI

| Id do keybinding | Padrão | Descrição |
|--------|---------|-------------|
| `tui.editor.yank` | `ctrl+y` | Colar o texto excluído mais recentemente |
| `tui.editor.yankPop` | `alt+y` | Percorrer textos excluídos após yank |
| `tui.editor.undo` | `ctrl+-` | Desfazer última edição |

### Área de Transferência e Seleção no TUI

| Id do keybinding | Padrão | Descrição |
|--------|---------|-------------|
| `tui.input.copy` | `ctrl+c` | Copiar seleção |
| `tui.select.up` | `up` | Mover seleção para cima |
| `tui.select.down` | `down` | Mover seleção para baixo |
| `tui.select.pageUp` | `pageUp` | Página acima na lista |
| `tui.select.pageDown` | `pageDown` | Página abaixo na lista |
| `tui.select.confirm` | `enter` | Confirmar seleção |
| `tui.select.cancel` | `escape`, `ctrl+c` | Cancelar seleção |

### Aplicação

| Id do keybinding | Padrão | Descrição |
|--------|---------|-------------|
| `app.interrupt` | `escape` | Cancelar / interromper |
| `app.clear` | `ctrl+c` | Limpar editor |
| `app.exit` | `ctrl+d` | Sair (quando o editor estiver vazio) |
| `app.suspend` | `ctrl+z` (nenhum no Windows) | Suspender para segundo plano |
| `app.editor.external` | `ctrl+g` | Abrir no editor externo (`$VISUAL` ou `$EDITOR`) |
| `app.clipboard.pasteImage` | `ctrl+v` (`alt+v` no Windows) | Colar imagem da área de transferência |

### Sessões

| Id do keybinding | Padrão | Descrição |
|--------|---------|-------------|
| `app.session.new` | *(nenhum)* | Iniciar uma nova sessão (`/new`) |
| `app.session.tree` | *(nenhum)* | Abrir o navegador de árvore de sessões (`/tree`) |
| `app.session.fork` | *(nenhum)* | Bifurcar a sessão atual (`/fork`) |
| `app.session.resume` | *(nenhum)* | Abrir o seletor de retomada de sessão (`/resume`) |
| `app.session.togglePath` | `ctrl+p` | Alternar exibição de caminho |
| `app.session.toggleSort` | `ctrl+s` | Alternar modo de ordenação |
| `app.session.toggleNamedFilter` | `ctrl+n` | Alternar filtro de apenas nomeados |
| `app.session.rename` | `ctrl+r` | Renomear sessão |
| `app.session.delete` | `ctrl+d` | Excluir sessão |
| `app.session.deleteNoninvasive` | `ctrl+backspace` | Excluir sessão quando a consulta estiver vazia |

### Modelos e Raciocínio

| Id do keybinding | Padrão | Descrição |
|--------|---------|-------------|
| `app.model.select` | `ctrl+l` | Abrir seletor de modelo |
| `app.model.cycleForward` | `ctrl+p` | Avançar para o próximo modelo |
| `app.model.cycleBackward` | `shift+ctrl+p` | Voltar para o modelo anterior |
| `app.thinking.cycle` | `shift+tab` | Alternar nível de raciocínio |
| `app.thinking.toggle` | `ctrl+t` | Recolher ou expandir blocos de raciocínio |

### Exibição e Fila de Mensagens

| Id do keybinding | Padrão | Descrição |
|--------|---------|-------------|
| `app.tools.expand` | `ctrl+o` | Recolher ou expandir saída de ferramentas |
| `app.message.followUp` | `alt+enter` | Enfileirar mensagem de acompanhamento |
| `app.message.dequeue` | `alt+up` | Restaurar mensagens enfileiradas para o editor |

### Navegação em Árvore

| Id do keybinding | Padrão | Descrição |
|--------|---------|-------------|
| `app.tree.foldOrUp` | `ctrl+left`, `alt+left` | Recolher o segmento de branch atual, ou saltar para o início do segmento anterior |
| `app.tree.unfoldOrDown` | `ctrl+right`, `alt+right` | Expandir o segmento de branch atual, ou saltar para o início do próximo segmento ou fim do branch |
| `app.tree.editLabel` | `shift+l` | Editar o rótulo do nó de árvore selecionado |
| `app.tree.toggleLabelTimestamp` | `shift+t` | Alternar timestamps de rótulos na árvore |
| `app.tree.filter.default` | `ctrl+d` | Definir filtro de árvore para a visualização padrão |
| `app.tree.filter.noTools` | `ctrl+t` | Alternar filtro de árvore que oculta resultados de ferramentas |
| `app.tree.filter.userOnly` | `ctrl+u` | Alternar filtro de árvore que exibe apenas mensagens do usuário |
| `app.tree.filter.labeledOnly` | `ctrl+l` | Alternar filtro de árvore que exibe apenas entradas com rótulo |
| `app.tree.filter.all` | `ctrl+a` | Alternar filtro de árvore que exibe todas as entradas |
| `app.tree.filter.cycleForward` | `ctrl+o` | Avançar filtro de árvore |
| `app.tree.filter.cycleBackward` | `shift+ctrl+o` | Retroceder filtro de árvore |

### Seletor de Modelos com Escopo

Usado dentro do seletor de modelos com escopo (aberto via `/scoped-models`).

| Id do keybinding | Padrão | Descrição |
|--------|---------|-------------|
| `app.models.save` | `ctrl+s` | Salvar a seleção de modelo atual nas configurações |
| `app.models.enableAll` | `ctrl+a` | Ativar todos os modelos (ou todos correspondentes à busca atual) |
| `app.models.clearAll` | `ctrl+x` | Limpar todos os modelos (ou todos correspondentes à busca atual) |
| `app.models.toggleProvider` | `ctrl+p` | Alternar todos os modelos do provedor atual |
| `app.models.reorderUp` | `alt+up` | Mover o modelo selecionado para cima na ordem de ciclo |
| `app.models.reorderDown` | `alt+down` | Mover o modelo selecionado para baixo na ordem de ciclo |

## Configuração Personalizada

Crie `~/.pi/agent/keybindings.json`:

```json
{
  "tui.editor.cursorUp": ["up", "ctrl+p"],
  "tui.editor.cursorDown": ["down", "ctrl+n"],
  "tui.editor.deleteWordBackward": ["ctrl+w", "alt+backspace"]
}
```

Cada ação pode ter uma única tecla ou um array de teclas. A configuração do usuário substitui os padrões.

No Windows nativo, `app.suspend` não tem binding padrão porque os terminais Windows não suportam controle de job Unix. Se você vinculá-lo manualmente, o pi exibe uma mensagem de status em vez de suspender. No WSL, o comportamento normal do Linux com `ctrl+z`/`fg` ainda se aplica.

### Exemplo Emacs

```json
{
  "tui.editor.cursorUp": ["up", "ctrl+p"],
  "tui.editor.cursorDown": ["down", "ctrl+n"],
  "tui.editor.cursorLeft": ["left", "ctrl+b"],
  "tui.editor.cursorRight": ["right", "ctrl+f"],
  "tui.editor.cursorWordLeft": ["alt+left", "alt+b"],
  "tui.editor.cursorWordRight": ["alt+right", "alt+f"],
  "tui.editor.deleteCharForward": ["delete", "ctrl+d"],
  "tui.editor.deleteCharBackward": ["backspace", "ctrl+h"],
  "tui.input.newLine": ["shift+enter", "ctrl+j"]
}
```

### Exemplo Vim

```json
{
  "tui.editor.cursorUp": ["up", "alt+k"],
  "tui.editor.cursorDown": ["down", "alt+j"],
  "tui.editor.cursorLeft": ["left", "alt+h"],
  "tui.editor.cursorRight": ["right", "alt+l"],
  "tui.editor.cursorWordLeft": ["alt+left", "alt+b"],
  "tui.editor.cursorWordRight": ["alt+right", "alt+w"]
}
```
