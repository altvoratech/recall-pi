> o pi pode ajudá-lo a criar pacotes pi. Peça para ele empacotar suas extensões, skills, templates de prompt ou temas.

# Pacotes Pi

Os pacotes pi agrupam extensões, skills, templates de prompt e temas para que você possa compartilhá-los via npm ou git. Um pacote pode declarar recursos em `package.json` sob a chave `pi`, ou usar diretórios convencionais.

## Índice

- [Instalar e Gerenciar](#install-and-manage)
- [Fontes de Pacotes](#package-sources)
- [Criando um Pacote Pi](#creating-a-pi-package)
- [Estrutura do Pacote](#package-structure)
- [Dependências](#dependencies)
- [Filtragem de Pacotes](#package-filtering)
- [Ativar e Desativar Recursos](#enable-and-disable-resources)
- [Escopo e Deduplicação](#scope-and-deduplication)

## Instalar e Gerenciar

> **Segurança:** Os pacotes pi executam com acesso total ao sistema. Extensões executam código arbitrário, e skills podem instruir o modelo a realizar qualquer ação, incluindo executar programas. Revise o código-fonte antes de instalar pacotes de terceiros.

```bash
pi install npm:@foo/bar@1.0.0
pi install git:github.com/user/repo@v1
pi install https://github.com/user/repo  # URLs brutas também funcionam
pi install /absolute/path/to/package
pi install ./relative/path/to/package

pi remove npm:@foo/bar
pi list                     # exibir pacotes instalados nas configurações
pi update                   # atualizar pi e todos os pacotes sem versão fixada
pi update --extensions      # atualizar apenas todos os pacotes sem versão fixada
pi update --self            # atualizar apenas o pi
pi update --self --force    # reinstalar o pi mesmo que esteja atualizado
pi update npm:@foo/bar      # atualizar um pacote
pi update --extension npm:@foo/bar
```

Por padrão, `install` e `remove` escrevem nas configurações globais (`~/.pi/agent/settings.json`). Use `-l` para escrever nas configurações do projeto (`.pi/settings.json`). As configurações do projeto podem ser compartilhadas com a equipe, e o pi instala automaticamente os pacotes ausentes na inicialização.

Para experimentar um pacote sem instalá-lo, use `--extension` ou `-e`. Isso instala em um diretório temporário apenas para a execução atual:

```bash
pi -e npm:@foo/bar
pi -e git:github.com/user/repo
```

## Fontes de Pacotes

O pi aceita três tipos de fonte nas configurações e em `pi install`.

### npm

```
npm:@scope/pkg@1.2.3
npm:pkg
```

- Especificações com versão são fixadas e ignoradas pelas atualizações de pacote (`pi update`, `pi update --extensions`).
- Instalações globais usam `npm install -g`.
- Instalações de projeto ficam em `.pi/npm/`.
- Defina `npmCommand` em `settings.json` para fixar as operações de busca e instalação de pacotes npm a um comando wrapper específico, como `mise` ou `asdf`.

Exemplo:

```json
{
  "npmCommand": ["mise", "exec", "node@20", "--", "npm"]
}
```

### git

```
git:github.com/user/repo@v1
git:git@github.com:user/repo@v1
https://github.com/user/repo@v1
ssh://git@github.com/user/repo@v1
```

- Sem o prefixo `git:`, apenas URLs de protocolo são aceitas (`https://`, `http://`, `ssh://`, `git://`).
- Com o prefixo `git:`, formatos abreviados são aceitos, incluindo `github.com/user/repo` e `git@github.com:user/repo`.
- URLs HTTPS e SSH são ambas suportadas.
- URLs SSH usam automaticamente suas chaves SSH configuradas (respeita `~/.ssh/config`).
- Para execuções não interativas (por exemplo, CI), você pode definir `GIT_TERMINAL_PROMPT=0` para desabilitar prompts de credenciais e definir `GIT_SSH_COMMAND` (por exemplo, `ssh -o BatchMode=yes -o ConnectTimeout=5`) para falhar rapidamente.
- Refs fixam o pacote e ignoram atualizações de pacote (`pi update`, `pi update --extensions`).
- Clonados em `~/.pi/agent/git/<host>/<path>` (global) ou `.pi/git/<host>/<path>` (projeto).
- Executa `npm install` após clonar ou atualizar se `package.json` existir.

**Exemplos SSH:**
```bash
# Formato abreviado git@host:path (requer prefixo git:)
pi install git:git@github.com:user/repo

# Formato de protocolo ssh://
pi install ssh://git@github.com/user/repo

# Com ref de versão
pi install git:git@github.com:user/repo@v1.0.0
```

### Caminhos Locais

```
/absolute/path/to/package
./relative/path/to/package
```

Caminhos locais apontam para arquivos ou diretórios no disco e são adicionados às configurações sem cópia. Caminhos relativos são resolvidos em relação ao arquivo de configurações em que aparecem. Se o caminho for um arquivo, é carregado como uma única extensão. Se for um diretório, o pi carrega os recursos usando as regras do pacote.

## Criando um Pacote Pi

Adicione um manifesto `pi` ao `package.json` ou use diretórios convencionais. Inclua a palavra-chave `pi-package` para facilitar a descoberta.

```json
{
  "name": "my-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

Os caminhos são relativos à raiz do pacote. Arrays suportam padrões glob e `!exclusions`.

### Metadados da Galeria

A [galeria de pacotes](https://pi.dev/packages) exibe pacotes marcados com `pi-package`. Adicione campos `video` ou `image` para mostrar uma prévia:

```json
{
  "name": "my-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "video": "https://example.com/demo.mp4",
    "image": "https://example.com/screenshot.png"
  }
}
```

- **video**: apenas MP4. No desktop, reprodução automática ao passar o mouse. Clicar abre um player em tela cheia.
- **image**: PNG, JPEG, GIF ou WebP. Exibido como prévia estática.

Se ambos estiverem definidos, o vídeo tem precedência.

## Estrutura do Pacote

### Diretórios Convencionais

Se nenhum manifesto `pi` estiver presente, o pi descobre automaticamente os recursos nestes diretórios:

- `extensions/` carrega arquivos `.ts` e `.js`
- `skills/` busca recursivamente pastas `SKILL.md` e carrega arquivos `.md` de nível superior como skills
- `prompts/` carrega arquivos `.md`
- `themes/` carrega arquivos `.json`

## Dependências

Dependências de runtime de terceiros pertencem a `dependencies` no `package.json`. Dependências que não registram extensões, skills, templates de prompt ou temas também pertencem em `dependencies`. Quando o pi instala um pacote do npm ou git, executa `npm install`, então essas dependências são instaladas automaticamente.

O pi agrupa pacotes principais para extensões e skills. Se você importar qualquer um deles, liste-os em `peerDependencies` com um intervalo `"*"` e não os agrupe: `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `typebox`.

Outros pacotes pi devem ser agrupados no seu tarball. Adicione-os a `dependencies` e `bundledDependencies`, e referencie seus recursos por caminhos `node_modules/`. O pi carrega pacotes com raízes de módulo separadas, então instalações separadas não colidem nem compartilham módulos.

Exemplo:

```json
{
  "dependencies": {
    "shitty-extensions": "^1.0.1"
  },
  "bundledDependencies": ["shitty-extensions"],
  "pi": {
    "extensions": ["extensions", "node_modules/shitty-extensions/extensions"],
    "skills": ["skills", "node_modules/shitty-extensions/skills"]
  }
}
```

## Filtragem de Pacotes

Filtre o que um pacote carrega usando a forma de objeto nas configurações:

```json
{
  "packages": [
    "npm:simple-pkg",
    {
      "source": "npm:my-package",
      "extensions": ["extensions/*.ts", "!extensions/legacy.ts"],
      "skills": [],
      "prompts": ["prompts/review.md"],
      "themes": ["+themes/legacy.json"]
    }
  ]
}
```

`+path` e `-path` são caminhos exatos relativos à raiz do pacote.

- Omita uma chave para carregar todos os itens daquele tipo.
- Use `[]` para não carregar nenhum item daquele tipo.
- `!pattern` exclui correspondências.
- `+path` força a inclusão de um caminho exato.
- `-path` força a exclusão de um caminho exato.
- Os filtros se aplicam sobre o manifesto. Eles restringem o que já está permitido.

## Ativar e Desativar Recursos

Use `pi config` para ativar ou desativar extensões, skills, templates de prompt e temas de pacotes instalados e diretórios locais. Funciona tanto para o escopo global (`~/.pi/agent`) quanto para o escopo do projeto (`.pi/`).

## Escopo e Deduplicação

Pacotes podem aparecer tanto nas configurações globais quanto nas do projeto. Se o mesmo pacote aparecer em ambas, a entrada do projeto prevalece. A identidade é determinada por:

- npm: nome do pacote
- git: URL do repositório sem ref
- local: caminho absoluto resolvido
