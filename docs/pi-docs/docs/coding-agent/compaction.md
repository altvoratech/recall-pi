# Compactação e Sumarização de Branch

Os LLMs têm janelas de contexto limitadas. Quando as conversas ficam longas demais, o pi usa compactação para resumir conteúdo antigo enquanto preserva o trabalho recente. Esta página cobre tanto a auto-compactação quanto a sumarização de branch.

**Arquivos fonte** ([pi-mono](https://github.com/earendil-works/pi-mono)):
- [`packages/coding-agent/src/core/compaction/compaction.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/compaction.ts) - Lógica de auto-compactação
- [`packages/coding-agent/src/core/compaction/branch-summarization.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/branch-summarization.ts) - Sumarização de branch
- [`packages/coding-agent/src/core/compaction/utils.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/utils.ts) - Utilitários compartilhados (rastreamento de arquivos, serialização)
- [`packages/coding-agent/src/core/session-manager.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/session-manager.ts) - Tipos de entrada (`CompactionEntry`, `BranchSummaryEntry`)
- [`packages/coding-agent/src/core/extensions/types.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/extensions/types.ts) - Tipos de eventos de extensão

Para definições TypeScript no seu projeto, inspecione `node_modules/@earendil-works/pi-coding-agent/dist/`.

## Visão Geral

O Pi tem dois mecanismos de sumarização:

| Mecanismo | Gatilho | Finalidade |
|-----------|---------|-----------|
| Compactação | Contexto excede limite, ou `/compact` | Resumir mensagens antigas para liberar contexto |
| Sumarização de branch | Navegação `/tree` | Preservar contexto ao alternar branches |

Ambos usam o mesmo formato de resumo estruturado e rastreiam operações de arquivo cumulativamente.

## Compactação

### Quando É Acionada

A auto-compactação é acionada quando:

```
contextTokens > contextWindow - reserveTokens
```

Por padrão, `reserveTokens` é 16384 tokens (configurável em `~/.pi/agent/settings.json` ou `<project-dir>/.pi/settings.json`). Isso deixa espaço para a resposta do LLM.

Você também pode acionar manualmente com `/compact [instruções]`, onde instruções opcionais focam o resumo.

### Como Funciona

1. **Encontrar ponto de corte**: Percorre de trás para frente a partir da mensagem mais nova, acumulando estimativas de tokens até atingir `keepRecentTokens` (padrão 20k, configurável em `~/.pi/agent/settings.json` ou `<project-dir>/.pi/settings.json`)
2. **Extrair mensagens**: Coleta mensagens desde o limite mantido anterior (ou início da sessão) até o ponto de corte
3. **Gerar resumo**: Chama o LLM para resumir com formato estruturado, passando o resumo anterior como contexto iterativo quando presente
4. **Adicionar entrada**: Salva `CompactionEntry` com resumo e `firstKeptEntryId`
5. **Recarregar**: A sessão é recarregada usando resumo + mensagens a partir de `firstKeptEntryId`

```
Antes da compactação:

  entrada:  0     1     2     3      4     5     6      7      8     9
          ┌─────┬─────┬─────┬─────┬──────┬─────┬─────┬──────┬──────┬─────┐
          │ hdr │ usr │ ass │ tool │ usr │ ass │ tool │ tool │ ass │ tool│
          └─────┴─────┴─────┴──────┴─────┴─────┴──────┴──────┴─────┴─────┘
                  └────────┬───────┘ └──────────────┬──────────────┘
                 mensagensParaResumir            mensagens mantidas
                                     ↑
                            firstKeptEntryId (entrada 4)

Após compactação (nova entrada adicionada):

  entrada:  0     1     2     3      4     5     6      7      8     9     10
          ┌─────┬─────┬─────┬─────┬──────┬─────┬─────┬──────┬──────┬─────┬─────┐
          │ hdr │ usr │ ass │ tool │ usr │ ass │ tool │ tool │ ass │ tool│ cmp │
          └─────┴─────┴─────┴──────┴─────┴─────┴──────┴──────┴─────┴─────┴─────┘
                 └──────────┬──────┘ └──────────────────────┬───────────────────┘
                   não enviado ao LLM                    enviado ao LLM
                                                               ↑
                                                    começa em firstKeptEntryId

O que o LLM vê:

  ┌────────┬─────────┬─────┬─────┬──────┬──────┬─────┬──────┐
  │ system │ resumo  │ usr │ ass │ tool │ tool │ ass │ tool │
  └────────┴─────────┴─────┴─────┴──────┴──────┴─────┴──────┘
       ↑         ↑      └─────────────────┬────────────────┘
    prompt   de cmp          mensagens a partir de firstKeptEntryId
```

Em compactações repetidas, o trecho resumido começa no limite mantido da compactação anterior (`firstKeptEntryId`), não na própria entrada de compactação, voltando para a entrada após a compactação anterior se essa entrada mantida não puder ser encontrada no caminho. Isso preserva as mensagens que sobreviveram à compactação anterior incluindo-as também no próximo passe de sumarização. O Pi também recalcula `tokensBefore` a partir do contexto de sessão reconstruído antes de escrever a nova `CompactionEntry`, para que a contagem de tokens reflita o contexto pré-compactação real sendo substituído.

### Turnos Divididos

Um "turno" começa com uma mensagem do usuário e inclui todas as respostas do assistente e chamadas de ferramenta até a próxima mensagem do usuário. Normalmente, a compactação corta nos limites de turno.

Quando um único turno excede `keepRecentTokens`, o ponto de corte fica no meio do turno em uma mensagem do assistente. Isso é um "turno dividido":

```
Turno dividido (um turno enorme excede o orçamento):

  entrada:  0     1     2      3     4      5      6     7      8
          ┌─────┬─────┬─────┬──────┬─────┬──────┬──────┬─────┬──────┐
          │ hdr │ usr │ ass │ tool │ ass │ tool │ tool │ ass │ tool │
          └─────┴─────┴─────┴──────┴─────┴──────┴──────┴─────┴──────┘
                  ↑                                     ↑
           turnStartIndex = 1                  firstKeptEntryId = 7
                  │                                     │
                  └──── turnPrefixMessages (1-6) ───────┘
                                                        └── mantidas (7-8)

  isSplitTurn = true
  messagesToSummarize = []  (nenhum turno completo antes)
  turnPrefixMessages = [usr, ass, tool, ass, tool, tool]
```

Para turnos divididos, o pi gera dois resumos e os mescla:
1. **Resumo de histórico**: Contexto anterior (se houver)
2. **Resumo de prefixo de turno**: A parte inicial do turno dividido

### Regras de Ponto de Corte

Pontos de corte válidos são:
- Mensagens do usuário
- Mensagens do assistente
- Mensagens BashExecution
- Mensagens personalizadas (custom_message, branch_summary)

Nunca corte em resultados de ferramenta (eles devem permanecer com sua chamada de ferramenta).

### Estrutura da CompactionEntry

Definida em [`session-manager.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/session-manager.ts):

```typescript
interface CompactionEntry<T = unknown> {
  type: "compaction";
  id: string;
  parentId: string;
  timestamp: number;
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  fromHook?: boolean;  // true se fornecido por extensão (nome de campo legado)
  details?: T;         // dados específicos da implementação
}

// A compactação padrão usa isso para detalhes (de compaction.ts):
interface CompactionDetails {
  readFiles: string[];
  modifiedFiles: string[];
}
```

Extensões podem armazenar qualquer dado serializável em JSON em `details`. A compactação padrão rastreia operações de arquivo, mas implementações de extensão personalizadas podem usar sua própria estrutura.

Veja [`prepareCompaction()`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/compaction.ts) e [`compact()`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/compaction.ts) para a implementação.

## Sumarização de Branch

### Quando É Acionada

Quando você usa `/tree` para navegar para um branch diferente, o pi oferece a possibilidade de resumir o trabalho que você está deixando. Isso injeta contexto do branch abandonado no novo branch.

### Como Funciona

1. **Encontrar ancestral comum**: O nó mais profundo compartilhado pelas posições antiga e nova
2. **Coletar entradas**: Percorre da folha antiga até o ancestral comum
3. **Preparar com orçamento**: Inclui mensagens até o orçamento de tokens (do mais novo para o mais antigo)
4. **Gerar resumo**: Chama o LLM com formato estruturado
5. **Adicionar entrada**: Salva `BranchSummaryEntry` no ponto de navegação

```
Árvore antes da navegação:

         ┌─ B ─ C ─ D (folha antiga, sendo abandonada)
    A ───┤
         └─ E ─ F (destino)

Ancestral comum: A
Entradas para resumir: B, C, D

Após navegação com resumo:

         ┌─ B ─ C ─ D ─ [resumo de B,C,D]
    A ───┤
         └─ E ─ F (nova folha)
```

### Rastreamento Cumulativo de Arquivos

Tanto a compactação quanto a sumarização de branch rastreiam arquivos cumulativamente. Ao gerar um resumo, o pi extrai operações de arquivo de:
- Chamadas de ferramenta nas mensagens sendo resumidas
- `details` de compactação ou resumo de branch anteriores (se houver)

Isso significa que o rastreamento de arquivos se acumula em múltiplas compactações ou resumos de branch aninhados, preservando o histórico completo de arquivos lidos e modificados.

### Estrutura da BranchSummaryEntry

Definida em [`session-manager.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/session-manager.ts):

```typescript
interface BranchSummaryEntry<T = unknown> {
  type: "branch_summary";
  id: string;
  parentId: string;
  timestamp: number;
  summary: string;
  fromId: string;      // Entrada da qual navegamos
  fromHook?: boolean;  // true se fornecido por extensão (nome de campo legado)
  details?: T;         // dados específicos da implementação
}

// A sumarização de branch padrão usa isso para detalhes (de branch-summarization.ts):
interface BranchSummaryDetails {
  readFiles: string[];
  modifiedFiles: string[];
}
```

Igual à compactação, extensões podem armazenar dados personalizados em `details`.

Veja [`collectEntriesForBranchSummary()`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/branch-summarization.ts), [`prepareBranchEntries()`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/branch-summarization.ts) e [`generateBranchSummary()`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/branch-summarization.ts) para a implementação.

## Formato de Resumo

Tanto a compactação quanto a sumarização de branch usam o mesmo formato estruturado:

```markdown
## Objetivo
[O que o usuário está tentando realizar]

## Restrições e Preferências
- [Requisitos mencionados pelo usuário]

## Progresso
### Concluído
- [x] [Tarefas concluídas]

### Em Andamento
- [ ] [Trabalho atual]

### Bloqueado
- [Problemas, se houver]

## Decisões Principais
- **[Decisão]**: [Justificativa]

## Próximos Passos
1. [O que deve acontecer a seguir]

## Contexto Crítico
- [Dados necessários para continuar]

<read-files>
path/to/file1.ts
path/to/file2.ts
</read-files>

<modified-files>
path/to/changed.ts
</modified-files>
```

### Serialização de Mensagens

Antes da sumarização, as mensagens são serializadas para texto via [`serializeConversation()`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/utils.ts):

```
[User]: O que eles disseram
[Assistant thinking]: Raciocínio interno
[Assistant]: Texto de resposta
[Assistant tool calls]: read(path="foo.ts"); edit(path="bar.ts", ...)
[Tool result]: Saída da ferramenta
```

Isso evita que o modelo trate isso como uma conversa para continuar.

Os resultados de ferramentas são truncados para 2000 caracteres durante a serialização. O conteúdo além desse limite é substituído por um marcador indicando quantos caracteres foram truncados. Isso mantém as requisições de sumarização dentro de orçamentos de tokens razoáveis, pois os resultados de ferramentas (especialmente de `read` e `bash`) são tipicamente os maiores contribuidores para o tamanho do contexto.

## Sumarização Personalizada via Extensões

As extensões podem interceptar e personalizar tanto a compactação quanto a sumarização de branch. Veja [`extensions/types.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/extensions/types.ts) para definições de tipos de eventos.

### session_before_compact

Disparado antes da auto-compactação ou `/compact`. Pode cancelar ou fornecer resumo personalizado. Veja `SessionBeforeCompactEvent` e `CompactionPreparation` no arquivo de tipos.

```typescript
pi.on("session_before_compact", async (event, ctx) => {
  const { preparation, branchEntries, customInstructions, signal } = event;

  // preparation.messagesToSummarize - mensagens para resumir
  // preparation.turnPrefixMessages - prefixo de turno dividido (se isSplitTurn)
  // preparation.previousSummary - resumo de compactação anterior
  // preparation.fileOps - operações de arquivo extraídas
  // preparation.tokensBefore - tokens de contexto antes da compactação
  // preparation.firstKeptEntryId - onde começam as mensagens mantidas
  // preparation.settings - configurações de compactação

  // branchEntries - todas as entradas no branch atual (para estado personalizado)
  // signal - AbortSignal (passar para chamadas LLM)

  // Cancelar:
  return { cancel: true };

  // Resumo personalizado:
  return {
    compaction: {
      summary: "Seu resumo...",
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
      details: { /* dados personalizados */ },
    }
  };
});
```

#### Convertendo Mensagens para Texto

Para gerar um resumo com seu próprio modelo, converta mensagens para texto usando `serializeConversation`:

```typescript
import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";

pi.on("session_before_compact", async (event, ctx) => {
  const { preparation } = event;
  
  // Converter AgentMessage[] para Message[], depois serializar para texto
  const conversationText = serializeConversation(
    convertToLlm(preparation.messagesToSummarize)
  );
  // Retorna:
  // [User]: texto da mensagem
  // [Assistant thinking]: conteúdo de raciocínio
  // [Assistant]: texto de resposta
  // [Assistant tool calls]: read(path="..."); bash(command="...")
  // [Tool result]: texto de saída

  // Agora envie para seu modelo para sumarização
  const summary = await myModel.summarize(conversationText);
  
  return {
    compaction: {
      summary,
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
    }
  };
});
```

Veja [custom-compaction.ts](../examples/extensions/custom-compaction.ts) para um exemplo completo usando um modelo diferente.

### session_before_tree

Disparado antes da navegação `/tree`. Sempre dispara independentemente de o usuário ter escolhido resumir. Pode cancelar a navegação ou fornecer resumo personalizado.

```typescript
pi.on("session_before_tree", async (event, ctx) => {
  const { preparation, signal } = event;

  // preparation.targetId - para onde estamos navegando
  // preparation.oldLeafId - posição atual (sendo abandonada)
  // preparation.commonAncestorId - ancestral compartilhado
  // preparation.entriesToSummarize - entradas que seriam resumidas
  // preparation.userWantsSummary - se o usuário escolheu resumir

  // Cancelar navegação completamente:
  return { cancel: true };

  // Fornecer resumo personalizado (usado apenas se userWantsSummary for true):
  if (preparation.userWantsSummary) {
    return {
      summary: {
        summary: "Seu resumo...",
        details: { /* dados personalizados */ },
      }
    };
  }
});
```

Veja `SessionBeforeTreeEvent` e `TreePreparation` no arquivo de tipos.

## Configurações

Configure a compactação em `~/.pi/agent/settings.json` ou `<project-dir>/.pi/settings.json`:

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

| Configuração | Padrão | Descrição |
|--------------|--------|-----------|
| `enabled` | `true` | Habilitar auto-compactação |
| `reserveTokens` | `16384` | Tokens a reservar para resposta do LLM |
| `keepRecentTokens` | `20000` | Tokens recentes a manter (não resumidos) |

Desabilite a auto-compactação com `"enabled": false`. Você ainda pode compactar manualmente com `/compact`.
