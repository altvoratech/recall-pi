# Conformance Checklist — Pi docs x recall-pi

Checklist para auditar aderência deste repositório às docs oficiais do Pi e ao padrão adotado neste projeto.

## 1) Package layout (`.pi/` como runtime)
- [x] `package.json` está na raiz do repositório (manifesto principal do pacote).
- [x] Bloco `pi.extensions` aponta para `./.pi/extensions`.
- [x] Bloco `pi.prompts` aponta para `./.pi/prompts`.
- [x] Não há cópia ativa de runtime em `extensions/`, `prompts/`, `scripts/` na raiz.

## 2) Settings
- [x] Existe `.pi/settings.json` no projeto.
- [x] `systemRules.path` aponta para `../GLOBAL_RULES.md`.
- [x] Chaves custom (`subagentPolicy`, `compaction`) estão no escopo de projeto.
- [x] `subagentPolicy` usa heurística léxica (zero tokens) — sem dependência de provider externo.
- [ ] Revalidar compatibilidade dessas chaves a cada upgrade do Pi.

## 3) Extensions
- [x] Extensões centralizadas em `.pi/extensions`.
- [x] Estrutura compatível com docs (arquivos `.ts` no topo e `index.ts` em subpastas quando necessário).
- [x] Sem `package.json` aninhado dentro de `.pi/extensions` (tooling centralizado no root).
- [ ] Revisar APIs de hooks/eventos a cada versão do Pi para evitar regressão.

## 4) Prompt templates
- [x] Templates em `.pi/prompts/*.md`.
- [x] Frontmatter com `description`.
- [x] Nomes curtos e únicos para comandos `/`.

## 5) Subagents (custom)
> Nota: subagents não são feature nativa do Pi; são comportamento da extensão `subagent-env`.

- [x] Fonte única de agents em `.pi/extensions/subagent-env/agents/*.md`.
- [x] Sem duplicação ativa em `~/.pi/agent/extensions/subagent-env`.
- [x] `subagent-policy` usa heurística léxica local (`lexicalComplexityTier`) — zero latência, zero custo.
- [x] Fallback léxico já existia; agora é o mecanismo principal.
- [ ] Revalidar defaults de `agentScope` e confirmação de agentes locais após mudanças.

## 6) Qualidade e validação
- [x] Typecheck passando (`npm run typecheck`).
- [x] Testes passando (`npm test`).
- [x] Testes de integração live são opt-in por variável de ambiente (`PI_TEST_*`).
- [ ] Incluir este checklist na revisão de PR que altere configuração do Pi.

## 7) Rotina de auditoria recomendada
- [ ] A cada upgrade de `@earendil-works/pi-coding-agent`:
  1. Revisar `docs/settings.md`, `docs/extensions.md`, `docs/prompt-templates.md`, `docs/packages.md`.
  2. Rodar `npm run typecheck` e `npm test`.
  3. Revalidar este checklist e registrar deltas.
  4. Atualizar README e docs de operação quando houver mudança de contrato.

---

Última atualização: 2026-05-17
