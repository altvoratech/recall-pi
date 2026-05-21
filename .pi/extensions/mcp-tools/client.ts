import { callMcpHttp } from "./json-rpc.ts";
import type { McpToolsListResult } from "./types.ts";
import { StdioJsonRpcClient } from "./stdio.ts";

export interface McpHttpConnection {
	name: string;
	transport: "http" | "stdio";
	url?: string;
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	connectedAt: string;
}

export class McpHttpClient {
	private active: McpHttpConnection | null = null;
	private stdio = new StdioJsonRpcClient();

	async connectHttp(name: string, url: string): Promise<McpHttpConnection> {
		await this.disconnect();
		const conn: McpHttpConnection = { name, transport: "http", url, connectedAt: new Date().toISOString() };
		this.active = conn;
		return conn;
	}

	async connectStdio(name: string, command: string, args: string[] = [], env: Record<string, string> = {}): Promise<McpHttpConnection> {
		await this.disconnect();
		await this.stdio.connect(command, args, env);
		const conn: McpHttpConnection = {
			name,
			transport: "stdio",
			command,
			args,
			env,
			connectedAt: new Date().toISOString(),
		};
		this.active = conn;
		return conn;
	}

	async disconnect(): Promise<void> {
		await this.stdio.disconnect();
		this.active = null;
	}

	getConnection(): McpHttpConnection | null {
		return this.active;
	}

	async listTools(signal?: AbortSignal): Promise<McpToolsListResult> {
		const conn = this.requireConnection();
		if (conn.transport === "http") {
			return callMcpHttp<McpToolsListResult>(conn.url!, "tools/list", {}, { signal });
		}
		return (await this.stdio.call("tools/list", {})) as McpToolsListResult;
	}

	async callTool(
		toolName: string,
		argumentsObj: Record<string, unknown>,
		signal?: AbortSignal,
	): Promise<unknown> {
		const conn = this.requireConnection();
		if (conn.transport === "http") {
			return callMcpHttp(conn.url!, "tools/call", { name: toolName, arguments: argumentsObj }, { signal });
		}
		return this.stdio.call("tools/call", { name: toolName, arguments: argumentsObj });
	}

	private requireConnection(): McpHttpConnection {
		if (!this.active) throw new Error("No active MCP connection. Run /mcp-connect first.");
		return this.active;
	}
}
