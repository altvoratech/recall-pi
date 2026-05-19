> pi pode criar componentes TUI. Peça para ele construir um para o seu caso de uso.

# Componentes TUI

Extensões e ferramentas personalizadas podem renderizar componentes TUI customizados para interfaces de usuário interativas. Esta página cobre o sistema de componentes e os blocos de construção disponíveis.

**Fonte:** [`@earendil-works/pi-tui`](https://github.com/earendil-works/pi-mono/tree/main/packages/tui)

## Interface de Componente

Todos os componentes implementam:

```typescript
interface Component {
  render(width: number): string[];
  handleInput?(data: string): void;
  wantsKeyRelease?: boolean;
  invalidate(): void;
}
```

| Método | Descrição |
|--------|-----------|
| `render(width)` | Retorna um array de strings (uma por linha). Cada linha **não deve exceder `width`**. |
| `handleInput?(data)` | Recebe entrada do teclado quando o componente está em foco. |
| `wantsKeyRelease?` | Se verdadeiro, o componente recebe eventos de liberação de tecla (protocolo Kitty). Padrão: false. |
| `invalidate()` | Limpa o estado de render em cache. Chamado em mudanças de tema. |

O TUI acrescenta um reset SGR completo e um reset OSC 8 ao final de cada linha renderizada. Os estilos não persistem entre linhas. Se você emitir texto multilinha com estilização, reaplique os estilos por linha ou use `wrapTextWithAnsi()` para que os estilos sejam preservados em cada linha quebrada.

## Interface Focusable (Suporte a IME)

Componentes que exibem um cursor de texto e precisam de suporte a IME (Input Method Editor) devem implementar a interface `Focusable`:

```typescript
import { CURSOR_MARKER, type Component, type Focusable } from "@earendil-works/pi-tui";

class MyInput implements Component, Focusable {
  focused: boolean = false;  // Definido pelo TUI quando o foco muda
  
  render(width: number): string[] {
    const marker = this.focused ? CURSOR_MARKER : "";
    // Emite o marker imediatamente antes do cursor falso
    return [`> ${beforeCursor}${marker}\x1b[7m${atCursor}\x1b[27m${afterCursor}`];
  }
}
```

Quando um componente `Focusable` está em foco, o TUI:
1. Define `focused = true` no componente
2. Varre a saída renderizada em busca de `CURSOR_MARKER` (uma sequência de escape APC de largura zero)
3. Posiciona o cursor do terminal de hardware nessa localização
4. Exibe o cursor de hardware

Isso permite que janelas de candidatos IME apareçam na posição correta para métodos de entrada CJK. Os componentes built-in `Editor` e `Input` já implementam essa interface.

### Componentes Container com Inputs Embutidos

Quando um componente container (dialog, selector, etc.) contém um `Input` ou `Editor` filho, o container deve implementar `Focusable` e propagar o estado de foco para o filho. Caso contrário, o cursor de hardware não será posicionado corretamente para entrada via IME.

```typescript
import { Container, type Focusable, Input } from "@earendil-works/pi-tui";

class SearchDialog extends Container implements Focusable {
  private searchInput: Input;

  // Implementação de Focusable - propaga para o input filho para posicionamento do cursor IME
  private _focused = false;
  get focused(): boolean {
    return this._focused;
  }
  set focused(value: boolean) {
    this._focused = value;
    this.searchInput.focused = value;
  }

  constructor() {
    super();
    this.searchInput = new Input();
    this.addChild(this.searchInput);
  }
}
```

Sem essa propagação, digitar com um IME (chinês, japonês, coreano, etc.) mostrará a janela de candidatos na posição errada na tela.

## Usando Componentes

**Em extensões** via `ctx.ui.custom()`:

```typescript
pi.on("session_start", async (_event, ctx) => {
  const handle = ctx.ui.custom(myComponent);
  // handle.requestRender() - aciona re-render
  // handle.close() - restaura a UI normal
});
```

**Em ferramentas personalizadas** via `pi.ui.custom()`:

```typescript
async execute(toolCallId, params, onUpdate, ctx, signal) {
  const handle = pi.ui.custom(myComponent);
  // ...
  handle.close();
}
```

## Overlays

Overlays renderizam componentes sobre o conteúdo existente sem limpar a tela. Passe `{ overlay: true }` para `ctx.ui.custom()`:

```typescript
const result = await ctx.ui.custom<string | null>(
  (tui, theme, keybindings, done) => new MyDialog({ onClose: done }),
  { overlay: true }
);
```

Para posicionamento e dimensionamento, use `overlayOptions`:

```typescript
const result = await ctx.ui.custom<string | null>(
  (tui, theme, keybindings, done) => new SidePanel({ onClose: done }),
  {
    overlay: true,
    overlayOptions: {
      // Tamanho: número ou string de porcentagem
      width: "50%",          // 50% da largura do terminal
      minWidth: 40,          // mínimo de 40 colunas
      maxHeight: "80%",      // máximo de 80% da altura do terminal

      // Posição: baseada em âncora (padrão: "center")
      anchor: "right-center", // 9 posições: center, top-left, top-center, etc.
      offsetX: -2,            // deslocamento em relação à âncora
      offsetY: 0,

      // Ou posicionamento por porcentagem/absoluto
      row: "25%",            // 25% a partir do topo
      col: 10,               // coluna 10

      // Margens
      margin: 2,             // todos os lados, ou { top, right, bottom, left }

      // Responsivo: ocultar em terminais estreitos
      visible: (termWidth, termHeight) => termWidth >= 80,
    },
    // Obter handle para controle programático de visibilidade
    onHandle: (handle) => {
      // handle.setHidden(true/false) - alternar visibilidade
      // handle.hide() - remover permanentemente
    },
  }
);
```

### Ciclo de Vida do Overlay

Componentes de overlay são descartados quando fechados. Não reutilize referências — crie instâncias novas:

```typescript
// Errado - referência obsoleta
let menu: MenuComponent;
await ctx.ui.custom((_, __, ___, done) => {
  menu = new MenuComponent(done);
  return menu;
}, { overlay: true });
setActiveComponent(menu);  // Descartado

// Correto - chame novamente para exibir de novo
const showMenu = () => ctx.ui.custom((_, __, ___, done) => 
  new MenuComponent(done), { overlay: true });

await showMenu();  // Primeira exibição
await showMenu();  // "Voltar" = simplesmente chame novamente
```

Veja [overlay-qa-tests.ts](../examples/extensions/overlay-qa-tests.ts) para exemplos abrangentes cobrindo âncoras, margens, empilhamento, visibilidade responsiva e animação.

## Componentes Built-in

Importe de `@earendil-works/pi-tui`:

```typescript
import { Text, Box, Container, Spacer, Markdown } from "@earendil-works/pi-tui";
```

### Text

Texto multilinha com quebra de palavras.

```typescript
const text = new Text(
  "Hello World",    // conteúdo
  1,                // paddingX (padrão: 1)
  1,                // paddingY (padrão: 1)
  (s) => bgGray(s)  // função de plano de fundo opcional
);
text.setText("Updated");
```

### Box

Container com padding e cor de plano de fundo.

```typescript
const box = new Box(
  1,                // paddingX
  1,                // paddingY
  (s) => bgGray(s)  // função de plano de fundo
);
box.addChild(new Text("Content", 0, 0));
box.setBgFn((s) => bgBlue(s));
```

### Container

Agrupa componentes filhos verticalmente.

```typescript
const container = new Container();
container.addChild(component1);
container.addChild(component2);
container.removeChild(component1);
```

### Spacer

Espaço vertical vazio.

```typescript
const spacer = new Spacer(2);  // 2 linhas vazias
```

### Markdown

Renderiza markdown com realce de sintaxe.

```typescript
const md = new Markdown(
  "# Title\n\nSome **bold** text",
  1,        // paddingX
  1,        // paddingY
  theme     // MarkdownTheme (veja abaixo)
);
md.setText("Updated markdown");
```

### Image

Renderiza imagens em terminais compatíveis (Kitty, iTerm2, Ghostty, WezTerm).

```typescript
const image = new Image(
  base64Data,   // imagem codificada em base64
  "image/png",  // tipo MIME
  theme,        // ImageTheme
  { maxWidthCells: 80, maxHeightCells: 24 }
);
```

## Entrada de Teclado

Use `matchesKey()` para detecção de teclas:

```typescript
import { matchesKey, Key } from "@earendil-works/pi-tui";

handleInput(data: string) {
  if (matchesKey(data, Key.up)) {
    this.selectedIndex--;
  } else if (matchesKey(data, Key.enter)) {
    this.onSelect?.(this.selectedIndex);
  } else if (matchesKey(data, Key.escape)) {
    this.onCancel?.();
  } else if (matchesKey(data, Key.ctrl("c"))) {
    // Ctrl+C
  }
}
```

**Identificadores de tecla** (use `Key.*` para autocomplete, ou literais de string):
- Teclas básicas: `Key.enter`, `Key.escape`, `Key.tab`, `Key.space`, `Key.backspace`, `Key.delete`, `Key.home`, `Key.end`
- Teclas de seta: `Key.up`, `Key.down`, `Key.left`, `Key.right`
- Com modificadores: `Key.ctrl("c")`, `Key.shift("tab")`, `Key.alt("left")`, `Key.ctrlShift("p")`
- Formato de string também funciona: `"enter"`, `"ctrl+c"`, `"shift+tab"`, `"ctrl+shift+p"`

## Largura de Linha

**Crítico:** Cada linha retornada por `render()` não deve exceder o parâmetro `width`.

```typescript
import { visibleWidth, truncateToWidth } from "@earendil-works/pi-tui";

render(width: number): string[] {
  // Trunca linhas longas
  return [truncateToWidth(this.text, width)];
}
```

Utilitários:
- `visibleWidth(str)` - Obtém a largura de exibição (ignora códigos ANSI)
- `truncateToWidth(str, width, ellipsis?)` - Trunca com ellipsis opcional
- `wrapTextWithAnsi(str, width)` - Quebra de palavras preservando códigos ANSI

## Criando Componentes Personalizados

Exemplo: Seletor interativo

```typescript
import {
  matchesKey, Key,
  truncateToWidth, visibleWidth
} from "@earendil-works/pi-tui";

class MySelector {
  private items: string[];
  private selected = 0;
  private cachedWidth?: number;
  private cachedLines?: string[];
  
  public onSelect?: (item: string) => void;
  public onCancel?: () => void;

  constructor(items: string[]) {
    this.items = items;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up) && this.selected > 0) {
      this.selected--;
      this.invalidate();
    } else if (matchesKey(data, Key.down) && this.selected < this.items.length - 1) {
      this.selected++;
      this.invalidate();
    } else if (matchesKey(data, Key.enter)) {
      this.onSelect?.(this.items[this.selected]);
    } else if (matchesKey(data, Key.escape)) {
      this.onCancel?.();
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    this.cachedLines = this.items.map((item, i) => {
      const prefix = i === this.selected ? "> " : "  ";
      return truncateToWidth(prefix + item, width);
    });
    this.cachedWidth = width;
    return this.cachedLines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}
```

Uso em uma extensão:

```typescript
pi.registerCommand("pick", {
  description: "Pick an item",
  handler: async (args, ctx) => {
    const items = ["Option A", "Option B", "Option C"];
    const selector = new MySelector(items);
    
    let handle: { close: () => void; requestRender: () => void };
    
    await new Promise<void>((resolve) => {
      selector.onSelect = (item) => {
        ctx.ui.notify(`Selected: ${item}`, "info");
        handle.close();
        resolve();
      };
      selector.onCancel = () => {
        handle.close();
        resolve();
      };
      handle = ctx.ui.custom(selector);
    });
  }
});
```

## Temas

Componentes aceitam objetos de tema para estilização.

**Em `renderCall`/`renderResult`**, use o parâmetro `theme`:

```typescript
renderResult(result, options, theme, context) {
  // Use theme.fg() para cores de primeiro plano
  return new Text(theme.fg("success", "Done!"), 0, 0);
  
  // Use theme.bg() para cores de plano de fundo
  const styled = theme.bg("toolPendingBg", theme.fg("accent", "text"));
}
```

**Cores de primeiro plano** (`theme.fg(color, text)`):

| Categoria | Cores |
|-----------|-------|
| Geral | `text`, `accent`, `muted`, `dim` |
| Status | `success`, `error`, `warning` |
| Bordas | `border`, `borderAccent`, `borderMuted` |
| Mensagens | `userMessageText`, `customMessageText`, `customMessageLabel` |
| Ferramentas | `toolTitle`, `toolOutput` |
| Diffs | `toolDiffAdded`, `toolDiffRemoved`, `toolDiffContext` |
| Markdown | `mdHeading`, `mdLink`, `mdLinkUrl`, `mdCode`, `mdCodeBlock`, `mdCodeBlockBorder`, `mdQuote`, `mdQuoteBorder`, `mdHr`, `mdListBullet` |
| Sintaxe | `syntaxComment`, `syntaxKeyword`, `syntaxFunction`, `syntaxVariable`, `syntaxString`, `syntaxNumber`, `syntaxType`, `syntaxOperator`, `syntaxPunctuation` |
| Pensamento | `thinkingOff`, `thinkingMinimal`, `thinkingLow`, `thinkingMedium`, `thinkingHigh`, `thinkingXhigh` |
| Modos | `bashMode` |

**Cores de plano de fundo** (`theme.bg(color, text)`):

`selectedBg`, `userMessageBg`, `customMessageBg`, `toolPendingBg`, `toolSuccessBg`, `toolErrorBg`

**Para Markdown**, use `getMarkdownTheme()`:

```typescript
import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Markdown } from "@earendil-works/pi-tui";

renderResult(result, options, theme, context) {
  const mdTheme = getMarkdownTheme();
  return new Markdown(result.details.markdown, 0, 0, mdTheme);
}
```

**Para componentes personalizados**, defina sua própria interface de tema:

```typescript
interface MyTheme {
  selected: (s: string) => string;
  normal: (s: string) => string;
}
```

## Log de Depuração

Defina `PI_TUI_WRITE_LOG` para capturar o stream ANSI bruto escrito no stdout.

```bash
PI_TUI_WRITE_LOG=/tmp/tui-ansi.log npx tsx packages/tui/test/chat-simple.ts
```

## Desempenho

Armazene em cache a saída renderizada quando possível:

```typescript
class CachedComponent {
  private cachedWidth?: number;
  private cachedLines?: string[];

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }
    // ... calcula linhas ...
    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}
```

Chame `invalidate()` quando o estado mudar, depois `handle.requestRender()` para acionar o re-render.

## Invalidação e Mudanças de Tema

Quando o tema muda, o TUI chama `invalidate()` em todos os componentes para limpar seus caches. Os componentes devem implementar `invalidate()` corretamente para garantir que as mudanças de tema entrem em vigor.

### O Problema

Se um componente pré-incorpora cores de tema em strings (via `theme.fg()`, `theme.bg()`, etc.) e as armazena em cache, as strings em cache contêm códigos de escape ANSI do tema antigo. Simplesmente limpar o cache de render não é suficiente se o componente armazena o conteúdo temático separadamente.

**Abordagem errada** (cores do tema não serão atualizadas):

```typescript
class BadComponent extends Container {
  private content: Text;

  constructor(message: string, theme: Theme) {
    super();
    // Cores de tema pré-incorporadas armazenadas no componente Text
    this.content = new Text(theme.fg("accent", message), 1, 0);
    this.addChild(this.content);
  }
  // Sem override de invalidate - o invalidate do pai apenas limpa
  // os caches de render dos filhos, não o conteúdo pré-incorporado
}
```

### A Solução

Componentes que constroem conteúdo com cores de tema devem reconstruir esse conteúdo quando `invalidate()` for chamado:

```typescript
class GoodComponent extends Container {
  private message: string;
  private content: Text;

  constructor(message: string) {
    super();
    this.message = message;
    this.content = new Text("", 1, 0);
    this.addChild(this.content);
    this.updateDisplay();
  }

  private updateDisplay(): void {
    // Reconstrói o conteúdo com o tema atual
    this.content.setText(theme.fg("accent", this.message));
  }

  override invalidate(): void {
    super.invalidate();  // Limpa os caches dos filhos
    this.updateDisplay(); // Reconstrói com o novo tema
  }
}
```

### Padrão: Reconstruir ao Invalidar

Para componentes com conteúdo complexo:

```typescript
class ComplexComponent extends Container {
  private data: SomeData;

  constructor(data: SomeData) {
    super();
    this.data = data;
    this.rebuild();
  }

  private rebuild(): void {
    this.clear();  // Remove todos os filhos

    // Constrói a UI com o tema atual
    this.addChild(new Text(theme.fg("accent", theme.bold("Title")), 1, 0));
    this.addChild(new Spacer(1));

    for (const item of this.data.items) {
      const color = item.active ? "success" : "muted";
      this.addChild(new Text(theme.fg(color, item.label), 1, 0));
    }
  }

  override invalidate(): void {
    super.invalidate();
    this.rebuild();
  }
}
```

### Quando Isso é Necessário

Este padrão é necessário quando:

1. **Pré-incorporando cores de tema** - Usando `theme.fg()` ou `theme.bg()` para criar strings estilizadas armazenadas em componentes filhos
2. **Realce de sintaxe** - Usando `highlightCode()` que aplica cores de sintaxe baseadas no tema
3. **Layouts complexos** - Construindo árvores de componentes filhos que embutem cores de tema

Este padrão NÃO é necessário quando:

1. **Usando callbacks de tema** - Passando funções como `(text) => theme.fg("accent", text)` que são chamadas durante o render
2. **Containers simples** - Apenas agrupando outros componentes sem adicionar conteúdo temático
3. **Render sem estado** - Calculando a saída temática diretamente em cada chamada de `render()` (sem cache)

## Padrões Comuns

Estes padrões cobrem as necessidades de UI mais comuns em extensões. **Copie estes padrões em vez de construir do zero.**

### Padrão 1: Dialog de Seleção (SelectList)

Para permitir que usuários escolham de uma lista de opções. Use `SelectList` de `@earendil-works/pi-tui` com `DynamicBorder` para enquadramento.

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";

pi.registerCommand("pick", {
  handler: async (_args, ctx) => {
    const items: SelectItem[] = [
      { value: "opt1", label: "Option 1", description: "First option" },
      { value: "opt2", label: "Option 2", description: "Second option" },
      { value: "opt3", label: "Option 3" },  // description é opcional
    ];

    const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
      const container = new Container();

      // Borda superior
      container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

      // Título
      container.addChild(new Text(theme.fg("accent", theme.bold("Pick an Option")), 1, 0));

      // SelectList com tema
      const selectList = new SelectList(items, Math.min(items.length, 10), {
        selectedPrefix: (t) => theme.fg("accent", t),
        selectedText: (t) => theme.fg("accent", t),
        description: (t) => theme.fg("muted", t),
        scrollInfo: (t) => theme.fg("dim", t),
        noMatch: (t) => theme.fg("warning", t),
      });
      selectList.onSelect = (item) => done(item.value);
      selectList.onCancel = () => done(null);
      container.addChild(selectList);

      // Texto de ajuda
      container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel"), 1, 0));

      // Borda inferior
      container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

      return {
        render: (w) => container.render(w),
        invalidate: () => container.invalidate(),
        handleInput: (data) => { selectList.handleInput(data); tui.requestRender(); },
      };
    });

    if (result) {
      ctx.ui.notify(`Selected: ${result}`, "info");
    }
  },
});
```

**Exemplos:** [preset.ts](../examples/extensions/preset.ts), [tools.ts](../examples/extensions/tools.ts)

### Padrão 2: Operação Assíncrona com Cancelamento (BorderedLoader)

Para operações que levam tempo e devem ser canceláveis. `BorderedLoader` exibe um spinner e trata escape para cancelar.

```typescript
import { BorderedLoader } from "@earendil-works/pi-coding-agent";

pi.registerCommand("fetch", {
  handler: async (_args, ctx) => {
    const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
      const loader = new BorderedLoader(tui, theme, "Fetching data...");
      loader.onAbort = () => done(null);

      // Executa trabalho assíncrono
      fetchData(loader.signal)
        .then((data) => done(data))
        .catch(() => done(null));

      return loader;
    });

    if (result === null) {
      ctx.ui.notify("Cancelled", "info");
    } else {
      ctx.ui.setEditorText(result);
    }
  },
});
```

**Exemplos:** [qna.ts](../examples/extensions/qna.ts), [handoff.ts](../examples/extensions/handoff.ts)

### Padrão 3: Configurações/Alternâncias (SettingsList)

Para alternar múltiplas configurações. Use `SettingsList` de `@earendil-works/pi-tui` com `getSettingsListTheme()`.

```typescript
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { Container, type SettingItem, SettingsList, Text } from "@earendil-works/pi-tui";

pi.registerCommand("settings", {
  handler: async (_args, ctx) => {
    const items: SettingItem[] = [
      { id: "verbose", label: "Verbose mode", currentValue: "off", values: ["on", "off"] },
      { id: "color", label: "Color output", currentValue: "on", values: ["on", "off"] },
    ];

    await ctx.ui.custom((_tui, theme, _kb, done) => {
      const container = new Container();
      container.addChild(new Text(theme.fg("accent", theme.bold("Settings")), 1, 1));

      const settingsList = new SettingsList(
        items,
        Math.min(items.length + 2, 15),
        getSettingsListTheme(),
        (id, newValue) => {
          // Trata a mudança de valor
          ctx.ui.notify(`${id} = ${newValue}`, "info");
        },
        () => done(undefined),  // Ao fechar
        { enableSearch: true }, // Opcional: habilita busca fuzzy por label
      );
      container.addChild(settingsList);

      return {
        render: (w) => container.render(w),
        invalidate: () => container.invalidate(),
        handleInput: (data) => settingsList.handleInput?.(data),
      };
    });
  },
});
```

**Exemplos:** [tools.ts](../examples/extensions/tools.ts)

### Padrão 4: Indicador de Status Persistente

Exibe o status no rodapé que persiste entre renders. Ideal para indicadores de modo.

```typescript
// Define o status (exibido no rodapé)
ctx.ui.setStatus("my-ext", ctx.ui.theme.fg("accent", "● active"));

// Limpa o status
ctx.ui.setStatus("my-ext", undefined);
```

**Exemplos:** [status-line.ts](../examples/extensions/status-line.ts), [plan-mode.ts](../examples/extensions/plan-mode.ts), [preset.ts](../examples/extensions/preset.ts)

### Padrão 4b: Personalização do Indicador de Trabalho

Personaliza o indicador de trabalho inline exibido enquanto o pi transmite uma resposta.

```typescript
// Indicador estático
ctx.ui.setWorkingIndicator({ frames: [ctx.ui.theme.fg("accent", "●")] });

// Indicador animado personalizado
ctx.ui.setWorkingIndicator({
  frames: [
    ctx.ui.theme.fg("dim", "·"),
    ctx.ui.theme.fg("muted", "•"),
    ctx.ui.theme.fg("accent", "●"),
    ctx.ui.theme.fg("muted", "•"),
  ],
  intervalMs: 120,
});

// Ocultar o indicador completamente
ctx.ui.setWorkingIndicator({ frames: [] });

// Restaurar o spinner padrão do pi
ctx.ui.setWorkingIndicator();
```

Isso afeta apenas o indicador de trabalho normal durante o streaming. Os loaders de compactação e de nova tentativa mantêm seu estilo built-in. Os frames personalizados são renderizados literalmente, portanto as extensões devem adicionar suas próprias cores quando necessário.

**Exemplos:** [working-indicator.ts](../examples/extensions/working-indicator.ts)

### Padrão 5: Widgets Acima/Abaixo do Editor

Exibe conteúdo persistente acima ou abaixo do editor de entrada. Ideal para listas de tarefas, progresso.

```typescript
// Array de strings simples (acima do editor por padrão)
ctx.ui.setWidget("my-widget", ["Line 1", "Line 2"]);

// Renderiza abaixo do editor
ctx.ui.setWidget("my-widget", ["Line 1", "Line 2"], { placement: "belowEditor" });

// Ou com tema
ctx.ui.setWidget("my-widget", (_tui, theme) => {
  const lines = items.map((item, i) =>
    item.done
      ? theme.fg("success", "✓ ") + theme.fg("muted", item.text)
      : theme.fg("dim", "○ ") + item.text
  );
  return {
    render: () => lines,
    invalidate: () => {},
  };
});

// Limpar
ctx.ui.setWidget("my-widget", undefined);
```

**Exemplos:** [plan-mode.ts](../examples/extensions/plan-mode.ts)

### Padrão 6: Rodapé Personalizado

Substitui o rodapé. `footerData` expõe dados não acessíveis de outra forma para extensões.

```typescript
ctx.ui.setFooter((tui, theme, footerData) => ({
  invalidate() {},
  render(width: number): string[] {
    // footerData.getGitBranch(): string | null
    // footerData.getExtensionStatuses(): ReadonlyMap<string, string>
    return [`${ctx.model?.id} (${footerData.getGitBranch() || "no git"})`];
  },
  dispose: footerData.onBranchChange(() => tui.requestRender()), // reativo
}));

ctx.ui.setFooter(undefined); // restaura o padrão
```

Estatísticas de tokens disponíveis via `ctx.sessionManager.getBranch()` e `ctx.model`.

**Exemplos:** [custom-footer.ts](../examples/extensions/custom-footer.ts)

### Padrão 7: Editor Personalizado (modo vim, etc.)

Substitui o editor de entrada principal por uma implementação personalizada. Útil para edição modal (vim), keybindings diferentes (emacs) ou tratamento especializado de entrada.

```typescript
import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

type Mode = "normal" | "insert";

class VimEditor extends CustomEditor {
  private mode: Mode = "insert";

  handleInput(data: string): void {
    // Escape: muda para modo normal, ou passa adiante para tratamento do app
    if (matchesKey(data, "escape")) {
      if (this.mode === "insert") {
        this.mode = "normal";
        return;
      }
      // No modo normal, escape aborta o agente (tratado pelo CustomEditor)
      super.handleInput(data);
      return;
    }

    // Modo insert: passa tudo para o CustomEditor
    if (this.mode === "insert") {
      super.handleInput(data);
      return;
    }

    // Modo normal: navegação estilo vim
    switch (data) {
      case "i": this.mode = "insert"; return;
      case "h": super.handleInput("\x1b[D"); return; // Esquerda
      case "j": super.handleInput("\x1b[B"); return; // Baixo
      case "k": super.handleInput("\x1b[A"); return; // Cima
      case "l": super.handleInput("\x1b[C"); return; // Direita
    }
    // Passa teclas não tratadas para super (ctrl+c, etc.), mas filtra caracteres imprimíveis
    if (data.length === 1 && data.charCodeAt(0) >= 32) return;
    super.handleInput(data);
  }

  render(width: number): string[] {
    const lines = super.render(width);
    // Adiciona indicador de modo à borda inferior (usa truncateToWidth para truncação segura com ANSI)
    if (lines.length > 0) {
      const label = this.mode === "normal" ? " NORMAL " : " INSERT ";
      const lastLine = lines[lines.length - 1]!;
      // Passa "" como ellipsis para evitar adicionar "..." ao truncar
      lines[lines.length - 1] = truncateToWidth(lastLine, width - label.length, "") + label;
    }
    return lines;
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    // Factory recebe tema e keybindings do app
    ctx.ui.setEditorComponent((tui, theme, keybindings) =>
      new VimEditor(theme, keybindings)
    );
  });
}
```

**Pontos principais:**

- **Estenda `CustomEditor`** (não o `Editor` base) para obter os keybindings do app (escape para abortar, ctrl+d para sair, troca de modelo, etc.)
- **Chame `super.handleInput(data)`** para teclas que você não trata
- **Padrão factory**: `setEditorComponent` recebe uma função factory que obtém `tui`, `theme` e `keybindings`
- **Passe `undefined`** para restaurar o editor padrão: `ctx.ui.setEditorComponent(undefined)`

**Exemplos:** [modal-editor.ts](../examples/extensions/modal-editor.ts)

## Regras Principais

1. **Sempre use o tema do callback** - Não importe o tema diretamente. Use `theme` do callback `ctx.ui.custom((tui, theme, keybindings, done) => ...)`.

2. **Sempre tipar o parâmetro de cor do DynamicBorder** - Escreva `(s: string) => theme.fg("accent", s)`, não `(s) => theme.fg("accent", s)`.

3. **Chame tui.requestRender() após mudanças de estado** - Em `handleInput`, chame `tui.requestRender()` após atualizar o estado.

4. **Retorne o objeto com os três métodos** - Componentes personalizados precisam de `{ render, invalidate, handleInput }`.

5. **Use os componentes existentes** - `SelectList`, `SettingsList`, `BorderedLoader` cobrem 90% dos casos. Não os reconstrua.

## Exemplos

- **UI de seleção**: [examples/extensions/preset.ts](../examples/extensions/preset.ts) - SelectList com enquadramento DynamicBorder
- **Assíncrono com cancelamento**: [examples/extensions/qna.ts](../examples/extensions/qna.ts) - BorderedLoader para chamadas LLM
- **Alternância de configurações**: [examples/extensions/tools.ts](../examples/extensions/tools.ts) - SettingsList para habilitar/desabilitar ferramentas
- **Indicadores de status**: [examples/extensions/plan-mode.ts](../examples/extensions/plan-mode.ts) - setStatus e setWidget
- **Indicador de trabalho**: [examples/extensions/working-indicator.ts](../examples/extensions/working-indicator.ts) - setWorkingIndicator
- **Rodapé personalizado**: [examples/extensions/custom-footer.ts](../examples/extensions/custom-footer.ts) - setFooter com estatísticas
- **Editor personalizado**: [examples/extensions/modal-editor.ts](../examples/extensions/modal-editor.ts) - Edição modal estilo Vim
- **Jogo Snake**: [examples/extensions/snake.ts](../examples/extensions/snake.ts) - Jogo completo com entrada de teclado e loop de jogo
- **Renderização de ferramenta personalizada**: [examples/extensions/todo.ts](../examples/extensions/todo.ts) - renderCall e renderResult
