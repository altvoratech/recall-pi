# Security & Operations Notes

This file documents non-obvious security-sensitive behavior in recall-pi and how to operate it safely. It complements `README.md` and `GLOBAL_RULES.md`.

## Threat model (in scope)

- An adversarial LLM response or prompt-injected tool result that tries to get the agent to run privileged or destructive shell commands.
- Accidental loss of the `.recall/project.json` UUID, which is the only way to read sessions saved against that project on the local SQLite/Postgres backends.
- Credential leakage from world-readable `~/.pi/agent/settings.json` (bearer tokens, model API keys).

Out of scope: kernel-level isolation, defenses against a malicious operator with root, supply-chain attacks on `pi-coding-agent` itself.

## Credentials & configuration

Recall configuration resolves in this order (first wins):

1. Environment variables — `RECALL_URL`, `RECALL_BEARER_TOKEN`, `RECALL_PYTHON`, `RECALL_CORE_DIR`
2. Project settings — `<cwd>/.pi/settings.json`
3. Global settings — `~/.pi/agent/settings.json`
4. Compiled-in defaults (loopback URL, `~/recall-core` paths)

Recommended posture:

- Keep `bearerToken` out of any settings file checked into git. Prefer the env var, or a settings file with `chmod 600`.
- If the recall MCP is exposed beyond loopback, use `https://`. The settings parser rejects plain `http://` for non-loopback hosts and the agent will refuse to start in that mode.
- Rotate the bearer token any time the settings file is shared (e.g. screen recording, paste in chat).

## Audit log

The permission gate writes a JSONL audit trail to `~/.pi/agent/audit.log` (mode `0600`). One line per decision:

- `permission_gate.allow` — operator approved execution (`action: "execute"` or `"sudo"`).
- `permission_gate.deny` — operator cancelled or sudo password missing.
- `permission_gate.block` — automatic block (e.g. `.recall/` deletion, no UI available).

Review with:

```bash
jq -c . ~/.pi/agent/audit.log | tail -50
```

The log is append-only by convention; rotate manually if it grows too large.

## Subagent orchestration system log

For critical orchestration visibility, `subagent-policy` and `subagent` now append JSONL events to:

- `logs/system-log.jsonl` (repo root)

Typical events include policy injection (lexical tier), auto-delegation transforms, and subagent run start/end.

`source` segmentation:
- `subagent-policy`
- `subagent:tool`
- `subagent:runner`
- `subagent:usage` (explicit signal that a subagent execution happened)

Automatic rotation is enabled:
- max file size: `5 MB`
- retained history: `logs/system-log.1.jsonl` ... `logs/system-log.5.jsonl`

Quick tail:

```bash
tail -f logs/system-log.jsonl
```

## .recall/project.json — UUID custody

`.recall/project.json` is the single source of truth that ties a working directory to a recall project. **Lose this file and you lose addressability of every session saved under that UUID.** Treat it like a private key:

- Commit it to the repository (it has no secrets, only the UUID and metadata) so it survives a fresh clone.
- Back it up if the project lives outside git.
- Do not regenerate it casually — a new UUID means a fresh empty project.

The `protected-paths` extension blocks writes to `.recall/` by default, and `permission-gate` blocks shell deletions targeting `.recall`.

## Subagent isolation

Each subagent invocation spawns a fresh `pi` process with `shell: false` and inherits the parent cwd. JSONL parse failures are now surfaced through the subagent's `stderr` field instead of being silently dropped, so a corrupted subprocess stream is visible in the result. The `subagent-policy` uses a lexical heuristic (zero API calls) to decide delegation tier.

If `pi` cannot be resolved on `PATH`, the subagent tool now fails fast with an actionable error rather than hanging.

## Recall Python subprocess

`recall_mcp_client.py` runs with `cwd` pinned to its own script directory so a misbehaving script cannot scribble in the caller's working tree. The caller cwd is still passed through the JSON payload for project-identity resolution.

## Reporting

This is a personal setup, not a hosted product — file an issue (or just patch directly) if you find a sharp edge.
