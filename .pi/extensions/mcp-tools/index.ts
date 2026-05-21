import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { Type } from "typebox";
import { readSettings, readJsonIfExists } from "../shared/settings.ts";
import { McpHttpClient } from "./client.ts";
import type { McpToolDef, McpToolsListResult } from "./types.ts";

type McpServerConfig = {
	type?: string;
	url?: string;
	command?: string;
	args?: string[];
	env?: Record<string, string>;
};

type McpSettings = {
	servers: Record<string, McpServerConfig>;
	autoRegister: boolean;
};

function findNearestMcpJson(cwd: string): string | null {
	let current = path.resolve(cwd);
	while (true) {
		const candidate = path.join(current, ".mcp.json");
		if (fs.existsSync(candidate)) return candidate;
		const parent = path.dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

function expandEnvTemplate(value: string): string {
	return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_, name: string) => process.env[name] ?? "");
}

function normalizeMcpJsonServer(raw: Record<string, unknown>): McpServerConfig | null {
	const url = typeof raw.url === "string" && raw.url.trim() ? raw.url.trim() : "";
	const command = typeof raw.command === "string" && raw.command.trim() ? raw.command.trim() : "";
	const args = Array.isArray(raw.args) ? raw.args.filter((v): v is string => typeof v === "string") : undefined;
	const envRaw = raw.env && typeof raw.env === "object" ? (raw.env as Record<string, unknown>) : undefined;
	const env: Record<string, string> | undefined = envRaw
		? Object.fromEntries(
			Object.entries(envRaw)
				.filter(([, v]) => typeof v === "string")
				.map(([k, v]) => [k, expandEnvTemplate(v as string)]),
		)
		: undefined;
	if (url) return { type: "http", url, env };
	if (command) return { type: "stdio", command, args, env };
	return null;
}

function readMcpJsonServers(cwd: string): Record<string, McpServerConfig> {
	const mcpPath = findNearestMcpJson(cwd);
	if (!mcpPath) return {};
	const raw = readJsonIfExists(mcpPath) ?? {};
	const servers = (raw.mcpServers as Record<string, unknown> | undefined) ?? {};
	const out: Record<string, McpServerConfig> = {};
	for (const [name, value] of Object.entries(servers)) {
		if (!value || typeof value !== "object") continue;
		const normalized = normalizeMcpJsonServer(value as Record<string, unknown>);
		if (normalized) out[name] = normalized;
	}
	return out;
}

function readMcpSettings(cwd: string): McpSettings {
	const { settings } = readSettings(cwd);
	const mcp = (settings.mcp as Record<string, unknown> | undefined) ?? {};
	const servers = (mcp.servers as Record<string, unknown> | undefined) ?? {};
	const out: Record<string, McpServerConfig> = {};
	for (const [name, value] of Object.entries(servers)) {
		if (!value || typeof value !== "object") continue;
		out[name] = value as McpServerConfig;
	}
	const discovered = readMcpJsonServers(cwd);
	// Discovery precedence: explicit settings.mcp.servers > .mcp.json entries
	// (operator can still override discovered project config in settings).
	for (const [name, cfg] of Object.entries(discovered)) {
		if (!out[name]) out[name] = cfg;
	}

	// Compatibility fallback:
	// If mcp.servers is not configured, infer a default "recall" HTTP server
	// from legacy recall settings used by recall-tools extension.
	if (Object.keys(out).length === 0) {
		const recall = (settings.recall as Record<string, unknown> | undefined) ?? {};
		const rawUrl = typeof recall.url === "string" && recall.url.trim() ? recall.url.trim() : "";
		if (rawUrl) {
			const base = rawUrl.replace(/\/sse$/i, "").replace(/\/+$/, "");
			if (base) {
				out.recall = {
					type: "http",
					url: `${base}/mcp`,
				};
			}
		}
	}

	return { servers: out, autoRegister: Boolean((mcp as any).autoRegister) };
}

function selectServer(
	servers: Record<string, McpServerConfig>,
	requestedName?: string,
): { name: string; config: McpServerConfig } {
	if (requestedName) {
		const exact = servers[requestedName];
		if (!exact) throw new Error(`MCP server "${requestedName}" not found in settings.mcp.servers`);
		if ((exact.type ?? "http") === "http" && !exact.url) throw new Error(`MCP server "${requestedName}" has no url`);
		if ((exact.type ?? "http") === "stdio" && !exact.command) throw new Error(`MCP server "${requestedName}" has no command`);
		return { name: requestedName, config: exact };
	}

	for (const [name, config] of Object.entries(servers)) {
		if ((config.type ?? "http") === "http" && !config.url) continue;
		if ((config.type ?? "http") === "stdio" && !config.command) continue;
		return { name, config };
	}
	throw new Error("No valid MCP server configured in settings.mcp.servers");
}

function formatToolsResult(server: string, result: McpToolsListResult): string {
	const tools = Array.isArray(result?.tools) ? result.tools : [];
	if (tools.length === 0) return `MCP server "${server}" returned 0 tools.`;
	const lines = [`MCP server "${server}" tools (${tools.length}):`];
	for (const tool of tools) lines.push(`- ${tool.name}${tool.description ? ` — ${tool.description}` : ""}`);
	return lines.join("\n");
}

function sanitizeName(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
}

export default function (pi: ExtensionAPI) {
	const activeClients = new Map<string, McpHttpClient>();
	const registeredDynamicTools = new Set<string>();
	let activeServerName: string | null = null;

	async function connectFromConfig(name: string, config: McpServerConfig): Promise<McpHttpClient> {
		const existing = activeClients.get(name);
		if (existing?.getConnection()) {
			activeServerName = name;
			return existing;
		}
		const client = existing ?? new McpHttpClient();
		const mode = (config.type ?? "http").toLowerCase();
		if (mode === "stdio") await client.connectStdio(name, config.command!, config.args ?? [], config.env ?? {});
		else await client.connectHttp(name, config.url!);
		activeClients.set(name, client);
		activeServerName = name;
		return client;
	}

	async function disconnectAll(): Promise<void> {
		for (const c of activeClients.values()) await c.disconnect();
		activeClients.clear();
		activeServerName = null;
	}

	function registerDynamicTool(serverName: string, mcpTool: McpToolDef, client: McpHttpClient): void {
		const dynName = `mcp_${sanitizeName(serverName)}__${sanitizeName(mcpTool.name)}`;
		if (!dynName || registeredDynamicTools.has(dynName)) return;
		registeredDynamicTools.add(dynName);
		pi.registerTool({
			name: dynName,
			label: `MCP ${serverName}: ${mcpTool.name}`,
			description: mcpTool.description || `Dynamic MCP tool "${mcpTool.name}" from server "${serverName}".`,
			parameters: Type.Object({
				arguments: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
			}),
			async execute(_id, params, signal) {
				const result = await client.callTool(mcpTool.name, params.arguments ?? {}, signal);
				return {
					content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
					details: result,
				};
			},
		});
	}

	async function syncServerTools(name: string, config: McpServerConfig, signal?: AbortSignal): Promise<number> {
		const client = await connectFromConfig(name, config);
		const listed = await client.listTools(signal);
		const tools = Array.isArray(listed?.tools) ? listed.tools : [];
		for (const tool of tools) registerDynamicTool(name, tool, client);
		return tools.length;
	}

	pi.on("session_start", async (_event, ctx) => {
		const cfg = readMcpSettings(ctx.cwd);
		if (!cfg.autoRegister) return;
		for (const [name, server] of Object.entries(cfg.servers)) {
			try {
				await syncServerTools(name, server, (ctx as any)?.signal);
			} catch {
				// non-blocking startup
			}
		}
	});

	pi.on("session_shutdown", async () => {
		await disconnectAll();
	});

	pi.registerCommand("mcp-tools-list", {
		description: "Lists tools from a configured MCP server (settings.mcp.servers)",
		handler: async (args, ctx) => {
			try {
				const requestedName = args.trim() || undefined;
				const servers = readMcpSettings(ctx.cwd).servers;
				const { name, config } = selectServer(servers, requestedName);
				const client = await connectFromConfig(name, config);
				const result = await client.listTools((ctx as any)?.signal);
				ctx.ui.notify(formatToolsResult(name, result), "info");
			} catch (error) {
				ctx.ui.notify(`mcp-tools-list error: ${(error as Error).message}`, "error");
			}
		},
	});

	pi.registerCommand("mcp-connect", {
		description: "Connects to an MCP server from settings.mcp.servers",
		handler: async (args, ctx) => {
			try {
				const requestedName = args.trim() || undefined;
				const servers = readMcpSettings(ctx.cwd).servers;
				const { name, config } = selectServer(servers, requestedName);
				const client = await connectFromConfig(name, config);
				const conn = client.getConnection()!;
				const listed = await client.listTools((ctx as any)?.signal);
				const count = Array.isArray(listed?.tools) ? listed.tools.length : 0;
				ctx.ui.notify(`MCP connected: ${conn.name} [${conn.transport}] (${count} tools)`, "info");
			} catch (error) {
				ctx.ui.notify(`mcp-connect error: ${(error as Error).message}`, "error");
			}
		},
	});

	pi.registerCommand("mcp-sync-tools", {
		description: "Discover tools from MCP servers and register dynamic bridge tools",
		handler: async (args, ctx) => {
			try {
				const target = args.trim();
				const settings = readMcpSettings(ctx.cwd).servers;
				const entries = Object.entries(settings);
				if (entries.length === 0) throw new Error("No MCP servers configured.");

				let total = 0;
				if (target && target !== "all") {
					const cfg = settings[target];
					if (!cfg) throw new Error(`MCP server "${target}" not found.`);
					total += await syncServerTools(target, cfg, (ctx as any)?.signal);
					ctx.ui.notify(`MCP tools synced for ${target} (${total} discovered).`, "info");
					return;
				}

				for (const [name, cfg] of entries) {
					try {
						total += await syncServerTools(name, cfg, (ctx as any)?.signal);
					} catch {
						// continue
					}
				}
				ctx.ui.notify(`MCP sync complete (${entries.length} server(s), ${total} discovered).`, "info");
			} catch (error) {
				ctx.ui.notify(`mcp-sync-tools error: ${(error as Error).message}`, "error");
			}
		},
	});

	pi.registerCommand("mcp-disconnect", {
		description: "Disconnect all active MCP server connections",
		handler: async (_args, ctx) => {
			const active = activeServerName;
			await disconnectAll();
			ctx.ui.notify(active ? `MCP disconnected: ${active}` : "MCP disconnected", "info");
		},
	});

	pi.registerCommand("mcp-status", {
		description: "Show active MCP connection status",
		handler: async (_args, ctx) => {
			if (!activeServerName) {
				ctx.ui.notify("MCP: disconnected", "warning");
				return;
			}
			const client = activeClients.get(activeServerName);
			const active = client?.getConnection();
			if (!active) {
				ctx.ui.notify("MCP: disconnected", "warning");
				return;
			}
			const target = active.transport === "http" ? active.url : `${active.command} ${(active.args ?? []).join(" ")}`.trim();
			ctx.ui.notify(`MCP: connected to ${active.name} [${active.transport}] (${target})`, "info");
		},
	});

	pi.registerTool({
		name: "mcp_call_tool",
		label: "MCP Call Tool",
		description: "Calls a tool from a configured MCP server.",
		parameters: Type.Object({
			toolName: Type.String({ description: "MCP tool name to call." }),
			server: Type.Optional(Type.String({ description: "Optional server name. If omitted, uses active connection." })),
			arguments: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
		}),
		async execute(_id, params, signal, _onUpdate, ctx) {
			const target = (params.server?.trim() || activeServerName || "").trim();
			if (!target) throw new Error("No active MCP server. Use /mcp-connect or pass server.");
			const settings = readMcpSettings(ctx.cwd).servers;
			const config = settings[target];
			if (!config) throw new Error(`MCP server "${target}" not found in settings.`);
			const client = await connectFromConfig(target, config);
			const result = await client.callTool(params.toolName, params.arguments ?? {}, signal);
			return {
				content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
				details: result,
			};
		},
	});

	pi.registerTool({
		name: "mcp_list_tools",
		label: "MCP List Tools",
		description: "Lists tools from a configured MCP server.",
		parameters: Type.Object({
			server: Type.Optional(Type.String({ description: "Optional server name. If omitted, uses active connection." })),
		}),
		async execute(_id, params, signal, _onUpdate, ctx) {
			const target = (params.server?.trim() || activeServerName || "").trim();
			if (!target) throw new Error("No active MCP server. Use /mcp-connect or pass server.");
			const settings = readMcpSettings(ctx.cwd).servers;
			const config = settings[target];
			if (!config) throw new Error(`MCP server "${target}" not found in settings.`);
			const client = await connectFromConfig(target, config);
			const result = await client.listTools(signal);
			const tools = Array.isArray(result?.tools) ? result.tools : [];
			return {
				content: [{ type: "text", text: formatToolsResult(target, { tools }) }],
				details: result,
			};
		},
	});
}
