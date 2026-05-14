# Conformance Checklist — Pi docs x recall-pi

Checklist para auditar aderência deste repositório à documentação oficial do Pi.

## 1) Settings
- [x] Existe `.pi/settings.json` no projeto.
- [x] `extensions` aponta para `../extensions`.
- [x] `prompts` aponta para `../prompts`.
- [x] `systemRules.path` aponta para `../GLOBAL_RULES.md`.
- [ ] Validar periodicamente compatibilidade das chaves custom (`subagentPolicy`, `compaction.thresholdTokens`, etc.) com a versão atual do Pi.

## 2) Extensions
- [x] Extensões carregadas via settings (sem depender só de `-e`).
- [x] Estrutura compatível com docs (`index.ts` em subpastas e `.ts` no topo).
- [x] `extensions/package.json` inclui `keywords: ["pi-package"]`.
- [x] `extensions/package.json` inclui bloco `pi.extensions`.
- [ ] Revisar, a cada upgrade de Pi, APIs usadas nos hooks/eventos para evitar quebra.

## 3) Prompt templates
- [x] Templates centralizados em `prompts/*.md`.
- [x] Cada template possui frontmatter com `description`.
- [x] Sem duplicação ativa de prompts em `extensions/subagent-env/prompts`.
- [ ] Se adicionar novos templates, manter nomes curtos e únicos para comandos `/`.

## 4) Subagents (custom)
> Nota: subagents não são feature nativa do Pi; são comportamento implementado pela extensão `subagent-env`.

- [x] Fonte única de agents em `extensions/subagent-env/agents/*.md`.
- [x] Sem duplicação ativa em `agents/` no root.
- [x] Discovery de agents documentado como custom (`user`, `project`, `extension`).
- [ ] Validar após mudanças se `agentScope` default e confirmação de project agents continuam coerentes.

## 5) Documentação do repo
- [x] README atualizado para fluxo com `.pi/settings.json` local.
- [x] Instrução de symlink obrigatório removida.
- [x] Estrutura do projeto no README reflete diretórios atuais.
- [ ] Atualizar README sempre que mover prompts/agents/extensions.

## 6) Qualidade e validação
- [x] Typecheck passando (`cd extensions && npm run typecheck`).
- [x] Testes passando (`cd extensions && npm test`).
- [ ] Incluir este checklist em revisão de PR que altere configuração do Pi.

## 7) Rotina de auditoria recomendada
- [ ] A cada upgrade de `@earendil-works/pi-coding-agent`:
  1. Revisar `docs/settings.md`, `docs/extensions.md`, `docs/prompt-templates.md`, `docs/packages.md`.
  2. Rodar typecheck/testes.
  3. Revalidar este checklist e marcar deltas.
  4. Atualizar README e este arquivo se houver mudança de contrato.

---

Última atualização: 2026-05-14
