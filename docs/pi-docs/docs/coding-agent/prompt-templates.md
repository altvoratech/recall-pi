> O pi pode criar prompt templates. Peça para ele construir um para o seu fluxo de trabalho.

# Prompt Templates

Prompt templates são trechos Markdown que se expandem em prompts completos. Digite `/nome` no editor para invocar um template, onde `nome` é o nome do arquivo sem `.md`.

## Localizações

O Pi carrega prompt templates de:

- Global: `~/.pi/agent/prompts/*.md`
- Projeto: `.pi/prompts/*.md`
- Pacotes: diretórios `prompts/` ou entradas `pi.prompts` no `package.json`
- Configurações: array `prompts` com arquivos ou diretórios
- CLI: `--prompt-template <path>` (repetível)

Desative a descoberta com `--no-prompt-templates`.

## Formato

```markdown
---
description: Review staged git changes
---
Review the staged changes (`git diff --cached`). Focus on:
- Bugs and logic errors
- Security issues
- Error handling gaps
```

- O nome do arquivo torna-se o nome do comando. `review.md` torna-se `/review`.
- `description` é opcional. Se ausente, a primeira linha não vazia é usada.
- `argument-hint` é opcional. Quando definido, o hint é exibido antes da descrição no dropdown de autocomplete.

### Hints de Argumento

Use `argument-hint` no frontmatter para mostrar os argumentos esperados no autocomplete. Use `<colchetes angulares>` para argumentos obrigatórios e `[colchetes quadrados]` para opcionais:

```markdown
---
description: Review PRs from URLs with structured issue and code analysis
argument-hint: "<PR-URL>"
---
```

Isso é renderizado no dropdown de autocomplete como:

```
→ pr   <PR-URL>       — Review PRs from URLs with structured issue and code analysis
  is   <issue>        — Analyze GitHub issues (bugs or feature requests)
  wr   [instructions] — Finish the current task end-to-end
  cl   — Audit changelog entries before release
```

## Uso

Digite `/` seguido do nome do template no editor. O autocomplete exibe os templates disponíveis com suas descrições.

```
/review                           # Expande review.md
/component Button                 # Expande com argumento
/component Button "click handler" # Múltiplos argumentos
```

## Argumentos

Os templates suportam argumentos posicionais e fatiamento simples:

- `$1`, `$2`, ... argumentos posicionais
- `$@` ou `$ARGUMENTS` para todos os argumentos concatenados
- `${@:N}` para argumentos a partir da posição N (indexado em 1)
- `${@:N:L}` para `L` argumentos a partir de N

Exemplo:

```markdown
---
description: Create a component
---
Create a React component named $1 with features: $@
```

Uso: `/component Button "onClick handler" "disabled support"`

## Regras de Carregamento

- A descoberta de templates em `prompts/` não é recursiva.
- Se você quiser templates em subdiretórios, adicione-os explicitamente via configuração `prompts` ou um manifesto de pacote.
