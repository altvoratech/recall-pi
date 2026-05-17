# Command Bridge

Lê slash commands de outros ecossistemas (Claude Code, Codex, Opencode) e expõe
no Pi como comandos nativos. Sem reinventar — reusa o que você já mantém em
`~/.claude/commands/`, `~/.codex/prompts/`, etc.

## Como funciona

1. No `session_start`, varre os diretórios configurados
2. Cada `.md` encontrado vira um comando `/<source>:<name>`
3. O **body** do `.md` é o template
4. Quando você invoca `/<source>:<name> <args>`, o template é interpolado
   (substituindo `$@`, `$ARGUMENTS`, `$1`...`$9`) e enviado como mensagem do
   usuário pro agente

## Namespacing

Comandos descobertos viram `/<source>:<bare-name>` para evitar colisão e deixar
a origem visível:

```
/claude:refactor
/claude-sk:tiptap-editor
/codex:test-gen
/opencode:new-feature
```

## Sources padrão

```json
{
  "commandBridge": {
    "enabled": true,
    "sources": [
      { "name": "claude",    "dir": "~/.claude/commands",  "priority": 80 },
      { "name": "claude-sk", "dir": "~/.claude/skills",    "priority": 70, "subdirMode": true },
      { "name": "codex",     "dir": "~/.codex/prompts",    "priority": 70 },
      { "name": "opencode",  "dir": "~/.opencode/commands","priority": 55 }
    ]
  }
}
```

`subdirMode: true` aplica a sources onde cada item é um **subdiretório** (Claude
skills). Procura `SKILL.md` → `<dirname>.md` → primeiro `.md` do subdir.

`priority` é usado apenas pra ordenação de listagem (status command). Como
comandos são namespacados por source, colisão real não acontece.

## Frontmatter suportado

Cada `.md` pode ter:

```markdown
---
name: refactor          # opcional, default = nome do arquivo
description: ...        # opcional, mostrado no autocomplete
---
Body content with $@ or $ARGUMENTS placeholder for user args.
```

## Diagnóstico

```
/command-bridge
```

Lista todos os comandos carregados.

## Desligar

```json
{ "commandBridge": { "enabled": false } }
```
