# Conformance Checklist — Pi docs x recall-pi

Checklist para auditar aderência deste repositório ao contrato atual do Pi e ao contrato interno do `recall-pi`.

## 1) Package layout
- [x] `package.json` está na raiz.
- [x] `pi.extensions` aponta para `./.pi/extensions`.
- [x] `pi.prompts` aponta para `./.pi/prompts`.
- [x] `pi.skills` aponta para `./.agents/skills` e `./.pi/skills`.
- [x] Runtime centralizado em `.pi/`.

## 2) Skills
- [x] Skills do projeto são descobertas via `package.json`, não por suposição de cwd.
- [x] `.agents/skills/` é suportado.
- [ ] Revalidar discovery após upgrades do Pi.

## 3) Settings
- [x] Existe `.pi/settings.json` no projeto.
- [x] `systemRules.path` aponta para `../GLOBAL_RULES.md`.
- [x] `compaction` está no escopo do projeto.
- [x] `subagentPolicy.classifier*` legada não é mais necessária.
- [x] `compaction.thresholdTokens` é usado pelo runtime nativo do Pi para auto-compaction.

## 4) Extensions
- [x] Extensões centralizadas em `.pi/extensions`.
- [x] Sem `package.json` aninhado dentro de `.pi/extensions`.
- [x] Hooks/testes atuais compatíveis com Pi 0.74.1.
- [ ] Revalidar APIs de hooks/eventos a cada upgrade do Pi.

## 5) Subagents
- [x] Fonte única de agents em `.pi/extensions/subagent-env/agents/*.md`.
- [x] `subagent-policy` usa heurística léxica local.
- [x] Timeout por subagente implementado (180s).
- [x] Abort lock integrado com `subagent-env`.
- [x] Teste smoke cobre resposta dos subagentes bundled via runner fake.
- [ ] Revalidar defaults de `agentScope` e confirmação de agentes locais após mudanças.

## 6) Safety gates
- [x] `permission-gate` protege bash sensível.
- [x] `permission-gate` bloqueia `write`/`edit` em `.recall` e `.git/`.
- [x] `protected-paths` pede confirmação para outros destinos protegidos.
- [x] `/abort` existe e bloqueia novas mutações até `/reload`.

## 7) Traceability
- [x] `trace-recorder` grava em `.pi/harness/runs/` dentro do pacote `recall-pi`.
- [x] Não depende do cwd global do processo do Pi.
- [x] O harness distingue runs `main` e `subagent`.
- [x] `logs/system-log.jsonl` registra eventos operacionais críticos.

## 8) Qualidade e validação
- [x] `npm run typecheck` passando.
- [x] `npm test` passando.
- [x] Testes live continuam opt-in por variável de ambiente.
- [ ] Rodar essa validação após qualquer upgrade de `@earendil-works/pi-*`.

## 9) Rotina recomendada pós-upgrade
1. Revisar docs oficiais relevantes (`extensions`, `skills`, `packages`, `prompt-templates`).
2. Rodar `npm run typecheck`.
3. Rodar `npm test`.
4. Verificar discovery de skills via `package.json`.
5. Verificar `trace-recorder` gravando sob `recall-pi/.pi/harness/runs/`.
6. Verificar `/abort` + timeout de subagentes.
7. Verificar que `/trigger-compact` continua apenas manual e que auto-compaction vem do runtime do Pi.
8. Atualizar `README.md`, `docs/SECURITY.md` e este checklist se houver mudança de contrato.

---

Última atualização: 2026-05-17
