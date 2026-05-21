import type { JsonRpcRequest, JsonRpcResponse } from "./types.ts";

function normalizeMcpHttpUrl(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) throw new Error("MCP HTTP url is empty");
	if (/\/mcp$/i.test(trimmed)) return trimmed;
	return `${trimmed.replace(/\/+$/, "")}/mcp`;
}

export async function callMcpHttp<T = unknown>(
	url: string,
	method: string,
	params?: Record<string, unknown>,
	options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
	const endpoint = normalizeMcpHttpUrl(url);
	const request: JsonRpcRequest = {
		jsonrpc: "2.0",
		id: Date.now(),
		method,
		params,
	};

	const controller = new AbortController();
	const timeoutMs = options.timeoutMs ?? 15000;
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	const signal = options.signal ?? controller.signal;

	try {
		const response = await fetch(endpoint, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(request),
			signal,
		});
		if (!response.ok) {
			throw new Error(`MCP HTTP ${response.status} ${response.statusText}`);
		}
		const payload = (await response.json()) as JsonRpcResponse<T>;
		if ("error" in payload) {
			throw new Error(`MCP JSON-RPC error ${payload.error.code}: ${payload.error.message}`);
		}
		return payload.result;
	} finally {
		clearTimeout(timer);
	}
}
