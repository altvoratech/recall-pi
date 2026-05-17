# Security & Operations Notes

Este documento cobre o comportamento real de segurança/operabilidade do `recall-pi`.

## Threat model (in scope)

- Resposta adversarial do LLM tentando disparar shell privilegiado ou destrutivo.
- Escrita acidental em paths sensíveis (`.git/`, `.recall/`, configs do Pi, `.env`, `node_modules/`).
- Subagentes travados em chamadas lentas de provider.
- Perda de `.recall/project.json`, que quebra a identidade do projeto no recall.

Fora de escopo: isolamento kernel-level, operador malicioso com root, supply-chain do Pi.

## Credentials & configuration

Recall resolve configuração nesta ordem:

1. env vars (`RECALL_URL`, `RECALL_BEARER_TOKEN`, `RECALL_PYTHON`, `RECALL_CORE_DIR`)
2. `.pi/settings.json` do projeto
3. `~/.pi/agent/settings.json`
4. defaults

Postura recomendada:
- prefira env vars para tokens
- use `chmod 600` em arquivos sensíveis do diretório `~/.pi/agent/`
- não commite tokens em `settings.json` ou `models.json`

## Permission model

### `permission-gate.ts`

Proteções atuais:
- abre modal para bash sensível/privilegiado
- bloqueia exclusão shell de `.recall`
- bloqueia `write`/`edit` em `.recall` e `.git/`
- expõe `/abort`

`/abort`:
- ativa um **abort lock** no processo atual
- aborta subagentes em execução
- bloqueia novas mutações `bash` / `write` / `edit`
- bloqueia novas execuções do tool `subagent`
- é limpo com `/reload`

### `protected-paths.ts`

Pede confirmação explícita para `write`/`edit` em:
- `.env`
- `.env.*`
- `node_modules/`
- `~/.pi/agent/settings.json`
- `~/.pi/agent/auth.json`
- `~/.pi/agent/models.json`
- paths extras configurados em `protectedPaths`

Observação: para `.git/` e `.recall/`, o hard block do `permission-gate` prevalece.

## Compaction safety

- auto-compaction por threshold fica no runtime nativo do Pi
- `custom-compaction.ts` só customiza o summary gerado em `session_before_compact`
- `/trigger-compact` é manual; ele não é mais usado como gatilho automático em `turn_end`
- isso evita interferência do fluxo manual de abort/reconnect no ciclo normal do agente principal

## Subagent safety

`subagent-env`:
- spawna processos `pi` isolados com `shell: false`
- aplica timeout de **180s por subagente**
- marca `stopReason: "timeout"` quando expira
- observa o abort lock e encerra subprocessos ao receber `/abort`

Isso resolve a classe de travamento onde a UI fica em “Running...” por tempo indefinido por causa de provider lento.

## Observability

### `logs/system-log.jsonl`

Eventos críticos são gravados em:
- `logs/system-log.jsonl`

`source` segmentado:
- `trace-recorder`
- `subagent-policy`
- `subagent:tool`
- `subagent:runner`
- `subagent:usage`

Há eventos relevantes para:
- início/fim de run
- timeout de subagente
- abort lock em subagente
- uso efetivo do tool `subagent`

Exemplo:

```bash
tail -f logs/system-log.jsonl
```

## Trace recorder

No harness, o agente interativo desta sessão é o run `main`; cada delegação cria um run `subagent` separado.

O `trace-recorder` grava em:

```text
recall-pi/.pi/harness/runs/
```

A raiz é derivada do pacote da extensão, não do cwd do processo global do Pi. Isso evita traces fora do repositório.

Os artefatos distinguem explicitamente `phase: "main"` e `phase: "subagent"`.

## `.recall/project.json` — UUID custody

`.recall/project.json` é a identidade do projeto no recall.

Recomendações:
- preserve o arquivo
- não regenere sem necessidade
- versionar é aceitável se sua política interna permitir, pois ele carrega identidade e metadados do projeto

Perder esse arquivo significa perder endereçabilidade direta da memória daquele projeto.

## Skills discovery

A descoberta de skills do projeto é feita pelo manifesto `pi.skills` do `package.json`.

Diretórios atuais:
- `./.agents/skills`
- `./.pi/skills`

Se adicionar/mover skills, rode `/reload`.

## Reporting

Este repositório é setup local/pessoal. Se encontrar comportamento inseguro ou inconsistente, corrija a extensão correspondente e atualize `README.md` + este documento.
