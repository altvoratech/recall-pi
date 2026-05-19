# Regras de Desenvolvimento

## Estilo de Comunicação

- Mantenha as respostas curtas e concisas
- Sem emojis em commits, issues, comentários de PR ou código
- Sem encheção de linguiça ou texto entusiasmado desnecessário
- Apenas prosa técnica, seja gentil mas direto (ex.: "Obrigado @user" e não "Muito obrigado @user!")

## Qualidade de Código

- Leia os arquivos por completo antes de fazer alterações abrangentes, antes de editar arquivos que você ainda não inspecionou completamente, e quando o usuário pedir para investigar ou auditar algo. Não confie apenas em trechos de busca para mudanças amplas.
- Sem tipos `any` a menos que absolutamente necessário
- Verifique node_modules para definições de tipos de APIs externas em vez de adivinhar
- **NUNCA use importações inline** - sem `await import("./foo.js")`, sem `import("pkg").Type` em posições de tipo, sem importações dinâmicas para tipos. Sempre use importações padrão no topo do arquivo.
- NUNCA remova ou rebaixe código para corrigir erros de tipos de dependências desatualizadas; atualize a dependência em vez disso
- Sempre pergunte antes de remover funcionalidade ou código que pareça intencional
- Não preserve compatibilidade retroativa a menos que o usuário peça explicitamente
- Nunca codifique verificações de teclas com, por exemplo, `matchesKey(keyData, "ctrl+x")`. Todos os atalhos de teclado devem ser configuráveis. Adicione o padrão ao objeto correspondente (`DEFAULT_EDITOR_KEYBINDINGS` ou `DEFAULT_APP_KEYBINDINGS`)
- NUNCA modifique `packages/ai/src/models.generated.ts` diretamente. Atualize `packages/ai/scripts/generate-models.ts` em vez disso.

## Comandos

- Após alterações de código (não alterações de documentação): `npm run check` (obtenha a saída completa, sem tail). Corrija todos os erros, avisos e informações antes de fazer o commit.
- Nota: `npm run check` não executa testes.
- NUNCA execute: `npm run dev`, `npm run build`, `npm test`
- Execute testes específicos apenas se o usuário instruir: `npx tsx ../../node_modules/vitest/dist/cli.js --run test/specific.test.ts`
- Execute os testes a partir da raiz do pacote, não da raiz do repositório.
- Se você criar ou modificar um arquivo de teste, DEVE executar esse arquivo de teste e iterar até que ele passe.
- Ao escrever testes, execute-os, identifique problemas no teste ou na implementação e itere até que estejam corrigidos.
- Para `packages/coding-agent/test/suite/`, use `test/suite/harness.ts` mais o provedor faux. Não use APIs de provedor reais, chaves de API reais ou tokens pagos.
- Coloque regressões específicas de issues em `packages/coding-agent/test/suite/regressions/` e nomeie-as `<numero-da-issue>-<slug-curto>.test.ts`.
- NUNCA faça commit a menos que o usuário peça

## Portão de Contribuição

- Novas issues de novos colaboradores são fechadas automaticamente por `.github/workflows/issue-gate.yml`
- Novos PRs de novos colaboradores sem direitos de PR são fechados automaticamente por `.github/workflows/pr-gate.yml`
- Comentários de aprovação dos mantenedores são tratados por `.github/workflows/approve-contributor.yml`
- Os mantenedores revisam issues fechadas automaticamente diariamente
- Issues que não atendem ao padrão de qualidade em `CONTRIBUTING.md` não são reabertas e não recebem resposta
- `lgtmi` aprova issues futuras
- `lgtm` aprova issues futuras e direitos de submeter PRs

Ao criar issues:

- Adicione labels `pkg:*` para indicar qual(is) pacote(s) a issue afeta
  - Labels disponíveis: `pkg:agent`, `pkg:ai`, `pkg:coding-agent`, `pkg:tui`, `pkg:web-ui`
- Se uma issue abrange múltiplos pacotes, adicione todos os labels relevantes

Ao postar comentários em issues/PRs:

- Escreva o comentário completo em um arquivo temporário e use `gh issue comment --body-file` ou `gh pr comment --body-file`
- Nunca passe markdown multilinha diretamente via `--body` em comandos shell
- Visualize o texto exato do comentário antes de postar
- Poste exatamente um comentário final, a menos que o usuário peça explicitamente por múltiplos comentários
- Se um comentário estiver mal formatado, exclua-o imediatamente e poste um comentário corrigido
- Mantenha os comentários concisos, técnicos e no tom do usuário

Ao fechar issues via commit:

- Inclua `fixes #<numero>` ou `closes #<numero>` na mensagem do commit
- Isso fecha automaticamente a issue quando o commit é mesclado

## Fluxo de Trabalho de PR

- Analise PRs sem puxar localmente primeiro
- Se o usuário aprovar: crie um branch de feature, puxe o PR, faça rebase no main, aplique ajustes, faça commit, mescle no main, push, feche o PR e deixe um comentário no tom do usuário
- Você nunca abre PRs por conta própria. Trabalhamos em branches de feature até que tudo esteja de acordo com os requisitos do usuário, então mesclamos no main e fazemos push.

## Testando o Modo Interativo do pi com tmux

Para testar o TUI do pi em um ambiente de terminal controlado:

```bash
# Criar sessão tmux com dimensões específicas
tmux new-session -d -s pi-test -x 80 -y 24

# Iniciar pi a partir do código-fonte
tmux send-keys -t pi-test "cd /Users/badlogic/workspaces/pi-mono && ./pi-test.sh" Enter

# Aguardar a inicialização e então capturar a saída
sleep 3 && tmux capture-pane -t pi-test -p

# Enviar entrada
tmux send-keys -t pi-test "seu prompt aqui" Enter

# Enviar teclas especiais
tmux send-keys -t pi-test Escape
tmux send-keys -t pi-test C-o  # ctrl+o

# Limpeza
tmux kill-session -t pi-test
```

## Changelog

Localização: `packages/*/CHANGELOG.md` (cada pacote tem o seu próprio)

### Formato

Use estas seções em `## [Unreleased]`:

- `### Breaking Changes` - Alterações de API que requerem migração
- `### Added` - Novas funcionalidades
- `### Changed` - Alterações em funcionalidades existentes
- `### Fixed` - Correções de bugs
- `### Removed` - Funcionalidades removidas

### Regras

- Antes de adicionar entradas, leia a seção `[Unreleased]` completa para ver quais subseções já existem
- Novas entradas SEMPRE vão na seção `## [Unreleased]`
- Acrescente às subseções existentes (ex.: `### Fixed`), não crie duplicatas
- NUNCA modifique seções de versões já lançadas (ex.: `## [0.12.2]`)
- Cada seção de versão é imutável após o lançamento

### Atribuição

- **Mudanças internas (de issues)**: `Fixed foo bar ([#123](https://github.com/earendil-works/pi-mono/issues/123))`
- **Contribuições externas**: `Added feature X ([#456](https://github.com/earendil-works/pi-mono/pull/456) by [@username](https://github.com/username))`

## Adicionando um Novo Provedor LLM (packages/ai)

Adicionar um novo provedor requer alterações em múltiplos arquivos:

### 1. Tipos Principais (`packages/ai/src/types.ts`)

- Adicione o identificador de API ao tipo union `Api` (ex.: `"bedrock-converse-stream"`)
- Crie uma interface de opções estendendo `StreamOptions`
- Adicione mapeamento a `ApiOptionsMap`
- Adicione o nome do provedor ao tipo union `KnownProvider`

### 2. Implementação do Provedor (`packages/ai/src/providers/`)

Crie um arquivo de provedor exportando:

- Função `stream<Provider>()` retornando `AssistantMessageEventStream`
- `streamSimple<Provider>()` para mapeamento de `SimpleStreamOptions`
- Interface de opções específica do provedor
- Funções de conversão de mensagem/ferramenta
- Análise de resposta emitindo eventos padronizados (`text`, `tool_call`, `thinking`, `usage`, `stop`)

### 3. Exportações do Provedor e Registro Lazy

- Adicione uma exportação de subcaminho de pacote em `packages/ai/package.json` apontando para `./dist/providers/<provider>.js`
- Adicione re-exportações de `export type` em `packages/ai/src/index.ts` para tipos de opções de provedor que devem permanecer disponíveis a partir da entrada raiz
- Registre o provedor em `packages/ai/src/providers/register-builtins.ts` via wrappers de carregamento lazy; não importe estaticamente módulos de implementação de provedor lá
- Adicione detecção de credenciais em `packages/ai/src/env-api-keys.ts`

### 4. Geração de Modelos (`packages/ai/scripts/generate-models.ts`)

- Adicione lógica para buscar/analisar modelos da fonte do provedor
- Mapeie para a interface `Model` padronizada

### 5. Testes (`packages/ai/test/`)

- Sempre adicione o provedor a `stream.test.ts` com pelo menos um modelo representativo, mesmo que reutilize uma implementação de API existente como `openai-completions`.
- Adicione o provedor à matriz de provedores mais ampla onde aplicável: `tokens.test.ts`, `abort.test.ts`, `empty.test.ts`, `context-overflow.test.ts`, `unicode-surrogate.test.ts`, `tool-call-without-result.test.ts`, `image-tool-result.test.ts`, `total-tokens.test.ts`, `cross-provider-handoff.test.ts`.
- Para `cross-provider-handoff.test.ts`, adicione pelo menos um par provedor/modelo. Se o provedor expõe múltiplas famílias de modelos (por exemplo GPT e Claude), adicione pelo menos um par por família.
- Para autenticação não padrão, crie um utilitário (ex.: `bedrock-utils.ts`) com detecção de credenciais.

### 6. Agente de Programação (`packages/coding-agent/`)

- `src/core/model-resolver.ts`: Adicione o ID do modelo padrão a `defaultModelPerProvider`
- `src/core/provider-display-names.ts`: Adicione o nome de exibição de login por chave de API para que `/login` e a UI relacionada mostrem o provedor para autenticação por chave de API integrada.
- `src/cli/args.ts`: Adicione documentação de variável de ambiente
- `README.md`: Adicione instruções de configuração do provedor
- `docs/providers.md`: Adicione instruções de configuração, variável de ambiente e chave `auth.json`

### 7. Documentação

- `packages/ai/README.md`: Adicione à tabela de provedores, documente opções/autenticação, adicione variáveis de ambiente
- `packages/ai/CHANGELOG.md`: Adicione entrada em `## [Unreleased]`

## Lançando Versões

**Versionamento lockstep**: Todos os pacotes sempre compartilham o mesmo número de versão. Todo lançamento atualiza todos os pacotes juntos.

**Semântica de versão** (sem lançamentos major):

- `patch`: Correções de bugs e novas funcionalidades
- `minor`: Alterações que quebram compatibilidade de API

### Etapas

1. **Atualize os CHANGELOGs**: Certifique-se de que todas as alterações desde o último lançamento estão documentadas na seção `[Unreleased]` do CHANGELOG.md de cada pacote afetado

2. **Execute o script de lançamento**:
   ```bash
   npm run release:patch    # Correções e adições
   npm run release:minor    # Alterações que quebram compatibilidade de API
   ```

O script cuida de: incremento de versão, finalização do CHANGELOG, commit, tag, publicação e adição de novas seções `[Unreleased]`.

## **CRÍTICO** Regras Git para Agentes em Paralelo **CRÍTICO**

Múltiplos agentes podem trabalhar em diferentes arquivos na mesma worktree simultaneamente. Você DEVE seguir estas regras:

### Fazendo Commit

- **Faça commit SOMENTE dos arquivos que VOCÊ alterou NESTA sessão**
- SEMPRE inclua `fixes #<numero>` ou `closes #<numero>` na mensagem do commit quando houver uma issue ou PR relacionado
- NUNCA use `git add -A` ou `git add .` - esses comandos incluem alterações de outros agentes
- SEMPRE use `git add <caminhos-de-arquivos-específicos>` listando apenas os arquivos que você modificou
- Antes de fazer commit, execute `git status` e verifique que você está apenas incluindo SEUS arquivos
- Acompanhe quais arquivos você criou/modificou/excluiu durante a sessão
- É sempre aceitável incluir `packages/ai/src/models.generated.ts` em um commit junto com os arquivos reais que você deseja commitar

### Operações Git Proibidas

Estes comandos podem destruir o trabalho de outros agentes:

- `git reset --hard` - destrói alterações não commitadas
- `git checkout .` - destrói alterações não commitadas
- `git clean -fd` - exclui arquivos não rastreados
- `git stash` - guarda TODAS as alterações incluindo o trabalho de outros agentes
- `git add -A` / `git add .` - inclui trabalho não commitado de outros agentes
- `git commit --no-verify` - ignora verificações obrigatórias e nunca é permitido

### Fluxo de Trabalho Seguro

```bash
# 1. Verificar o status primeiro
git status

# 2. Adicionar SOMENTE seus arquivos específicos
git add packages/ai/src/providers/transform-messages.ts
git add packages/ai/CHANGELOG.md

# 3. Commit
git commit -m "fix(ai): descrição"

# 4. Push (pull --rebase se necessário, mas NUNCA reset/checkout)
git pull --rebase && git push
```

### Se Ocorrerem Conflitos de Rebase

- Resolva conflitos APENAS em SEUS arquivos
- Se o conflito estiver em um arquivo que você não modificou, aborte e peça ao usuário
- NUNCA force push

### Substituição pelo Usuário

Se as instruções do usuário conflitarem com as regras aqui estabelecidas, peça confirmação de que ele deseja substituir as regras. Somente então execute as instruções.
