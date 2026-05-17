#!/usr/bin/env python3
"""Recall MCP helper for Pi extensions.

Modes:
  load <json-config>
  save <json-config>
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

import anyio

_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def _load_config() -> dict[str, Any]:
    if len(sys.argv) != 3:
        raise SystemExit("usage: recall_mcp_client.py <load|save> '<json-config>'")
    mode = sys.argv[1]
    if mode not in {"load", "save"}:
        raise SystemExit("mode must be load or save")
    payload = json.loads(sys.argv[2])
    payload["mode"] = mode
    return payload


def _import_recall_core(core_dir: str):
    sys.path.insert(0, core_dir)
    from core.project import ProjectNotInitialized, init_project, load_project
    return ProjectNotInitialized, init_project, load_project


def _ensure_project(cfg: dict[str, Any]):
    ProjectNotInitialized, init_project, load_project = _import_recall_core(cfg["coreDir"])
    cwd = Path(cfg["cwd"]).resolve()

    try:
        return load_project(str(cwd))
    except ProjectNotInitialized:
        return init_project(
            str(cwd),
            name=cfg.get("projectName"),
            agent=cfg.get("agent") or "pi",
            agent_model=cfg.get("agentModel"),
        )


def _extract_text(result: Any) -> str:
    parts = []
    for item in getattr(result, "content", []) or []:
        text = getattr(item, "text", None)
        if text is not None:
            parts.append(text)
    return "\n".join(parts).strip()


def _parse_json_text(text: str) -> Any:
    return json.loads(text) if text else None


def _parse_state_version(state_markdown: str) -> int:
    match = re.search(r"state_version:\s*(\d+)", state_markdown)
    if not match:
        raise RuntimeError("Could not extract state_version from recall_get_state output")
    return int(match.group(1))


async def _call_tool(session, name: str, arguments: dict[str, Any]) -> Any:
    result = await session.call_tool(name, arguments)
    return _parse_json_text(_extract_text(result))


async def _run(cfg: dict[str, Any]) -> dict[str, Any]:
    headers = {"Authorization": f"Bearer {cfg['bearerToken']}"}

    sys.path.insert(0, str(Path(cfg["coreDir"]).resolve()))
    from mcp.client.session import ClientSession
    from mcp.client.sse import sse_client

    async with sse_client(cfg["url"], headers=headers) as streams:
        async with ClientSession(*streams) as session:
            await session.initialize()

            if cfg["mode"] == "load":
                query = cfg.get("query")
                index = cfg.get("index")
                session_id = cfg.get("sessionId")
                is_global = bool(cfg.get("global"))
                top_k = int(cfg.get("topK") or 5)

                project = None if is_global else _ensure_project(cfg)
                project_id = None if project is None else project.id

                if session_id:
                    data = await _call_tool(session, "recall_get_session", {"session_id": session_id})
                    return {"ok": True, "mode": "session", "project_id": project_id, "session": data}

                if index is not None:
                    sessions = await _call_tool(session, "recall_list_sessions", {"project_id": project_id})
                    if not isinstance(sessions, list):
                        return {"ok": False, "mode": "index", "error": sessions}
                    if index < 1 or index > len(sessions):
                        return {"ok": False, "error": f"session index out of range: {index}", "session_count": len(sessions)}
                    selected = sessions[index - 1]
                    data = await _call_tool(session, "recall_get_session", {"session_id": selected["id"]})
                    return {
                        "ok": True,
                        "mode": "session",
                        "project_id": project_id,
                        "selected_index": index,
                        "selected_session": selected,
                        "session": data,
                    }

                if query:
                    data = await _call_tool(
                        session,
                        "recall_search",
                        {"query": query, "project_id": project_id, "top_k": top_k},
                    )
                    return {"ok": True, "mode": "search", "project_id": project_id, "query": query, "results": data}

                data = await _call_tool(session, "recall_list_sessions", {"project_id": project_id})
                return {"ok": True, "mode": "list", "project_id": project_id, "sessions": data}

            project = _ensure_project(cfg)
            if not _UUID_RE.match(project.id):
                raise RuntimeError(f"Invalid project UUID: {project.id}")

            state_markdown = _extract_text(await session.call_tool("recall_get_state", {"project_id": project.id}))
            schema = _parse_json_text(_extract_text(await session.call_tool("recall_get_schema", {})))
            base_version = _parse_state_version(state_markdown)

            delta = {
                "base_version": base_version,
                "agent": cfg.get("agent") or "pi",
                "project_id": project.id,
                "session_title": cfg["sessionTitle"],
                "session_notes": cfg["sessionNotes"],
                "add_files": cfg.get("addFiles", []),
                "add_decisions": cfg.get("addDecisions", []),
                "update_decisions": cfg.get("updateDecisions", []),
                "remove_decisions": cfg.get("removeDecisions", []),
                "add_tasks": cfg.get("addTasks", []),
                "complete_tasks": cfg.get("completeTasks", []),
                "remove_tasks": cfg.get("removeTasks", []),
                "add_concepts": cfg.get("addConcepts", []),
                "update_concepts": cfg.get("updateConcepts", []),
                "remove_concepts": cfg.get("removeConcepts", []),
            }
            save = await _call_tool(
                session,
                "recall_save",
                {"delta_json": json.dumps(delta), "project_name": cfg.get("projectName") or project.name},
            )
            return {
                "ok": True,
                "mode": "save",
                "project": {"id": project.id, "name": project.name, "file": str(project.file_path)},
                "base_version": base_version,
                "schema": schema,
                "delta": delta,
                "result": save,
            }


def main():
    cfg = _load_config()
    data = anyio.run(_run, cfg)
    print(json.dumps(data, ensure_ascii=False))


if __name__ == "__main__":
    main()
