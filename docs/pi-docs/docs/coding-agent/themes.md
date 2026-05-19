> pi pode criar temas. Peça para ele construir um para o seu setup.

# Temas

Temas são arquivos JSON que definem as cores da TUI.

## Sumário

- [Localização](#locations)
- [Selecionando um Tema](#selecting-a-theme)
- [Criando um Tema Personalizado](#creating-a-custom-theme)
- [Formato do Tema](#theme-format)
- [Tokens de Cor](#color-tokens)
- [Valores de Cor](#color-values)
- [Dicas](#tips)

## Localização

Pi carrega temas de:

- Integrados: `dark`, `light`
- Global: `~/.pi/agent/themes/*.json`
- Projeto: `.pi/themes/*.json`
- Pacotes: diretórios `themes/` ou entradas `pi.themes` em `package.json`
- Configurações: array `themes` com arquivos ou diretórios
- CLI: `--theme <path>` (repetível)

Desative a descoberta com `--no-themes`.

## Selecionando um Tema

Selecione um tema via `/settings` ou em `settings.json`:

```json
{
  "theme": "my-theme"
}
```

Na primeira execução, pi detecta o fundo do seu terminal e define o padrão como `dark` ou `light`.

## Criando um Tema Personalizado

1. Crie um arquivo de tema:

```bash
mkdir -p ~/.pi/agent/themes
vim ~/.pi/agent/themes/my-theme.json
```

2. Defina o tema com todas as cores obrigatórias (consulte [Tokens de Cor](#color-tokens)):

```json
{
  "$schema": "https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json",
  "name": "my-theme",
  "vars": {
    "primary": "#00aaff",
    "secondary": 242
  },
  "colors": {
    "accent": "primary",
    "border": "primary",
    "borderAccent": "#00ffff",
    "borderMuted": "secondary",
    "success": "#00ff00",
    "error": "#ff0000",
    "warning": "#ffff00",
    "muted": "secondary",
    "dim": 240,
    "text": "",
    "thinkingText": "secondary",
    "selectedBg": "#2d2d30",
    "userMessageBg": "#2d2d30",
    "userMessageText": "",
    "customMessageBg": "#2d2d30",
    "customMessageText": "",
    "customMessageLabel": "primary",
    "toolPendingBg": "#1e1e2e",
    "toolSuccessBg": "#1e2e1e",
    "toolErrorBg": "#2e1e1e",
    "toolTitle": "primary",
    "toolOutput": "",
    "mdHeading": "#ffaa00",
    "mdLink": "primary",
    "mdLinkUrl": "secondary",
    "mdCode": "#00ffff",
    "mdCodeBlock": "",
    "mdCodeBlockBorder": "secondary",
    "mdQuote": "secondary",
    "mdQuoteBorder": "secondary",
    "mdHr": "secondary",
    "mdListBullet": "#00ffff",
    "toolDiffAdded": "#00ff00",
    "toolDiffRemoved": "#ff0000",
    "toolDiffContext": "secondary",
    "syntaxComment": "secondary",
    "syntaxKeyword": "primary",
    "syntaxFunction": "#00aaff",
    "syntaxVariable": "#ffaa00",
    "syntaxString": "#00ff00",
    "syntaxNumber": "#ff00ff",
    "syntaxType": "#00aaff",
    "syntaxOperator": "primary",
    "syntaxPunctuation": "secondary",
    "thinkingOff": "secondary",
    "thinkingMinimal": "primary",
    "thinkingLow": "#00aaff",
    "thinkingMedium": "#00ffff",
    "thinkingHigh": "#ff00ff",
    "thinkingXhigh": "#ff0000",
    "bashMode": "#ffaa00"
  }
}
```

3. Selecione o tema via `/settings`.

**Hot reload:** Ao editar o arquivo do tema personalizado atualmente ativo, pi o recarrega automaticamente para feedback visual imediato.

## Formato do Tema

```json
{
  "$schema": "https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json",
  "name": "my-theme",
  "vars": {
    "blue": "#0066cc",
    "gray": 242
  },
  "colors": {
    "accent": "blue",
    "muted": "gray",
    "text": "",
    ...
  }
}
```

- `name` é obrigatório e deve ser único.
- `vars` é opcional. Defina cores reutilizáveis aqui e referencie-as em `colors`.
- `colors` deve definir todos os 51 tokens obrigatórios.

O campo `$schema` habilita autocompletar e validação no editor.

## Tokens de Cor

Cada tema deve definir todos os 51 tokens de cor. Não há cores opcionais.

### Interface Principal (11 cores)

| Token | Finalidade |
|-------|-----------|
| `accent` | Destaque principal (logo, itens selecionados, cursor) |
| `border` | Bordas normais |
| `borderAccent` | Bordas destacadas |
| `borderMuted` | Bordas sutis (editor) |
| `success` | Estados de sucesso |
| `error` | Estados de erro |
| `warning` | Estados de aviso |
| `muted` | Texto secundário |
| `dim` | Texto terciário |
| `text` | Texto padrão (normalmente `""`) |
| `thinkingText` | Texto do bloco de thinking |

### Fundos e Conteúdo (11 cores)

| Token | Finalidade |
|-------|-----------|
| `selectedBg` | Fundo da linha selecionada |
| `userMessageBg` | Fundo da mensagem do usuário |
| `userMessageText` | Texto da mensagem do usuário |
| `customMessageBg` | Fundo da mensagem de extensão |
| `customMessageText` | Texto da mensagem de extensão |
| `customMessageLabel` | Rótulo da mensagem de extensão |
| `toolPendingBg` | Caixa de ferramenta (pendente) |
| `toolSuccessBg` | Caixa de ferramenta (sucesso) |
| `toolErrorBg` | Caixa de ferramenta (erro) |
| `toolTitle` | Título da ferramenta |
| `toolOutput` | Texto de saída da ferramenta |

### Markdown (10 cores)

| Token | Finalidade |
|-------|-----------|
| `mdHeading` | Títulos |
| `mdLink` | Texto de link |
| `mdLinkUrl` | URL do link |
| `mdCode` | Código inline |
| `mdCodeBlock` | Conteúdo de bloco de código |
| `mdCodeBlockBorder` | Delimitadores de bloco de código |
| `mdQuote` | Texto de blockquote |
| `mdQuoteBorder` | Borda de blockquote |
| `mdHr` | Linha horizontal |
| `mdListBullet` | Marcadores de lista |

### Diffs de Ferramentas (3 cores)

| Token | Finalidade |
|-------|-----------|
| `toolDiffAdded` | Linhas adicionadas |
| `toolDiffRemoved` | Linhas removidas |
| `toolDiffContext` | Linhas de contexto |

### Realce de Sintaxe (9 cores)

| Token | Finalidade |
|-------|-----------|
| `syntaxComment` | Comentários |
| `syntaxKeyword` | Palavras-chave |
| `syntaxFunction` | Nomes de funções |
| `syntaxVariable` | Variáveis |
| `syntaxString` | Strings |
| `syntaxNumber` | Números |
| `syntaxType` | Tipos |
| `syntaxOperator` | Operadores |
| `syntaxPunctuation` | Pontuação |

### Bordas de Nível de Thinking (6 cores)

Cores de borda do editor que indicam o nível de thinking (hierarquia visual do mais sutil ao mais proeminente):

| Token | Finalidade |
|-------|-----------|
| `thinkingOff` | Thinking desativado |
| `thinkingMinimal` | Thinking mínimo |
| `thinkingLow` | Thinking baixo |
| `thinkingMedium` | Thinking médio |
| `thinkingHigh` | Thinking alto |
| `thinkingXhigh` | Thinking extra alto |

### Modo Bash (1 cor)

| Token | Finalidade |
|-------|-----------|
| `bashMode` | Borda do editor no modo bash (prefixo `!`) |

### Exportação HTML (opcional)

A seção `export` controla as cores para a saída HTML gerada pelo `/export`. Se omitida, as cores são derivadas de `userMessageBg`.

```json
{
  "export": {
    "pageBg": "#18181e",
    "cardBg": "#1e1e24",
    "infoBg": "#3c3728"
  }
}
```

## Valores de Cor

Quatro formatos são suportados:

| Formato | Exemplo | Descrição |
|---------|---------|-----------|
| Hex | `"#ff0000"` | RGB hexadecimal com 6 dígitos |
| 256 cores | `39` | Índice da paleta xterm de 256 cores (0-255) |
| Variável | `"primary"` | Referência a uma entrada em `vars` |
| Padrão | `""` | Cor padrão do terminal |

### Paleta de 256 Cores

- `0-15`: Cores ANSI básicas (dependem do terminal)
- `16-231`: Cubo RGB 6×6×6 (`16 + 36×R + 6×G + B` onde R, G, B são 0-5)
- `232-255`: Rampa de tons de cinza

### Compatibilidade com Terminais

Pi usa cores RGB de 24 bits. A maioria dos terminais modernos suporta isso (iTerm2, Kitty, WezTerm, Windows Terminal, VS Code). Para terminais mais antigos com suporte apenas a 256 cores, pi usa a aproximação mais próxima.

Verifique o suporte a truecolor:

```bash
echo $COLORTERM  # Deve exibir "truecolor" ou "24bit"
```

## Dicas

**Terminais escuros:** Use cores brilhantes e saturadas com maior contraste.

**Terminais claros:** Use cores mais escuras e suaves com menor contraste.

**Harmonia de cores:** Comece com uma paleta base (Nord, Gruvbox, Tokyo Night), defina-a em `vars` e referencie de forma consistente.

**Testes:** Verifique seu tema com diferentes tipos de mensagens, estados de ferramentas, conteúdo markdown e texto com quebra longa.

**VS Code:** Defina `terminal.integrated.minimumContrastRatio` como `1` para cores precisas.

## Exemplos

Veja os temas integrados:
- [dark.json](../src/modes/interactive/theme/dark.json)
- [light.json](../src/modes/interactive/theme/light.json)
