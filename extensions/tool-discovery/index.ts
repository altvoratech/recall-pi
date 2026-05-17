/**
 * Tool Discovery Extension
 *
 * Resolve o problema de "muitas tools inflam o system prompt":
 *
 * - Sem isso: TODAS as tools registradas vão no system prompt do LLM toda turn.
 *   Com 40+ tools (a la oh-my-pi), isso custa ~4k tokens por turno só de
 *   description.
 *
 * - Com isso: tu mantém só um subconjunto sempre-ativo (read/bash/edit/write +
 *   1-2 essenciais), e o LLM usa a tool `search_tool` pra descobrir e ativar
 *   outras quando precisar. System prompt fica enxuto.
 *
 * O LLM chama:
 *   search_tool({ query: "ast refactor function rename" })
 *   → recebe top N matches com name+description+score
 *   → opcionalmente chama search_tool com activate=true pra ativar a tool no
 *     registry corrente
 *
 * Settings (~/.pi/agent/settings.json):
 *   "toolDiscovery": {
 *     "alwaysActive": ["read", "bash", "edit", "write", "subagent",
 *                      "recall_save", "recall_mcp_load"],
 *     "limit": 8,
 *     "minScore": 0
 *   }
 *
 * Quando ativa: no session_start, snapshot do registry → tools fora de
 * `alwaysActive` ficam discoverable (não aparecem no system prompt do LLM,
 * mas ficam consultáveis via search_tool).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolInfo } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { type BM25Index, buildIndex, search } from "./bm25.ts";
import { readSettings } from "../shared/settings.ts";

interface DiscoverySettings {
	alwaysActive: string[];
	limit: number;
	minScore: number;
}

const DEFAULT_ALWAYS_ACTIVE = [
	"read",
	"bash",
	"edit",
	"write",
	"grep",
	"find",
	"ls",
	"subagent",
	"recall_save",
	"recall_mcp_load",
	"search_tool",
];

function loadSettings(cwd?: string): DiscoverySettings {
	try {
		const { settings } = readSettings(cwd);
		const cfg = (settings as any)?.toolDiscovery ?? {};
		return {
			alwaysActive: Array.isArray(cfg.alwaysActive) ? cfg.alwaysActive : DEFAULT_ALWAYS_ACTIVE,
			limit: typeof cfg.limit === "number" ? cfg.limit : 8,
			minScore: typeof cfg.minScore === "number" ? cfg.minScore : 0,
		};
	} catch {
		return { alwaysActive: DEFAULT_ALWAYS_ACTIVE, limit: 8, minScore: 0 };
	}
}

interface DiscoverableTool {
	name: string;
	description: string;
}

function toDiscoverable(info: ToolInfo): DiscoverableTool {
	return {
		name: info.name,
		description: typeof info.description === "string" ? info.description : "",
	};
}

let activeIndex: BM25Index<DiscoverableTool> | null = null;
let lastIndexedNames: string[] = [];

function buildToolIndex(pi: ExtensionAPI, settings: DiscoverySettings): BM25Index<DiscoverableTool> {
	const allTools = pi.getAllTools();
	const alwaysActive = new Set(settings.alwaysActive);
	const discoverableTools = allTools.filter((t) => !alwaysActive.has(t.name));
	const docs = discoverableTools.map(toDiscoverable);
	lastIndexedNames = docs.map((d) => d.name);
	return buildIndex(docs, (d) => `${d.name} ${d.description}`);
}

function applyDiscoveryMode(pi: ExtensionAPI, settings: DiscoverySettings, ctx?: ExtensionContext): void {
	const allTools = pi.getAllTools().map((t) => t.name);
	const alwaysActive = new Set(settings.alwaysActive);
	const newActive = allTools.filter((name) => alwaysActive.has(name));
	pi.setActiveTools(newActive);
	if (ctx?.hasUI) {
		const discoverableCount = allTools.length - newActive.length;
		ctx.ui.notify(
			`Tool discovery: ${newActive.length} active, ${discoverableCount} discoverable via search_tool`,
			"info",
		);
	}
}

export default function (pi: ExtensionAPI) {
	let settings: DiscoverySettings = { alwaysActive: DEFAULT_ALWAYS_ACTIVE, limit: 8, minScore: 0 };

	pi.on("session_start", (_event, ctx) => {
		settings = loadSettings(ctx.cwd);
		// Build index when session starts (after all extensions registered their tools)
		activeIndex = buildToolIndex(pi, settings);
		applyDiscoveryMode(pi, settings, ctx);
	});

	pi.registerTool({
		name: "search_tool",
		label: "Search Tool",
		description:
			"Search for tools available in this session but currently inactive (not in system prompt). " +
			"Returns top matches ranked by BM25 over name+description. Use this when you need a " +
			"capability you don't currently see in your tools list — search by intent (e.g. 'refactor " +
			"function in many files', 'commit changes', 'fetch URL'). Optionally set `activate=true` " +
			"to enable the top match in the current session's tool registry.",
		promptGuidelines: [
			"Use search_tool to find capabilities not currently visible in your tools list.",
			"Search by intent or task type, not by exact tool name.",
			"Pass activate=true to enable the top result in the current registry.",
		],
		parameters: Type.Object({
			query: Type.String({ description: "Natural-language query describing the capability needed" }),
			limit: Type.Optional(Type.Number({ description: "Max results to return (default 8)" })),
			activate: Type.Optional(
				Type.Boolean({ description: "If true, activates the top match for the current session" }),
			),
		}),
		async execute(_id, params, _signal, _onUpdate, _ctx) {
			if (!activeIndex) {
				activeIndex = buildToolIndex(pi, settings);
			}

			const limit = params.limit ?? settings.limit;
			const hits = search(activeIndex, params.query, { limit, minScore: settings.minScore });

			const lines: string[] = [];
			if (hits.length === 0) {
				lines.push(`No discoverable tools matched "${params.query}".`);
				lines.push("");
				lines.push("Currently active tools are listed in your system prompt — those should");
				lines.push("cover most everyday operations. If you really need something not present,");
				lines.push("the operator may not have it installed.");
				return {
					content: [{ type: "text", text: lines.join("\n") }],
					details: { mode: "search", hits: [] },
				};
			}

			lines.push(`Top ${hits.length} match(es) for "${params.query}":`);
			lines.push("");
			for (const [i, hit] of hits.entries()) {
				lines.push(`${i + 1}. ${hit.doc.name}  (score ${hit.score.toFixed(2)})`);
				if (hit.doc.description) {
					const short = hit.doc.description.length > 280
						? `${hit.doc.description.slice(0, 277)}...`
						: hit.doc.description;
					lines.push(`   ${short}`);
				}
				lines.push("");
			}

			if (params.activate && hits[0]) {
				const top = hits[0].doc.name;
				const currentActive = pi.getActiveTools();
				if (!currentActive.includes(top)) {
					pi.setActiveTools([...currentActive, top]);
					lines.push(`✓ Activated "${top}" for this session.`);
				} else {
					lines.push(`(${top} was already active.)`);
				}
			} else if (hits[0]) {
				lines.push(`To use ${hits[0].doc.name}, re-run search_tool with activate=true.`);
			}

			return {
				content: [{ type: "text", text: lines.join("\n") }],
				details: {
					mode: "search",
					hits: hits.map((h) => ({ name: h.doc.name, score: h.score })),
				},
			};
		},
	});

	pi.registerCommand("tool-discovery", {
		description: "Show tool discovery status (active vs discoverable counts)",
		handler: async (_args, ctx) => {
			if (!activeIndex) activeIndex = buildToolIndex(pi, settings);
			const all = pi.getAllTools();
			const active = pi.getActiveTools();
			const discoverable = lastIndexedNames;
			ctx.ui.notify(
				`Tools: ${all.length} total | ${active.length} active | ${discoverable.length} discoverable`,
				"info",
			);
		},
	});
}
