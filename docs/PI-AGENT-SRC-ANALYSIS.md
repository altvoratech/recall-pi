# Análise do `packages/agent/src` do clone do Pi

Origem analisada:
- `C:\Users\genildo.souza\Documents\clone pi\pi\packages\agent\src`

Objetivo desta análise:
- mapear loop de agent, harness, sessão, compaction, classe `Agent`, hooks e superfícies reaproveitáveis
- avaliar viabilidade de extensão por herança/prototype no contexto do `recall-pi`
- identificar oportunidades concretas para robustecer o `recall-pi`

---

## Veredito executivo

O código se organiza em **duas camadas principais**:

1. **`Agent`** — loop stateful de baixo nível
2. **`AgentHarness`** — camada de alto nível com sessão, compaction, árvore de navegação, skills, prompt templates, hooks e environment

### Conclusão principal

Para o `recall-pi`, o ativo mais valioso aqui **não é herdar de `Agent`**, e sim absorver o **modelo do `AgentHarness`**:
- eventos explícitos
- hooks estruturados
- filas formais
- sessão em árvore
- compaction robusta
- branch summarization
- abstração de environment

A arquitetura favorece **composição e hooks**, não herança profunda.

---

## Mapa do diretório

### Arquivos-raiz
- `agent.ts`
- `agent-loop.ts`
- `types.ts`
- `index.ts`
- `node.ts`
- `proxy.ts`

### `harness/`
- `harness/agent-harness.ts`
- `harness/types.ts`
- `harness/messages.ts`
- `harness/system-prompt.ts`
- `harness/skills.ts`
- `harness/prompt-templates.ts`

### Compaction
- `harness/compaction/compaction.ts`
- `harness/compaction/branch-summarization.ts`
- `harness/compaction/utils.ts`

### Session
- `harness/session/session.ts`
- `harness/session/jsonl-storage.ts`
- `harness/session/jsonl-repo.ts`
- `harness/session/memory-storage.ts`
- `harness/session/memory-repo.ts`
- `harness/session/repo-utils.ts`
- `harness/session/uuid.ts`

### Environment
- `harness/env/nodejs.ts`

---

## 1) `agent-loop.ts` — motor do loop

Responsável pelo ciclo principal do agente:
- `agent_start`
- `turn_start`
- `message_start`
- `message_update`
- `message_end`
- `tool_execution_start`
- `tool_execution_update`
- `tool_execution_end`
- `turn_end`
- `agent_end`

### Capacidades importantes
- streaming parcial de resposta
- tools em modo:
  - `parallel`
  - `sequential`
- hooks de tool:
  - `beforeToolCall`
  - `afterToolCall`
- hooks de contexto e continuidade:
  - `prepareNextTurn`
  - `getSteeringMessages`
  - `getFollowUpMessages`
  - `transformContext`
  - `convertToLlm`

### Observação importante
O loop já tem uma semântica muito boa de filas:
- **steering** → injeta mensagens no meio do run, após o turn atual
- **follow-up** → roda quando o agente pararia

Isso é altamente relevante para o futuro do `recall-pi`.

---

## 2) `agent.ts` — wrapper stateful do loop

A classe `Agent` encapsula:
- transcript atual
- tools
- model
- thinking level
- filas de steering/follow-up
- listeners
- abort signal
- estado de streaming

### APIs públicas observadas
- `prompt(...)`
- `continue()`
- `steer(...)`
- `followUp(...)`
- `abort()`
- `waitForIdle()`
- `reset()`
- `subscribe(...)`

### Papel arquitetural
`Agent` é um wrapper stateful relativamente enxuto sobre o loop.

### Onde ele é útil
- testes
- execuções simples
- uso embarcado sem árvore de sessão
- cenários com pouca infraestrutura

### Limitação
Ele não resolve sozinho:
- sessão persistente robusta
- árvore de branches
- compaction formal persistida
- skills/prompt templates
- branch summaries

---

## 3) `AgentHarness` — peça mais valiosa

Arquivo principal:
- `harness/agent-harness.ts`

O `AgentHarness` integra:
- loop do agent
- sessão persistente
- compaction
- branch summarization
- skills
- prompt templates
- hooks de provider
- hooks de tool
- filas de steering/follow-up/nextTurn
- abort
- stream options

### APIs públicas relevantes
- `prompt(...)`
- `skill(...)`
- `promptFromTemplate(...)`
- `steer(...)`
- `followUp(...)`
- `nextTurn(...)`
- `appendMessage(...)`
- `compact(...)`
- `navigateTree(...)`
- `setModel(...)`
- `setThinkingLevel(...)`
- `setResources(...)`
- `setStreamOptions(...)`
- `setTools(...)`
- `setActiveTools(...)`
- `abort()`
- `waitForIdle()`
- `subscribe(...)`
- `on(...)`

### Fases internas
`AgentHarnessPhase`:
- `idle`
- `turn`
- `compaction`
- `branch_summary`
- `retry`

---

## 4) Sistema de hooks do harness

Definido principalmente em:
- `harness/types.ts`

### Hooks/eventos próprios mais importantes
- `before_agent_start`
- `context`
- `before_provider_request`
- `before_provider_payload`
- `after_provider_response`
- `tool_call`
- `tool_result`
- `session_before_compact`
- `session_compact`
- `session_before_tree`
- `session_tree`
- `model_select`
- `thinking_level_select`
- `resources_update`
- `queue_update`
- `save_point`
- `abort`
- `settled`

### Por que isso importa para o `recall-pi`
Esse conjunto parece um mini-framework de orquestração. Ele sugere um desenho futuro muito melhor que extensões ad-hoc.

Exemplos diretos de uso futuro:
- recall context no hook `context`
- tracing por request em `before_provider_request` / `after_provider_response`
- governança de tool em `tool_call` / `tool_result`
- persistência/observabilidade em `save_point` / `settled`
- integração de compaction + snapshot + recall em `session_compact`

---

## 5) Sessão em árvore

Arquivos principais:
- `harness/session/session.ts`
- `harness/session/jsonl-storage.ts`
- `harness/session/jsonl-repo.ts`

### Tipos de entry observados
- `message`
- `thinking_level_change`
- `model_change`
- `compaction`
- `branch_summary`
- `custom`
- `custom_message`
- `label`
- `session_info`
- `leaf`

### O que isso habilita
- histórico não linear
- forks reais
- mudança de leaf ativa
- branch summaries ao navegar
- estado persistido e reconstruível

### Relevância para o `recall-pi`
Isso abre portas para:
- memória por branch
- retomada de investigações
- trilhas paralelas de trabalho
- sessões mais parecidas com “workspace state” do que simples chat linear

---

## 6) Compaction robusta

Arquivo principal:
- `harness/compaction/compaction.ts`

### Capacidades observadas
- estimate de tokens
- cut point com retenção de contexto recente
- previous summary cumulativo
- tratamento de split turn
- extração de file ops
- details persistidos na compaction

### Estruturas relevantes
- `prepareCompaction(...)`
- `generateSummary(...)`
- `compact(...)`
- `shouldCompact(...)`
- `estimateContextTokens(...)`
- `findCutPoint(...)`

### Split turn
O código trata explicitamente o caso onde o corte cai no meio de um turn:
- `messagesToSummarize`
- `turnPrefixMessages`
- `isSplitTurn`

Isso é um sinal de maturidade arquitetural importante.

### Relevância para o `recall-pi`
Vale absorver pelo menos as ideias de:
- compaction incremental/cumulativa
- summary com previous summary
- file op details
- separação entre histórico antigo e prefixo de turn

---

## 7) Branch summarization

Arquivo principal:
- `harness/compaction/branch-summarization.ts`

### Símbolos importantes
- `collectEntriesForBranchSummary(...)`
- `prepareBranchEntries(...)`
- `generateBranchSummary(...)`

### O que resolve
Quando o usuário sai de um branch e volta para outro, o sistema consegue gerar um resumo do branch abandonado.

### Potencial para `recall-pi`
Isso é extremamente promissor se futuramente houver:
- explorações paralelas por subagentes
- retorno contextual entre runs
- memória de trilhas alternativas

---

## 8) Skills e prompt templates

Arquivos:
- `harness/skills.ts`
- `harness/prompt-templates.ts`

### Destaques
- `loadSkills(...)`
- `loadSourcedSkills(...)`
- `loadPromptTemplates(...)`
- `loadSourcedPromptTemplates(...)`

### Qualidades observadas
- suporte a proveniência/source
- diagnósticos estruturados
- parsing de frontmatter
- suporte a ignore files
- resolução correta de skills via `SKILL.md`

### Relevância para o `recall-pi`
Pode melhorar a robustez e a rastreabilidade das skills project-local/global.

---

## 9) `ExecutionEnv`

Arquivos:
- `harness/types.ts`
- `harness/env/nodejs.ts`

### O que abstrai
- filesystem
- cwd
- shell
- exec
- timeout
- abort
- stdout/stderr streaming

### Benefícios
- desacoplamento da plataforma
- erros tipados (`timeout`, `aborted`, etc.)
- possibilidade de execução mais controlada

### Relevância para o `recall-pi`
Muito útil para formalizar melhor:
- bash tooling
- permission-gate
- timeouts
- erro operacional padronizado

---

## 10) `proxy.ts`

Arquivo:
- `proxy.ts`

### O que faz
- implementa `streamProxy(...)`
- permite rotear LLM calls via servidor intermediário
- reconstitui streaming do lado cliente

### Valor estratégico
Se o `recall-pi` evoluir para:
- gateway próprio
- auth centralizada
- auditoria/telemetria de provider
- replay/debug remoto

esse arquivo serve como molde conceitual.

---

## 11) Herança e prototype extension

## Dá para herdar?
Sim, tecnicamente dá.

As classes usam `private` do TypeScript, não `#private` do JavaScript. Em runtime isso significa que:
- é possível subclassar
- é possível monkey-patchar prototype

## Mas devo usar isso como estratégia principal?
**Não recomendo.**

### Motivos
1. O design favorece composição e hooks
2. Métodos críticos estão encapsulados em métodos privados
3. Não há uma superfície `protected` pensada para subclasses
4. Monkey patch tende a quebrar silenciosamente em upgrades upstream

---

## 12) Onde herança seria menos ruim

### `Agent`
Possíveis overrides superficiais:
- `prompt`
- `continue`
- `abort`

Serve para wrappers leves e observabilidade.

### `AgentHarness`
Possíveis overrides superficiais:
- `prompt`
- `compact`
- `navigateTree`
- `abort`
- `setModel`

Mesmo assim, o coração do comportamento está em métodos internos privados. O ganho é limitado.

---

## 13) Onde monkey patch é especialmente arriscado

Evitar mexer por prototype em:
- `Agent.prototype.processEvents`
- `Agent.prototype.runWithLifecycle`
- `AgentHarness.prototype.createLoopConfig`
- `AgentHarness.prototype.handleAgentEvent`
- `AgentHarness.prototype.createTurnState`
- `AgentHarness.prototype.emitHook`
- `AgentHarness.prototype.flushPendingSessionWrites`

Se a necessidade chegar nesse nível, melhor:
- composição
- wrapper explícito
- adaptação arquitetural
- ou fork consciente

---

## 14) Gap conceitual com o `recall-pi`

Hoje o `recall-pi` está forte como:
- pack de extensões
- subagentes
- tracing
- guard rails
- integração recall MCP

O código do clone mostra um caminho para subir de nível em robustez com:
- estado explícito
- filas explícitas
- eventos explícitos
- compaction formal
- árvore de sessão
- branch navigation
- hooks de provider e tool bem definidos

---

## 15) O que eu portaria/adaptaria primeiro para o `recall-pi`

### Prioridade alta
1. taxonomia de eventos do harness
   - `queue_update`
   - `save_point`
   - `settled`
   - `abort`

2. semântica formal de filas
   - steering
   - follow-up
   - nextTurn

3. hooks de provider
   - `before_provider_request`
   - `after_provider_response`

4. modelo de compaction
   - split turn
   - previous summary
   - file op details

5. skills com provenance/source

### Prioridade média
6. session tree
7. branch summarization
8. `ExecutionEnv`
9. `streamProxy`

---

## 16) Recomendação final

### Não fazer como base principal
- herança agressiva de `Agent`
- monkey patch estrutural do prototype

### Fazer
- usar composição
- portar padrões do `AgentHarness`
- alinhar o `recall-pi` para um modelo mais explícito de runtime/harness

---

## Conclusão

O diretório `packages/agent/src` mostra que o Pi já possui um desenho bem mais maduro do que um simples loop de chat com tools. A melhor oportunidade para o `recall-pi` está em:
- absorver o desenho do harness
- reaproveitar as ideias de sessão/compaction/branching
- evoluir gradualmente de “pack de extensões” para “runtime mais estruturado”

Se for preciso escolher um ponto central desta análise, ele é:

> **o futuro robusto do `recall-pi` parece muito mais com adaptação do modelo de `AgentHarness` do que com extensão por herança da classe `Agent`.**
