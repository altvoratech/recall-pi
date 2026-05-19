# Ciclo de Vida do AgentHarness

`AgentHarness` é a camada de orquestração acima do `Agent` de baixo nível. Ele gerencia persistência de sessão, configuração de runtime, resolução de recursos, bloqueio de operações e semântica de mutação voltada para extensões.

Este documento descreve a direção atual e o comportamento implementado. Alguns detalhes de extensão/fachada de sessão são planejados e explicitamente mencionados.

## Objetivo final do ciclo de vida

Listeners e hooks do harness devem ser capazes de fechar sobre a instância `AgentHarness` e chamar APIs públicas do harness a partir de qualquer evento onde essas APIs estejam documentadas como permitidas. Essas chamadas não devem corromper snapshots de turno em andamento, reordenar entradas de transcrição persistidas, perder escritas pendentes, criar deadlock no settlement, ou deixar o harness na fase errada.

A regra pretendida é:

- operações estruturais permanecem rejeitadas enquanto ocupado
- operações de fila são aceitas em pontos documentados seguros para turnos
- setters de configuração de runtime atualizam snapshots futuros sem mutar a requisição atual do provedor
- escritas de sessão feitas enquanto ocupado são enfileiradas duravelmente e liberadas em ordem determinística
- getters retornam a configuração mais recente do harness, não snapshots em andamento

Uma passagem final de endurecimento do ciclo de vida deve provar essas garantias com um amplo conjunto de testes de reentrada de listeners/hooks.

## Modelo de estado

O harness separa o estado em quatro categorias.

### Configuração do harness

A configuração do harness é a configuração de runtime mais recente definida pela aplicação ou extensões:

- modelo
- nível de raciocínio
- ferramentas
- nomes de ferramentas ativas
- recursos
- opções de stream
- prompt de sistema ou provedor de prompt de sistema

Getters retornam a configuração do harness. Eles não retornam o snapshot usado por uma requisição de provedor em andamento.

Setters atualizam a configuração do harness imediatamente, inclusive durante um turno em andamento. As alterações afetam o próximo snapshot de turno, não a requisição atual do provedor em execução.

`setResources()` aceita recursos concretos e emite `resources_update` em cada chamada com recursos atuais e anteriores copiados superficialmente. As aplicações são responsáveis por carregar/recarregar recursos do disco ou outras fontes e devem chamar `setResources()` com novos valores.

`getResources()` retorna recursos atuais copiados superficialmente. É uma leitura ao vivo de configuração, não o último snapshot de turno.

### Snapshot de turno

Um snapshot de turno é o estado concreto usado para um turno LLM. Ele é criado por `createTurnState()` e contém:

- mensagens de sessão persistidas
- recursos resolvidos
- prompt de sistema resolvido
- modelo
- nível de raciocínio
- todas as ferramentas
- ferramentas ativas
- opções de stream
- id de sessão derivado

Valores de opções estáticas são usados diretamente. Callbacks de provedor de prompt de sistema são invocados uma vez por chamada de `createTurnState()`. Toda a lógica para aquele turno usa o mesmo snapshot.

Arrays de recursos são copiados superficialmente quando um snapshot é criado. Objetos individuais de skill e template de prompt não são copiados profundamente.

Opções de stream são copiadas superficialmente quando um snapshot é criado. Mapas de `headers` e `metadata` são copiados superficialmente; seus valores não são copiados profundamente. Credenciais de `getApiKeyAndHeaders()` são resolvidas por requisição de provedor para que tokens expirados possam ser renovados, mas as opções de stream configuradas e o id de sessão derivado vêm do snapshot de turno atual.

### Sessão

A sessão contém apenas entradas persistidas. Leituras de sessão retornam estado persistido e não incluem escritas enfileiradas.

### Escritas de sessão pendentes

Escritas de sessão solicitadas enquanto uma operação está ativa são enfileiradas como escritas de sessão pendentes. Escritas pendentes são baseadas em formatos de entrada de sessão sem campos gerados (`id`, `parentId`, `timestamp`).

Escritas de sessão pendentes são sempre persistidas. Elas são liberadas em pontos de salvamento, no settlement de operação e na limpeza de falha.

Uma API pública de escritas pendentes/fachada de sessão está planejada mas ainda não implementada.

## Fases de operação

O harness tem uma fase explícita:

```ts
type AgentHarnessPhase = "idle" | "turn" | "compaction" | "branch_summary" | "retry";
```

Operações estruturais requerem `phase === "idle"` e definem a fase sincronamente antes do primeiro `await`:

- `prompt`
- `skill`
- `promptFromTemplate`
- `compact`
- `navigateTree`

Iniciar outra operação estrutural enquanto o harness não está ocioso lança uma exceção.

As seguintes operações são permitidas durante um turno onde apropriado:

- `steer`
- `followUp`
- `nextTurn`
- `abort`
- setters de configuração de runtime

A semântica de fase/settlement ainda é provisória e precisa de uma passagem completa do ciclo de vida.

## Execução de turno

`prompt`, `skill` e `promptFromTemplate` seguem o mesmo fluxo:

1. Asserta ocioso e define a fase como `"turn"`.
2. Cria um snapshot de turno com `createTurnState()`.
3. Deriva o texto de invocação desse snapshot.
4. Executa o turno com `executeTurn()`.

`skill` e `promptFromTemplate` resolvem seu recurso a partir do mesmo snapshot passado para o turno. Eles não resolvem recursos separadamente.

`steer`, `followUp` e `nextTurn` aceitam texto mais imagens opcionais e criam mensagens de usuário internamente. Mensagens de `nextTurn` são inseridas antes da nova mensagem do usuário no próximo turno iniciado pelo usuário.

Os modos de fila são ao vivo, não instantâneos por turno:

- `steeringMode`
- `followUpMode`

Alterar um modo de fila durante uma execução afeta a próxima drenagem da fila. As drenagens de fila acontecem em pontos seguros.

## Pontos de salvamento

Um ponto de salvamento ocorre após um turno do assistente e suas mensagens de resultado de ferramenta terem sido concluídas.

Em um ponto de salvamento, o harness:

1. libera escritas de sessão pendentes após as mensagens emitidas pelo agente para aquele turno
2. cria um novo snapshot de turno se o loop de baixo nível puder continuar
3. aplica o novo estado de contexto/modelo/nível-de-raciocínio/opções-de-stream/id-de-sessão antes da próxima requisição do provedor

Isso permite que alterações de modelo, nível de raciocínio, ferramenta, recurso, opção de stream e prompt de sistema feitas durante um turno afetem o próximo turno na mesma execução, sem nunca mutar uma requisição de provedor em andamento. Os callbacks do loop não são recriados nos pontos de salvamento.

O loop de baixo nível converte o `ThinkingLevel` do harness para `reasoning` do provedor no limite do provedor:

- `"off"` -> `undefined`
- todos os outros níveis de raciocínio passam diretamente

Nenhuma atualização de estado é necessária em `agent_end`, exceto liberar escritas de sessão pendentes restantes e limpar a fase de operação. O timing exato do evento `settled` ainda está em revisão.

Se o callback do prompt de sistema lançar uma exceção ao iniciar `prompt`, `skill` ou `promptFromTemplate`, a operação lança e o harness retorna ao estado ocioso. Se lançar a partir do snapshot do ponto de salvamento criado por `prepareNextTurn`, o agente de baixo nível registra uma mensagem de erro do assistente.

## Hooks e eventos

Os hooks atuais recebem apenas o payload do evento. Ainda não há objeto de contexto de extensão.

Payloads de eventos descrevem o que está acontecendo. Getters do harness descrevem a configuração mais recente para snapshots futuros.

A divisão entre eventos específicos do harness (`AgentHarnessOwnEvent`) e a união de eventos de baixo nível mais eventos do harness (`AgentHarnessEvent`) é provisória, mas útil para distinguir eventos hookáveis do harness de eventos de assinatura pública.

Um futuro contexto de extensão pode expor o harness e uma fachada de sessão com escritas enfileiradas.

## Fachada de sessão planejada

As extensões devem eventualmente interagir com uma fachada de sessão com escopo no harness em vez da sessão bruta.

Semântica de leitura planejada:

- leituras delegam para o estado de sessão persistido
- leituras não incluem escritas pendentes enfileiradas

Semântica de escrita planejada:

- ocioso: persiste imediatamente
- ocupado: enfileira como escritas de sessão pendentes

Uma API de diagnósticos planejada pode expor escritas pendentes explicitamente:

```ts
getPendingWrites(): readonly PendingSessionWrite[]
```

Mensagens emitidas pelo agente são persistidas em `message_end` para preservar a ordem da transcrição. Escritas pendentes de extensão/sessão são liberadas após essas mensagens nos pontos de salvamento.

## Abort

O abort é permitido durante um turno. Ele aborta a execução de baixo nível e limpa as filas de steering/follow-up de baixo nível.

O abort não descarta escritas de sessão pendentes. Escritas pendentes são liberadas no próximo ponto de salvamento se atingido, em `agent_end`, ou na limpeza de falha de operação.

A semântica de barreira de abort ainda precisa de uma auditoria.

## Compactação e navegação em árvore

Compactação e navegação em árvore são mutações estruturais de sessão.

Elas são permitidas apenas enquanto ociosas e não são enfileiradas. Elas operam no estado de sessão persistido. O próximo prompt cria um novo snapshot de turno.

A geração de resumo de branch é parte da operação de navegação em árvore.

Auto-compactação e pontos de decisão de retry ainda não estão implementados em `AgentHarness`.

## Organização dos testes

Os testes do harness devem permanecer focados por área em vez de crescer em um único arquivo genérico.

Estrutura atual:

- `packages/agent/test/harness/agent-harness.test.ts`: testes básicos de construção/API.
- `packages/agent/test/harness/agent-harness-stream.test.ts`: semântica de opções de stream e hook de provedor.

Estrutura futura preferida:

- `agent-harness-resources.test.ts`: semântica de snapshot/carregamento de recursos.
- `agent-harness-tools.test.ts`: getters de registro de ferramentas, semântica de ferramentas ativas e eventos de atualização.
- `agent-harness-lifecycle.test.ts`: comportamento de fase/ponto-de-salvamento/settled/reentrada.

Use o provedor faux do `pi-ai` (`registerFauxProvider`, `fauxAssistantMessage`) para testes determinísticos de harness/provedor. Fábricas de resposta faux podem inspecionar `StreamOptions`, invocar `options.onPayload` e retornar mensagens de assistente programadas sem APIs de provedor reais ou acesso à rede.

## Todo de implementação

Esta lista acompanha o trabalho restante antes de tratar `AgentHarness` como pronto para migração.

### 1. Remover dependência do `Agent` do `AgentHarness`

Nova prioridade máxima.

`AgentHarness` provavelmente deve chamar `agentLoop` / `agentLoopContinue` diretamente em vez de possuir uma instância interna de `Agent`. O harness já possui persistência de sessão, snapshots de configuração de runtime, filas, configuração de stream do provedor, hooks/eventos, semântica de fase e semântica de abort. Manter `Agent` no meio cria estado duplicado e camadas de adaptador.

Ainda necessário:

- Substituir `new Agent(...)` interno por chamadas diretas ao loop de baixo nível.
- Mover o ciclo de vida de execução ativa/abort-controller para `AgentHarness`.
- Mover a drenagem de fila apenas para `AgentHarness`, removendo filas duplicadas do `Agent` de baixo nível.
- Reduzir o estado `AgentEvent` de baixo nível diretamente no harness onde necessário.
- Preservar comportamento público atual para `prompt`, `skill`, `promptFromTemplate`, `steer`, `followUp`, `nextTurn`, `abort` e `waitForIdle`.
- Preservar comportamento de hook de provedor implementado pelo wrapper de stream do harness.
- Preservar semântica de atualização de snapshot de ponto de salvamento sem efeitos colaterais através de `Agent.prepareNextTurn`.
- Decidir se `AgentHarness.agent` permanece temporariamente por compatibilidade ou é removido antes da migração.
- Adicionar testes cobrindo paridade com o comportamento atual do harness antes e depois da refatoração.

### 2. Finalizar configuração curada de provedor/stream

Implementado até agora:

- `AgentHarnessOptions.streamOptions` fornece configuração de requisição curada.
- `getStreamOptions()` retorna uma cópia superficial da configuração atual do harness.
- `setStreamOptions()` substitui a configuração atual do harness.
- Opções de stream são instantâneas em `createTurnState()` e aplicadas com `applyTurnState()`.
- Mapas de `headers` e `metadata` são copiados superficialmente quando as opções de stream são copiadas.
- `sessionId` é derivado de `session.getMetadata().id` no snapshot de turno.
- O harness instala seu próprio wrapper de stream interno e chama `streamSimple()`.
- O wrapper ignora as opções brutas de provedor recebidas, exceto campos de ciclo de vida que devem vir do loop de baixo nível: `signal` e `reasoning`.
- Credenciais e cabeçalhos de autenticação de `getApiKeyAndHeaders()` são resolvidos por requisição de provedor.

Comportamento de hook de provedor implementado:

- `before_provider_request` executa antes de `streamSimple()` e pode corrigir opções de stream curadas apenas para a requisição atual.
- `before_provider_payload` mapeia para o `onPayload` subjacente do `pi-ai` e pode inspecionar/substituir payloads específicos do provedor.
- `after_provider_response` mapeia para o `onResponse` subjacente do `pi-ai` e observa status/cabeçalhos de resposta antes do consumo do corpo.
- `AgentHarnessStreamOptionsPatch` tem semântica de exclusão explícita:
  - campos de nível superior presentes com `undefined` limpam essa opção.
  - patches de `headers` e `metadata` podem definir chaves individuais como `undefined` para excluí-las.
  - `headers: undefined` ou `metadata: undefined`, quando explicitamente presentes, limpa todo o mapa.
- A ordem de mesclagem de opções de stream da requisição atual é:
  1. `streamOptions` instantâneas
  2. cabeçalhos de autenticação de `getApiKeyAndHeaders()`
  3. patches de `before_provider_request`, na ordem de registro dos hooks
- `before_provider_request` não corrige `reasoning`; adicione isso apenas se um caso de uso concreto aparecer.

Validação implementada:

- `packages/agent/test/harness/agent-harness-stream.test.ts` usa o provedor faux do `pi-ai`.
- Os testes cobrem encaminhamento de opções de stream, mesclagem de cabeçalhos de autenticação, correção de hook de requisição, semântica de exclusão de hook de requisição, encadeamento de hook de requisição, encadeamento de hook de payload e comportamento de snapshot ocupado/ponto-de-salvamento.

### 3. Projetar registro de modelos por `AgentHarness`

Não iniciado.

Ainda necessário:

- Decidir como as aplicações fornecem o registro de modelos.
- Decidir se o harness armazena objetos `Model` concretos, referências de modelos ou ambos.
- Validar a seleção de modelos contra o registro.
- Definir semântica de mudança de modelo durante turnos ativos e pontos de salvamento.
- Preservar o comportamento atual de `setModel()` até que o modelo de registro seja projetado.

### 4. Projetar mecanismo genérico de extensão de hook/evento

Limpeza atual já feita:

- Removido `AgentHarnessContext`.
- Hooks recebem apenas payloads de eventos.
- `emitHook(event)` deriva o tipo de hook de `event.type`.

Ainda necessário:

- Definir o formato do contexto de extensão.
- Provavelmente expor uma fachada do harness mais uma fachada de sessão em vez de internos brutos.
- Decidir quais APIs públicas do harness são permitidas de cada hook/evento.
- Decidir se os hooks podem mutar snapshots de turno diretamente ou apenas através de resultados de hook explícitos/APIs públicas.
- Esclarecer semântica de payload de evento versus semântica de getter do harness.
- Revisar `AgentHarnessOwnEvent` versus `AgentHarnessEvent`.
- Definir encadeamento de resultado de hook onde tem semântica de transformação limpa:
  - `before_provider_request`: cada hook recebe as opções de stream produzidas pelos hooks anteriores.
  - `before_provider_payload`: cada hook recebe o payload produzido pelos hooks anteriores.
  - possivelmente `context`: cada hook recebe as mensagens produzidas pelos hooks anteriores.
  - possivelmente `tool_result`: cada hook recebe os campos de resultado produzidos pelos hooks anteriores.
- Não encadear hooks onde a semântica é baseada em política ou ambígua até que seja explicitamente projetada, como `tool_call`, `session_before_compact`, `session_before_tree` e `before_agent_start`.

### 5. Adicionar semântica explícita de leitura/atualização do registro de ferramentas

Implementado até agora:

- `setTools(tools, activeToolNames?)`
- `setActiveTools(toolNames)`
- nomes de ferramentas ativas inválidos lançam exceção
- formato de ferramenta de aplicação comum genérico via `AgentHarness<TSkill, TPromptTemplate, TTool>`
- `QueueMode` exportado de `Agent`
- `AgentHarnessOptions.steeringMode` / `followUpMode`
- getters/setters ao vivo de `steeringMode` / `followUpMode`
- os modos de fila são imediatos/ao vivo, correspondendo ao comportamento do coding-agent

Ainda necessário:

- Adicionar semântica de `getTools()`.
- Adicionar semântica de `getActiveTools()`.
- Decidir e implementar eventos de observabilidade de atualização de ferramentas.
- Incluir atualizações apenas de ferramentas ativas no plano de observabilidade de configuração de runtime uniforme.

### 6. Passagem completa de ciclo de vida/estado do `AgentHarness`

Implementado até agora:

- Removido `void syncFromTree()` do construtor.
- Removido `syncFromTree()`.
- Adicionado `createTurnState()`, `applyTurnState()` e `executeTurn()`.
- Existe `AgentLoopConfig.prepareNextTurn` para atualização de ponto de salvamento de baixo nível.
- `prepareNextTurn` atualiza contexto/modelo/nível-de-raciocínio de baixo nível e o estado de snapshot de stream/sessão aplicado pelo harness.
- O loop converte `ThinkingLevel` para `reasoning` do provedor internamente.
- `phase` substitui o booleano ocioso.
- Escritas de sessão pendentes são baseadas em formatos de entrada de sessão sem campos gerados.
- Escritas de sessão pendentes são liberadas nos pontos de salvamento, no settlement e na limpeza de falha.
- `steer`, `followUp` e `nextTurn` aceitam texto mais imagens opcionais e criam `UserMessage` internamente.
- A ordenação de `nextTurn` está corrigida: mensagens enfileiradas antes da nova mensagem do usuário.
- Removido `liveOperationId`.
- Removido `shell()`; use `harness.env`.

Ainda necessário:

- Finalizar semântica de fase/ocioso.
- Auditar se `settled` pode disparar cedo demais.
- Tornar escritas de sessão dentro de callbacks de `settled` determinísticas.
- Auditar comportamento de follow-up em torno de `agent_end`.
- Implementar ponto de decisão de auto-compactação.
- Implementar tratamento de retry.
- Garantir que operações estruturais usem limpeza consistente de fase com `try/finally`.
- Verificar semântica do hook `before_agent_start` contra o coding-agent:
  - o comportamento atual adiciona mensagens retornadas ao início.
  - decidir se a semântica de substituição, adição ao início, adição ao final ou transformação é correta.
- Decidir se `before_agent_start` precisa de mais informações de turno, como ferramentas/snippets de ferramentas.
- Documentar ou alterar o timing para eventos de modelo/raciocínio/opção-de-stream que podem disparar antes que as entradas de sessão enfileiradas persistam enquanto ocupado.
- Auditar semântica de barreira de `abort()`.

### 7. Plano de migração posterior do coding-agent

Não iniciado.

Ainda necessário:

- Mapear recursos do coding-agent para carregadores com fonte.
- Manter deduplicação/proveniência de recursos a nível de aplicação fora do harness.
- Adaptar o carregador de extensão para a futura fachada de hook/sessão.
- Preservar comportamento de UI/sessão fora do núcleo.
- Mover comportamento de stream/autenticação/retry/cabeçalho do coding-agent para a configuração de stream do harness e hooks de provedor.

### 8. Suite final de endurecimento do ciclo de vida

Antes de tratar `AgentHarness` como pronto para migração, adicione uma ampla suite de testes que exercite listeners e hooks fechando sobre o harness e chamando APIs públicas durante cada evento relevante.

Necessita de testes amplos para:

- setters de configuração de runtime a partir de eventos de ciclo de vida de baixo nível e eventos do harness
- eventos de observabilidade de configuração de runtime uniforme para modelo, raciocínio, recursos, ferramentas, ferramentas ativas e opções de stream
- atualizações de recurso/ferramenta/modelo/raciocínio/opção-de-stream durante turnos ativos e pontos de salvamento
- escritas de sessão de listeners e hooks, incluindo escritas de `settled`
- operações de fila a partir de eventos de turno, eventos de ferramenta e hooks de provedor
- operações estruturais rejeitadas enquanto ocupado
- abort de listeners/hooks
- comportamento de getter durante operações ativas
- ordenação determinística de mensagens emitidas pelo agente e escritas de listener pendentes
- ausência de deadlocks quando listeners assíncronos chamam APIs do harness e as aguardam
- limpeza de fase através de sucesso, erro de provedor, erro de hook, abort, compactação e navegação em árvore
