# Turns, Session Digest e Governança de Contexto

## Motivação

Modelos com janelas gigantes (ex.: Opus, Gemini, GPT 5.x, DeepSeek V4) reduzem a pressão de compactação precoce, mas **não eliminam o problema de coerência**.

Quando uma sessão cresce demais, o risco principal deixa de ser apenas “não caber no contexto” e passa a ser:
- degradação de foco
- perda de decisões anteriores
- alucinação por difusão do estado
- repetição de tentativas já feitas

Por isso, além de compaction por tokens, faz sentido explorar **turns** como unidade de governança cognitiva.

## Por que turns em vez de mensagens

No runtime do Pi, **turn** representa melhor uma unidade real de trabalho do que “mensagem”.

Um turn normalmente agrega:
- prompt do usuário
- resposta do agente
- tools executadas
- fechamento daquele ciclo

Já contar mensagens é mais ruidoso, pois inclui:
- mensagens de usuário
- mensagens do assistant
- tool results
- mensagens customizadas
- eventos intermediários

Logo, para detectar “sessão longa”, “estado difuso” e “hora de consolidar memória”, **turn count** é um sinal melhor.

## Relação com a compaction atual

Hoje já existe um summarizer no fluxo de compaction:
- o resumo é feito por um **modelo LLM separado**, não pelo agente principal
- isso é positivo, porque já existe um mecanismo reaproveitável para sumarização

A proposta aqui **não substitui compaction**.

Ela cria uma camada separada de memória auxiliar:
- compaction = **hard context rewrite**
- session digest = **soft memory snapshot**

## Objetivo

Criar uma capacidade de **session digest orientada por turns**, com:
- alerta por número de turns
- geração manual de digest
- digest assíncrono/desacoplado
- injeção controlada no fluxo do agente principal

Importante:
- não deve depender apenas de lotar a context window
- não deve compactar automaticamente só porque a sessão ficou longa
- deve respeitar o controle do operador

---

## Fase 1 — Observabilidade e notificação por turns

### Objetivo
Criar a base de governança usando turns como sinal operacional.

### Escopo
- contador confiável de turns por sessão
- thresholds configuráveis
- notificações quando a sessão ficar longa
- status para o operador saber se já existe digest recente ou não

### Comportamento esperado
- após `N` turns, exibir notificação do tipo:
  - “Sessão longa. Considere gerar um session digest.”
- opcionalmente, lembrar novamente após mais `M` turns sem refresh
- sem alterar contexto
- sem chamar summarizer automaticamente

### Superfícies do Pi envolvidas
- eventos de `turn_end`
- status/footer/HUD
- storage simples de metadata por sessão

### Resultado esperado
Uma camada de observação e alerta sem impacto invasivo no fluxo atual.

---

## Fase 2 — Comando manual de session digest

### Objetivo
Permitir ao operador consolidar o estado da sessão sob demanda.

### Escopo
Criar um comando, por exemplo:
- `/session-digest`
- `/session-digest refresh`
- `/session-digest status`
- `/session-digest inject`

### Comportamento esperado
- gerar um resumo operacional da sessão atual
- não compactar
- não remover histórico
- não substituir contexto
- apenas criar um snapshot auxiliar

### Fonte do resumo
Reaproveitar o summarizer já usado no fluxo de compaction, com adaptação de prompt/objetivo se necessário.

### Uso ideal
- quando o operador perceber início de alucinação
- quando a sessão estiver longa
- antes de trocar de modelo
- antes de mudar de tarefa
- antes de uma etapa crítica de implementação/refactor

### Resultado esperado
Uma “âncora de coerência” manual, rápida e controlada.

---

## Fase 3 — Digest assíncrono desacoplado

### Objetivo
Atualizar digests de forma oportunista sem interromper o agente principal.

### Princípio
O digest pode ser gerado por outro modelo/processo, mas **não deve competir diretamente com o run ativo do agente principal**.

### Estratégia segura
- agendar digest após `turn_end`
- preferencialmente rodar quando o sistema estiver idle
- salvar o resultado como snapshot
- apenas notificar o operador quando estiver pronto

### Importante
Não injetar automaticamente no contexto só porque o digest foi gerado.

### Artefatos sugeridos
Exemplo de diretório:
- `.pi/harness/digests/<session-id>/latest.md`
- `.pi/harness/digests/<session-id>/state.json`

Metadata útil:
- `turnCountAtDigest`
- `updatedAt`
- `model`
- `tokensEstimate`
- `source` (`manual` / `scheduled`)

### Resultado esperado
Digest atualizado e disponível, sem congelar nem poluir o fluxo principal.

---

## Fase 4 — Injeção controlada de memória auxiliar

### Objetivo
Permitir que o digest seja usado como memória operacional extra no momento certo.

### Princípio
A injeção deve ser **controlada**, não permanente.

### Formas possíveis
- manual:
  - `/session-digest inject`
- semiautomática:
  - notificação “Existe digest recente; deseja injetar no próximo turn?”
- automática leve:
  - só sob condições bem específicas e configuráveis

### Regras desejáveis
- não injetar em todo turn
- não substituir compaction
- não duplicar contexto desnecessariamente
- usar o digest como memória auxiliar, não como contexto dominante

### Casos de uso
- o operador percebe degradação de coerência
- o agente começou a repetir tentativas
- o modelo parece ter “esquecido” decisões anteriores
- sessão muito longa, porém ainda longe do limite de contexto

### Resultado esperado
Melhora de coerência em sessões longas, com controle explícito do operador.

---

## Arquitetura conceitual sugerida

Três camadas de memória:

1. **Hard context**
   - contexto real ativo da sessão

2. **Soft session digest**
   - resumo cumulativo orientado por turns
   - usado sob demanda ou por policy controlada

3. **Recall memory**
   - memória durável do projeto/sessão
   - persistência curada

Essas camadas resolvem problemas diferentes:
- hard context → continuidade imediata
- soft digest → coerência operacional
- recall → memória durável e compartilhável

---

## Relação com futuras extensões do `recall-pi`

Essa proposta conversa diretamente com:
- `custom-compaction.ts`
- `compaction-snapshot/`
- `trace-recorder.ts`
- status/footer/HUD
- futuras políticas de contexto
- futura camada tipo “context engine” no `recall-pi`

---

## Decisão arquitetural atual

### Não fazer
- substituir compaction por digest
- injetar digest automaticamente em todo caso
- rodar summarização concorrente de forma agressiva contra o fluxo principal
- usar apenas message count como métrica principal

### Fazer
- usar **turns** como unidade de observação
- tratar digest como memória auxiliar
- reaproveitar o summarizer já existente
- preservar controle do operador
- evoluir por fases

---

## Próximo passo natural

Quando esta proposta for implementada, o ideal é criar uma extensão dedicada, por exemplo:
- `session-digest.ts`
- ou `turn-memory.ts`

Ela pode nascer primeiro só com:
- contador de turns
- thresholds
- notificações
- comando manual de digest

Evoluindo depois para as fases 3 e 4.
