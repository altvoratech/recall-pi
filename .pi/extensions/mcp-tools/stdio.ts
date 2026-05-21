import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

type Pending = {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
};

function parseHeaders(headerBlock: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const line of headerBlock.split("\r\n")) {
		const idx = line.indexOf(":");
		if (idx <= 0) continue;
		const key = line.slice(0, idx).trim().toLowerCase();
		const value = line.slice(idx + 1).trim();
		out[key] = value;
	}
	return out;
}

export class StdioJsonRpcClient {
	private proc: ChildProcessWithoutNullStreams | null = null;
	private buffer = Buffer.alloc(0);
	private nextId = 1;
	private pending = new Map<number, Pending>();

	async connect(command: string, args: string[] = [], env: Record<string, string> = {}): Promise<void> {
		if (this.proc) return;
		this.proc = spawn(command, args, {
			stdio: "pipe",
			shell: false,
			env: { ...process.env, ...env },
		});

		this.proc.stdout.on("data", (chunk: Buffer) => this.onData(chunk));
		this.proc.stderr.on("data", () => {
			// stderr may contain logs; ignore at transport layer
		});
		this.proc.on("exit", (code, signal) => {
			const err = new Error(`MCP stdio process exited (code=${code ?? "null"}, signal=${signal ?? "null"})`);
			for (const p of this.pending.values()) p.reject(err);
			this.pending.clear();
			this.proc = null;
		});

		await this.initialize();
	}

	async disconnect(): Promise<void> {
		if (!this.proc) return;
		this.proc.kill("SIGTERM");
		this.proc = null;
		this.pending.clear();
		this.buffer = Buffer.alloc(0);
	}

	async call(method: string, params?: Record<string, unknown>): Promise<unknown> {
		if (!this.proc) throw new Error("MCP stdio not connected");
		const id = this.nextId++;
		const payload = {
			jsonrpc: "2.0",
			id,
			method,
			params,
		};

		const body = Buffer.from(JSON.stringify(payload), "utf8");
		const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8");
		const packet = Buffer.concat([header, body]);

		const promise = new Promise<unknown>((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
		});
		this.proc.stdin.write(packet);
		return promise;
	}

	private async initialize(): Promise<void> {
		await this.call("initialize", {
			protocolVersion: "2025-03-26",
			capabilities: {},
			clientInfo: { name: "recall-pi", version: "0.1.0" },
		});
		if (this.proc) {
			const payload = Buffer.from(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }), "utf8");
			const header = Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, "utf8");
			this.proc.stdin.write(Buffer.concat([header, payload]));
		}
	}

	private onData(chunk: Buffer): void {
		this.buffer = Buffer.concat([this.buffer, chunk]);

		while (true) {
			const headerEnd = this.buffer.indexOf("\r\n\r\n");
			if (headerEnd === -1) return;
			const headerText = this.buffer.slice(0, headerEnd).toString("utf8");
			const headers = parseHeaders(headerText);
			const len = Number(headers["content-length"] ?? "0");
			if (!Number.isFinite(len) || len <= 0) {
				this.buffer = this.buffer.slice(headerEnd + 4);
				continue;
			}

			const total = headerEnd + 4 + len;
			if (this.buffer.length < total) return;
			const body = this.buffer.slice(headerEnd + 4, total).toString("utf8");
			this.buffer = this.buffer.slice(total);

			let msg: any;
			try {
				msg = JSON.parse(body);
			} catch {
				continue;
			}
			if (typeof msg?.id !== "number") continue;
			const waiter = this.pending.get(msg.id);
			if (!waiter) continue;
			this.pending.delete(msg.id);
			if (msg.error) waiter.reject(new Error(`MCP JSON-RPC error ${msg.error.code}: ${msg.error.message}`));
			else waiter.resolve(msg.result);
		}
	}
}
