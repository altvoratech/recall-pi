# recall-pi — Atualizações aplicadas após Pi 0.74.1 (2026-05-16)

Este documento resume as mudanças implementadas neste repositório para aproveitar/alinhar-se com novidades e recomendações do Pi `@earendil-works/pi-coding-agent` **0.74.1**.

## 1) Conformidade com a doc do Pi: carregamento de extensões/prompts

**Motivação (docs/settings.md + docs/extensions.md + docs/prompt-templates.md):**
- A doc recomenda auto-discovery por convenção em `.pi/extensions/*` e `.pi/prompts/*` (project-local), evitando depender de `settings.json` apontando para diretórios arbitrários.

**Mudanças:**
- Criado `.pi/extensions/` com wrappers (`export { default } ...`) para os entrypoints reais em `./extensions/...`.
- Criado `.pi/prompts/` com cópia dos templates.
- Ajustado `.pi/settings.json` para remover `extensions` e `prompts` (agora o carregamento ocorre por convenção).

## 2) Custom footer: alinhado ao padrão recomendado

**Motivação (docs/tui.md → "Pattern 6: Custom Footer"):**
- Custom footer deve ser reativo (`footerData.onBranchChange` → `tui.requestRender`) e deve, idealmente, renderizar `footerData.getExtensionStatuses()` para não esconder estados importantes.

**Mudanças:**
- `extensions/custom-footer.ts`: removida a duplicação do registro do comando `/footer` (evita `footer:1`, `footer:2`).
- Mantida (e priorizada) a renderização de `footerData.getExtensionStatuses()`.

## 3) Novo: geração de imagens (feature 0.74.1)

**Motivação (Pi 0.74.1):**
- A versão 0.74.1 introduziu suporte a geração de imagens (APIs em `pi-ai` + OpenRouter images).

**Implementado:**
- Extensão `extensions/image-generation.ts`:
  - tool `image_generate` (text-to-image e image-to-image via base64 opcional)
  - comando `/provider-doctor` (diagnóstico de auth do provider atual + Together + OpenRouter env)
- Wrapper `.pi/extensions/image-generation.ts`
- Template `.pi/prompts/image.md`

**Nota técnica importante:**
- O pacote `@earendil-works/pi-ai@0.74.1` inclui os módulos de image generation em `dist/`, mas eles **não estão exportados** no entrypoint do pacote.
- Para evitar `ERR_PACKAGE_PATH_NOT_EXPORTED`, a extensão carrega `dist/images.js` e `dist/image-models.js` via **file URL** usando `import.meta.resolve()`.

**Pré-requisito:**
- Definir `OPENROUTER_API_KEY` no ambiente para usar `image_generate`.

## 4) Together AI provider (feature 0.74.1)

**Motivação (Pi 0.74.1):**
- Provider Together AI foi adicionado como built-in com suporte a `/login`.

**Implementado:**
- `/provider-doctor` reporta se o registry contém models do Together e se há credencial disponível (best-effort).
- Template `.pi/prompts/provider-doctor.md`.

## 5) Validação: teste live do classifier

**Motivação:**
- Garantir que o classifier de subagentes continua funcional pós-mudanças e que o gateway (kilo/Azure) aceita `max_tokens >= 16`.

**Executado:**
- `PI_TEST_LIVE=1 npm test` em `./extensions` (passou).

---

## Arquivos tocados/criados (lista rápida)

- Atualizados:
  - `.pi/settings.json`
  - `extensions/custom-footer.ts`
  - `extensions/package.json`

- Novos:
  - `extensions/image-generation.ts`
  - `.pi/extensions/**` (wrappers)
  - `.pi/prompts/image.md`
  - `.pi/prompts/provider-doctor.md`
  - `.pi/prompts/{implement,scout-and-plan,implement-and-review}.md` (cópias)

