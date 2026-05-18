import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import statusLineExt from "../status-line.ts";
import sessionDigestExt from "../session-digest.ts";
import subagentPolicyExt from "../subagent-policy.ts";
import recallToolsExt from "../recall-tools/index.ts";
import subagentExt from "../subagent-env/index.ts";
import workingIndicatorExt from "../working-indicator.ts";
import jinaIndexExt from "../jina-index/index.ts";
import { buildIndex, search } from "../tool-discovery/bm25.ts";

const fakeTheme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
	strikethrough: (text: string) => text,
} as const;

function createPiHarness() {
	const handlers: Record<string, (...args: any[]) => any> = {};
	const commands: Record<string, { description: string; handler: (...args: any[]) => any }> = {};
	const renderers: Record<string, (...args: any[]) => any> = {};
	const appendEntries: Array<{ customType: string; data: unknown }> = [];
	const pi = {
		on: (event: string, handler: (...args: any[]) => any) => {
			handlers[event] = handler;
		},
		registerCommand: (name: string, config: { description: string; handler: (...args: any[]) => any }) => {
			commands[name] = config;
		},
		registerMessageRenderer: (type: string, renderer: (...args: any[]) => any) => {
			renderers[type] = renderer;
		},
		registerFlag: () => undefined,
		registerShortcut: () => undefined,
		registerTool: (tool: any) => {
			commands[tool.name] = tool;
		},
		appendEntry: (customType: string, data: unknown) => {
			appendEntries.push({ customType, data });
		},
	} as any;
	return { pi, handlers, commands, renderers, appendEntries };
}

const EXT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const AGENT_MODEL_EXPECTATIONS = [
	["scout", "model: kilo/gpt-4.1-mini"],
	["planner", "model: openai-codex/gpt-5.4"],
	["worker", "model: kilo/gpt-5-mini"],
	["reviewer", "model: kilo/deepseek/deepseek-v4-flash"],
] as const;

test("bundled subagents match model declared in md", async () => {
	for (const [name, expected] of AGENT_MODEL_EXPECTATIONS) {
		const file = path.join(EXT_ROOT, "subagent-env", "agents", `${name}.md`);
		const content = await fs.readFile(file, "utf8");
		assert.ok(content.includes(expected), `${name} should include ${expected}`);
	}
});

test("status line renders model-aware turn progress", async () => {
	const { pi, handlers } = createPiHarness();
	statusLineExt(pi);

	const statusCalls: Array<[string, string | undefined]> = [];
	const ctx = {
		model: { provider: "kilo", id: "qwen/qwen3.6-plus" },
		hasUI: true,
		ui: {
			theme: fakeTheme,
			setStatus: (key: string, value: string | undefined) => statusCalls.push([key, value]),
		},
	} as any;

	await handlers.session_start?.({}, ctx);
	await handlers.turn_start?.({}, ctx);
	await handlers.turn_end?.({}, ctx);

	assert.deepEqual(statusCalls.map(([key]) => key), [
		"status-line",
		"run-state",
		"status-line",
		"run-state",
		"status-line",
		"run-state",
	]);
	assert.match(statusCalls[0]![1]!, /Ready/);
	assert.match(statusCalls[2]![1]!, /Turn 1/);
	assert.match(statusCalls[4]![1]!, /Turn 1 complete/);
	assert.match(statusCalls[0]![1]!, /kilo\/qwen\/qwen3\.6-plus/);
	assert.match(statusCalls[1]![1]!, /ready/);
	assert.match(statusCalls[5]![1]!, /done/);
});

test("working indicator can hide and restore the loader row", async () => {
	const { pi, handlers, commands } = createPiHarness();
	workingIndicatorExt(pi);

	const visibleCalls: boolean[] = [];
	const indicatorCalls: any[] = [];
	const statusCalls: Array<[string, string | undefined]> = [];
	const ctx = {
		hasUI: true,
		ui: {
			theme: fakeTheme,
			setWorkingVisible: (value: boolean) => visibleCalls.push(value),
			setWorkingIndicator: (value: any) => indicatorCalls.push(value),
			setStatus: (key: string, value: string | undefined) => statusCalls.push([key, value]),
			notify: () => undefined,
		},
	} as any;

	await handlers.session_start?.({}, ctx);
	await commands["working-indicator"]!.handler("none", ctx);
	await commands["working-indicator"]!.handler("reset", ctx);

	assert.deepEqual(visibleCalls.slice(0, 3), [true, false, true]);
	assert.equal(statusCalls[0]![0], "working-indicator");
	assert.match(statusCalls[0]![1]!, /Indicator:/);
	assert.ok(indicatorCalls.length >= 2);
});

test("session digest phase 1 counts turns and warns on threshold", async () => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-session-digest-"));
	await fs.mkdir(path.join(tmpDir, ".pi"), { recursive: true });
	await fs.writeFile(
		path.join(tmpDir, ".pi", "settings.json"),
		JSON.stringify({ sessionDigest: { notifyAfterTurns: 2, remindEveryTurns: 2, recentWithinTurns: 8 } }),
	);

	const { pi, handlers, appendEntries } = createPiHarness();
	sessionDigestExt(pi);

	const statusCalls: Array<[string, string | undefined]> = [];
	const notifications: Array<[string, string]> = [];
	const ctx = {
		cwd: tmpDir,
		hasUI: true,
		sessionManager: {
			getBranch: () => [],
			getSessionFile: () => path.join(tmpDir, ".pi", "sessions", "abc123.jsonl"),
		},
		ui: {
			theme: fakeTheme,
			setStatus: (key: string, value: string | undefined) => statusCalls.push([key, value]),
			notify: (message: string, type: string) => notifications.push([message, type]),
		},
	} as any;

	await handlers.session_start?.({}, ctx);
	await handlers.turn_end?.({}, ctx);
	await handlers.turn_end?.({}, ctx);

	assert.match(statusCalls[0]![1]!, /sd 0t ○/);
	assert.match(statusCalls.at(-1)![1]!, /sd 2t ○/);
	assert.equal(notifications.length, 1);
	assert.match(notifications[0]![0], /Sessão longa/);
	assert.equal(notifications[0]![1], "warning");
	assert.equal(appendEntries.length, 2);
	assert.equal(appendEntries.at(-1)?.customType, "session-digest-state");
	assert.deepEqual(appendEntries.at(-1)?.data && typeof appendEntries.at(-1)?.data === "object" ? { turnCount: (appendEntries.at(-1)!.data as any).turnCount, lastNotifiedTurn: (appendEntries.at(-1)!.data as any).lastNotifiedTurn } : null, { turnCount: 2, lastNotifiedTurn: 2 });
});

test("session digest phase 1 restores turn count from branch and detects recent digest", async () => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-session-digest-"));
	await fs.mkdir(path.join(tmpDir, ".pi", "harness", "digests", "sess-1"), { recursive: true });
	await fs.writeFile(
		path.join(tmpDir, ".pi", "settings.json"),
		JSON.stringify({ sessionDigest: { notifyAfterTurns: 5, remindEveryTurns: 5, recentWithinTurns: 3 } }),
	);
	await fs.writeFile(
		path.join(tmpDir, ".pi", "harness", "digests", "sess-1", "state.json"),
		JSON.stringify({ turnCountAtDigest: 9, updatedAt: new Date().toISOString(), source: "manual" }),
	);

	const { pi, handlers } = createPiHarness();
	sessionDigestExt(pi);

	const statusCalls: Array<[string, string | undefined]> = [];
	const ctx = {
		cwd: tmpDir,
		hasUI: true,
		sessionManager: {
			getBranch: () => [
				{
					type: "custom",
					customType: "session-digest-state",
					data: { version: 1, turnCount: 10, lastNotifiedTurn: 5, updatedAt: new Date().toISOString() },
				},
			],
			getSessionFile: () => path.join(tmpDir, ".pi", "sessions", "sess-1.jsonl"),
		},
		ui: {
			theme: fakeTheme,
			setStatus: (key: string, value: string | undefined) => statusCalls.push([key, value]),
			notify: () => undefined,
		},
	} as any;

	await handlers.session_start?.({}, ctx);

	assert.match(statusCalls.at(-1)![1]!, /sd 10t ●/);
});

function mockClassifierCtx(extra: Record<string, unknown> = {}) {
	return {
		...extra,
		modelRegistry: {
			find: () => ({ baseUrl: "https://mock.classifier/api", provider: { baseUrl: "https://mock.classifier/api" } }),
			getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "mock-key", headers: {} }),
		},
	} as any;
}

test("subagent policy auto-delegates when lexical heuristic returns 'auto'", async () => {
	const { pi, handlers } = createPiHarness();
	subagentPolicyExt(pi);

	const response = await handlers.input?.(
		{ text: "investiga o repo X e propoe refactor em varios arquivos " + Math.random(), source: "interactive" },
		mockClassifierCtx({ hasUI: true, ui: { notify: () => undefined } }),
	);

	assert.equal(response?.action, "transform");
	assert.match(String(response?.text ?? ""), /\[AUTO-DELEGATION ROUTER\]/);
	assert.match(String(response?.text ?? ""), /scout/);
	assert.match(String(response?.text ?? ""), /worker/);
});

test("subagent policy injects guidance when lexical heuristic returns 'inject'", async () => {
	const { pi, handlers } = createPiHarness();
	subagentPolicyExt(pi);

	const response = await handlers.before_agent_start?.(
		{ prompt: "le esses dois arquivos e me explica " + Math.random(), systemPrompt: "BASE" },
		mockClassifierCtx({ hasUI: false }),
	);

	assert.ok(response?.systemPrompt?.includes("[SUBAGENT POLICY]"));
	assert.ok(response?.systemPrompt?.includes("scout"));
	assert.ok(response?.systemPrompt?.includes("reviewer"));
});

test("subagent policy skips when lexical heuristic returns 'skip'", async () => {
	const { pi, handlers } = createPiHarness();
	subagentPolicyExt(pi);

	const inputResp = await handlers.input?.(
		{ text: "oi", source: "interactive" },
		mockClassifierCtx({ hasUI: true, ui: { notify: () => undefined } }),
	);
	assert.equal(inputResp?.action, "continue");

	const beforeResp = await handlers.before_agent_start?.(
		{ prompt: "oi", systemPrompt: "BASE" },
		mockClassifierCtx({ hasUI: false }),
	);
	assert.equal(beforeResp, undefined);
});

// Legacy live test — LLM classifier removed. Kept as smoke test for lexical tier.
// The lexical heuristic is deterministic; this test just validates it doesn't crash.
test("subagent policy classifies a complex PT prompt via lexical heuristic", { skip: process.env.PI_TEST_LIVE !== "1" }, async () => {
	const settingsPath = path.join(os.homedir(), ".pi/agent/settings.json");
	const original = await fs.readFile(settingsPath, "utf8");
	const settings = JSON.parse(original);
	try {
		const { pi, handlers } = createPiHarness();
		subagentPolicyExt(pi);

		const prompt =
			"investiga o repositorio inteiro, mapeia onde o orquestrador decide delegar, " +
			"refatora a heuristica em varios arquivos e revisa os riscos. " + Math.random();

		const response = await handlers.input?.(
			{ text: prompt, source: "interactive" },
			mockClassifierCtx({ hasUI: true, ui: { notify: () => undefined } }),
		);

		// Lexical heuristic should flag this as "auto" (strong complex phrases present).
		assert.equal(response?.action, "transform");
		assert.match(String(response?.text ?? ""), /\[AUTO-DELEGATION ROUTER\]/);
	} finally {
		await fs.writeFile(settingsPath, original);
	}
});

test("recall tools extension registers load/save tools", async () => {
	const { pi, commands } = createPiHarness();
	recallToolsExt(pi);
	assert.ok(commands["recall_mcp_load"], "recall_mcp_load tool missing");
	assert.ok(commands["recall_save"], "recall_save tool missing");
});

test("jina-index extension registers build/list/search tools", async () => {
	const { pi, commands } = createPiHarness();
	jinaIndexExt(pi);
	assert.ok(commands["jina_index_build"], "jina_index_build tool missing");
	assert.ok(commands["jina_index_list"], "jina_index_list tool missing");
	assert.ok(commands["jina_index_search"], "jina_index_search tool missing");
});

test(
	"recall save creates project identity in caller cwd",
	{ skip: process.env.PI_TEST_RECALL_SAVE !== "1" },
	async () => {
		const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-recall-save-"));
		const settingsPath = path.join(os.homedir(), ".pi", "agent", "settings.json");
		const settings = JSON.parse(await fs.readFile(settingsPath, "utf8")).recall;
		const payload = {
			cwd: tmpDir,
			coreDir: settings.coreDir,
			url: settings.url,
			bearerToken: settings.bearerToken,
			pythonPath: settings.pythonPath,
			sessionTitle: "Pi recall save smoke test",
			sessionNotes: "Validating that the client creates .recall in the session cwd, not in recall-core.",
			projectName: "pi-test-project",
			addFiles: [path.join(EXT_ROOT, "recall-tools", "index.ts")],
		};

		try {
			const res = await new Promise<string>((resolve, reject) => {
				const proc = spawn(settings.pythonPath, [
					path.join(EXT_ROOT, "recall-tools", "recall_mcp_client.py"),
					"save",
					JSON.stringify(payload),
				]);
				let stdout = "";
				let stderr = "";
				proc.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
				proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
				proc.on("close", (code: number) => {
					if (code === 0) resolve(stdout);
					else reject(new Error(stderr || stdout || `exit ${code}`));
				});
			});
			const out = JSON.parse(res);
			assert.equal(out.ok, true);
			assert.ok(await fs.stat(path.join(tmpDir, ".recall", "project.json")));
			assert.ok(out.project?.file?.startsWith(tmpDir), "project file must live in caller cwd");
		} finally {
			await fs.rm(tmpDir, { recursive: true, force: true });
		}
	},
);


test("bundled subagents can all respond through the subagent tool", async () => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-subagent-bundled-test-"));
	const fakePi = path.join(tmpDir, "fake-pi.mjs");
	await fs.writeFile(
		fakePi,
		`import process from 'node:process';

const task = process.argv.at(-1) ?? '';
console.log(JSON.stringify({
  type: 'message_end',
  message: {
    role: 'assistant',
    content: [{ type: 'text', text: 'ok: ' + task }],
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: { total: 0 }, totalTokens: 2 },
    model: 'fake-model',
    stopReason: 'end'
  }
}));
`,
		"utf8",
	);

	const previous = process.env.PI_SUBAGENT_BIN;
	process.env.PI_SUBAGENT_BIN = fakePi;

	try {
		let tool: any;
		subagentExt({ registerTool: (t) => (tool = t) } as any);
		assert.ok(tool, "subagent tool was not registered");

		for (const agent of ["debugger", "planner", "reviewer", "scout", "worker"]) {
			const result = await tool.execute(
				"test",
				{ agent, task: `smoke ${agent}` },
				undefined,
				undefined,
				{
					cwd: tmpDir,
					hasUI: false,
					ui: { theme: fakeTheme },
				},
			);

			assert.ok(!result.isError, `${agent} should not error`);
			assert.equal(result.content[0].type, "text");
			assert.match((result.content[0] as { type: "text"; text: string }).text, new RegExp(`ok: Task: smoke ${agent}`));
			assert.equal(result.details.results[0].exitCode, 0);
			assert.equal(result.details.results[0].agent, agent);
		}
	} finally {
		if (previous === undefined) delete process.env.PI_SUBAGENT_BIN;
		else process.env.PI_SUBAGENT_BIN = previous;
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test("subagent tool can run a project-local agent", async () => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-subagent-test-"));
	const agentsDir = path.join(tmpDir, ".pi", "agents");
	await fs.mkdir(agentsDir, { recursive: true });

	const fakePi = path.join(tmpDir, "fake-pi.mjs");
	await fs.writeFile(
		fakePi,
		`import process from 'node:process';

const task = process.argv.at(-1) ?? '';
if (!process.argv.includes('--mode') || !process.argv.includes('json') || !process.argv.includes('--no-session')) {
  console.error('missing expected pi args');
  process.exit(1);
}

console.log(JSON.stringify({
  type: 'message_end',
  message: {
    role: 'assistant',
    content: [{ type: 'text', text: 'pong: ' + task }],
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: { total: 0 }, totalTokens: 2 },
    model: 'fake-model',
    stopReason: 'end'
  }
}));
`,
		"utf8",
	);

	await fs.writeFile(
		path.join(agentsDir, "helper.md"),
		`---
name: helper
description: returns pong
---

Respond with exactly: pong
`,
		"utf8",
	);

	const previous = process.env.PI_SUBAGENT_BIN;
	process.env.PI_SUBAGENT_BIN = fakePi;

	try {
		let tool: any;
		subagentExt({ registerTool: (t) => (tool = t) } as any);
		assert.ok(tool, "subagent tool was not registered");

		const statusCalls: Array<[string, string | undefined]> = [];
		const widgetCalls: Array<[string, string[] | undefined]> = [];
		const result = await tool.execute(
			"test",
			{ agent: "helper", task: "say pong", agentScope: "project", confirmProjectAgents: false },
			undefined,
			undefined,
			{
				cwd: tmpDir,
				hasUI: true,
				ui: {
					theme: fakeTheme,
					setStatus: (key: string, value: string | undefined) => statusCalls.push([key, value]),
					setWidget: (key: string, value: string[] | undefined) => widgetCalls.push([key, value]),
					notify: () => undefined,
				},
			},
		);

		assert.ok(!result.isError);
		assert.equal(result.content[0].type, "text");
		assert.match((result.content[0] as { type: "text"; text: string }).text, /pong: Task: say pong/);
		assert.equal(result.details.results[0].exitCode, 0);
		assert.equal(result.details.results[0].agent, "helper");
		assert.ok(statusCalls.some(([key]) => key === "subagent-hud"));
		assert.ok(widgetCalls.some(([key]) => key === "subagent-hud"));
	} finally {
		if (previous === undefined) delete process.env.PI_SUBAGENT_BIN;
		else process.env.PI_SUBAGENT_BIN = previous;
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test("bm25 ranks ast tools above unrelated tools for ast query", () => {
	const docs = [
		{ name: "ast_grep", description: "Search code via tree-sitter ast patterns; structural match by syntax" },
		{ name: "ast_edit", description: "Apply ast-based structural edits to TypeScript and JavaScript code" },
		{ name: "fetch", description: "Fetch a URL and return body as text" },
		{ name: "calculator", description: "Evaluate arithmetic expressions" },
		{ name: "read", description: "Read a file from the local filesystem" },
	];
	const index = buildIndex(docs, (d) => `${d.name} ${d.description}`);
	const hits = search(index, "ast refactor structural", { limit: 3 });

	assert.ok(hits.length >= 2, `expected at least 2 hits, got ${hits.length}`);
	assert.ok(
		["ast_grep", "ast_edit"].includes(hits[0]!.doc.name),
		`top hit should be an ast tool, got ${hits[0]!.doc.name}`,
	);
	assert.ok(hits[0]!.score > 0, "score should be positive");
});

test("bm25 returns empty for unrelated query", () => {
	const docs = [
		{ name: "read", description: "Read a file from the local filesystem" },
		{ name: "bash", description: "Run shell command" },
	];
	const index = buildIndex(docs, (d) => `${d.name} ${d.description}`);
	const hits = search(index, "matplotlib pyplot chart");
	assert.equal(hits.length, 0, "should return no hits when nothing matches");
});

test("bm25 handles empty index without crashing", () => {
	const index = buildIndex<{ name: string }>([], (d) => d.name);
	const hits = search(index, "anything");
	assert.equal(hits.length, 0);
});
