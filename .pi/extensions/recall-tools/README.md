# Recall Tools

Pi extension that wraps the local `recall-core` MCP server.

## Tools
- `recall_mcp_load` — list/search/load recall memory
- `recall_save` — persist session state through the recall MCP schema

## Configuration
Set in `~/.pi/agent/settings.json`:

```json
{
  "recall": {
    "url": "http://127.0.0.1:18789/sse",
    "bearerToken": "...",
    "coreDir": "/home/g/recall-core",
    "pythonPath": "/home/g/recall-core/.venv/bin/python"
  }
}
```

## Behavior
- The client creates or loads `.recall/project.json` in the caller cwd for save/identity operations.
- `.recall/project.json` is required; without it the client cannot recover the project UUID and cannot save to the correct database identity.
- The backend directory (`recall-core`) is never used as the project identity source.
- Context injection uses global recall search so it still works even if the current project has no sessions.
- The wrapper talks to the local MCP server with bearer auth.
- Runtime logs are written to `logs/latest.json`, overwritten on each event.
- No secrets are committed: bearer token stays in `~/.pi/agent/settings.json`, and `.firecrawl/` plus `logs/` are ignored.
