export interface JsonRpcRequest {
	jsonrpc: "2.0";
	id: string | number;
	method: string;
	params?: Record<string, unknown>;
}

export interface JsonRpcSuccess<T = unknown> {
	jsonrpc: "2.0";
	id: string | number | null;
	result: T;
}

export interface JsonRpcErrorObject {
	code: number;
	message: string;
	data?: unknown;
}

export interface JsonRpcFailure {
	jsonrpc: "2.0";
	id: string | number | null;
	error: JsonRpcErrorObject;
}

export type JsonRpcResponse<T = unknown> = JsonRpcSuccess<T> | JsonRpcFailure;

export interface McpToolDef {
	name: string;
	description?: string;
	inputSchema?: Record<string, unknown>;
}

export interface McpToolsListResult {
	tools?: McpToolDef[];
}
