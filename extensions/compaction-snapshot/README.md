# Compaction Snapshot

Persiste o summary cumulativo gerado pelo `custom-compaction.ts` em disco como **cache local efêmero** durante a vida da sessão.

## O que faz

- Escuta o evento `session_compact` (disparado pelo Pi APÓS o custom-compaction retornar o summary)
- Escreve `snapshot.md` + `state.json` em `~/recall-pi/compact-session/<session-id>/`
- Faz upsert: a cada nova compaction o mesmo arquivo é sobrescrito com o summary cumulativo atualizado

## Layout em disco

```
~/recall-pi/compact-session/<session-id>/
  ├── snapshot.md     ← markdown do summary cumulativo (último estado)
  └── state.json      ← metadados: compactionCount, tokensBefore, projectId
```

`state.json`:

```json
{
  "schemaVersion": 1,
  "sessionId": "...",
  "projectId": "uuid-from-.recall/project.json",
  "startedAt": "ISO",
  "updatedAt": "ISO",
  "compactionCount": 3,
  "tokensBefore": 101948
}
```

## Filosofia: cache local quente, sem sync remoto

Esse diretório existe pra servir **queries quentes durante a sessão ativa** (ex: subagent curator que responde "quais decisões tomamos sobre X 500 turnos atrás?"). I/O é local, ms.

**Não sincroniza pro `recall-core`** por design:

- Embedar a conversa inteira no banco gera ruído (lição do experimento Jina — chunks sobrepostos da mesma sessão poluem retrieval futuro)
- Decisões duradouras vão pelo canal **separado** `recall_save` (manual/curado, com `key` único)
- Sessão termina → snapshot pode ser deletado, ninguém perde nada importante

Pipeline próprio de extração de entidades estruturadas (`_index/decisions.jsonl` etc) pode ser adicionado depois, sem alterar essa camada base.

## Por que extension separada de `custom-compaction.ts`

- `custom-compaction.ts` cuida só de **gerar** o summary
- `compaction-snapshot/` cuida só de **persistir**
- Eventos diferentes (`session_before_compact` vs `session_compact`) → zero coordenação ou race entre as 2
