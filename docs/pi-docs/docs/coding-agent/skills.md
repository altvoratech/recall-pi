> pi pode criar skills. Peça para ele construir uma para o seu caso de uso.

# Skills

Skills são pacotes de capacidades autocontidos que o agente carrega sob demanda. Uma skill fornece fluxos de trabalho especializados, instruções de configuração, scripts auxiliares e documentação de referência para tarefas específicas.

Pi implementa o [padrão Agent Skills](https://agentskills.io/specification), emitindo avisos sobre violações, mas permanecendo tolerante.

## Sumário

- [Localização](#locations)
- [Como as Skills Funcionam](#how-skills-work)
- [Comandos de Skill](#skill-commands)
- [Estrutura de uma Skill](#skill-structure)
- [Frontmatter](#frontmatter)
- [Validação](#validation)
- [Exemplo](#example)
- [Repositórios de Skills](#skill-repositories)

## Localização

> **Segurança:** Skills podem instruir o modelo a realizar qualquer ação e podem incluir código executável que o modelo invoca. Revise o conteúdo da skill antes de utilizá-la.

Pi carrega skills de:

- Global:
  - `~/.pi/agent/skills/`
  - `~/.agents/skills/`
- Projeto:
  - `.pi/skills/`
  - `.agents/skills/` no `cwd` e diretórios ancestrais (até a raiz do repositório git, ou a raiz do sistema de arquivos quando não estiver em um repositório)
- Pacotes: diretórios `skills/` ou entradas `pi.skills` em `package.json`
- Configurações: array `skills` com arquivos ou diretórios
- CLI: `--skill <path>` (repetível, aditivo mesmo com `--no-skills`)

Regras de descoberta:
- Em `~/.pi/agent/skills/` e `.pi/skills/`, arquivos `.md` na raiz direta são descobertos como skills individuais
- Em todos os locais de skills, diretórios contendo `SKILL.md` são descobertos recursivamente
- Em `~/.agents/skills/` e `.agents/skills/` de projeto, arquivos `.md` na raiz são ignorados

Desative a descoberta com `--no-skills` (caminhos explícitos via `--skill` ainda são carregados).

### Usando Skills de Outros Harnesses

Para usar skills do Claude Code ou OpenAI Codex, adicione os diretórios deles às configurações:

```json
{
  "skills": [
    "~/.claude/skills",
    "~/.codex/skills"
  ]
}
```

Para skills do Claude Code no nível de projeto, adicione em `.pi/settings.json`:

```json
{
  "skills": ["../.claude/skills"]
}
```

## Como as Skills Funcionam

1. Na inicialização, pi varre os locais de skills e extrai nomes e descrições
2. O prompt de sistema inclui as skills disponíveis em formato XML conforme a [especificação](https://agentskills.io/integrate-skills)
3. Quando uma tarefa corresponde, o agente usa `read` para carregar o SKILL.md completo (modelos nem sempre fazem isso; use prompting ou `/skill:name` para forçar)
4. O agente segue as instruções, usando caminhos relativos para referenciar scripts e assets

Isso é divulgação progressiva: apenas as descrições ficam sempre no contexto; as instruções completas são carregadas sob demanda.

## Comandos de Skill

Skills se registram como comandos `/skill:name`:

```bash
/skill:brave-search           # Carregar e executar a skill
/skill:pdf-tools extract      # Carregar skill com argumentos
```

Argumentos após o comando são adicionados ao conteúdo da skill como `User: <args>`.

Ative ou desative os comandos de skill via `/settings` no modo interativo ou em `settings.json`:

```json
{
  "enableSkillCommands": true
}
```

## Estrutura de uma Skill

Uma skill é um diretório com um arquivo `SKILL.md`. Todo o resto é livre.

```
my-skill/
├── SKILL.md              # Obrigatório: frontmatter + instruções
├── scripts/              # Scripts auxiliares
│   └── process.sh
├── references/           # Documentação detalhada carregada sob demanda
│   └── api-reference.md
└── assets/
    └── template.json
```

### Formato do SKILL.md

````markdown
---
name: my-skill
description: O que esta skill faz e quando utilizá-la. Seja específico.
---

# My Skill

## Setup

Execute uma vez antes do primeiro uso:
```bash
cd /path/to/skill && npm install
```

## Usage

```bash
./scripts/process.sh <input>
```
````

Use caminhos relativos a partir do diretório da skill:

```markdown
Veja [o guia de referência](references/REFERENCE.md) para detalhes.
```

## Frontmatter

Conforme a [especificação Agent Skills](https://agentskills.io/specification#frontmatter-required):

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| `name` | Sim | Máximo 64 caracteres. Letras minúsculas a-z, 0-9, hífens. Deve corresponder ao diretório pai. |
| `description` | Sim | Máximo 1024 caracteres. O que a skill faz e quando usá-la. |
| `license` | Não | Nome da licença ou referência ao arquivo incluído. |
| `compatibility` | Não | Máximo 500 caracteres. Requisitos de ambiente. |
| `metadata` | Não | Mapeamento arbitrário de chave-valor. |
| `allowed-tools` | Não | Lista de ferramentas pré-aprovadas separadas por espaço (experimental). |
| `disable-model-invocation` | Não | Quando `true`, a skill é ocultada do prompt de sistema. Os usuários devem usar `/skill:name`. |

### Regras de Nome

- 1-64 caracteres
- Apenas letras minúsculas, números e hífens
- Sem hífens no início ou no fim
- Sem hífens consecutivos
- Deve corresponder ao nome do diretório pai

Válidos: `pdf-processing`, `data-analysis`, `code-review`
Inválidos: `PDF-Processing`, `-pdf`, `pdf--processing`

### Boas Práticas para Descrição

A descrição determina quando o agente carrega a skill. Seja específico.

Boa:
```yaml
description: Extrai texto e tabelas de arquivos PDF, preenche formulários PDF e mescla múltiplos PDFs. Use ao trabalhar com documentos PDF.
```

Ruim:
```yaml
description: Ajuda com PDFs.
```

## Validação

Pi valida skills conforme o padrão Agent Skills. A maioria dos problemas gera avisos, mas a skill ainda é carregada:

- Nome não corresponde ao diretório pai
- Nome excede 64 caracteres ou contém caracteres inválidos
- Nome começa/termina com hífen ou possui hífens consecutivos
- Descrição excede 1024 caracteres

Campos de frontmatter desconhecidos são ignorados.

**Exceção:** Skills sem descrição não são carregadas.

Colisões de nome (mesmo nome de locais diferentes) geram aviso e mantêm a primeira skill encontrada.

## Exemplo

```
brave-search/
├── SKILL.md
├── search.js
└── content.js
```

**SKILL.md:**
````markdown
---
name: brave-search
description: Busca na web e extração de conteúdo via Brave Search API. Use para pesquisar documentação, fatos ou qualquer conteúdo da web.
---

# Brave Search

## Setup

```bash
cd /path/to/brave-search && npm install
```

## Search

```bash
./search.js "query"              # Busca básica
./search.js "query" --content    # Incluir conteúdo da página
```

## Extract Page Content

```bash
./content.js https://example.com
```
````

## Repositórios de Skills

- [Anthropic Skills](https://github.com/anthropics/skills) - Processamento de documentos (docx, pdf, pptx, xlsx), desenvolvimento web
- [Pi Skills](https://github.com/badlogic/pi-skills) - Busca na web, automação de navegador, APIs do Google, transcrição
