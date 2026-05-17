import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type JinaIndexSettings = {
	apiKey?: string;
	apiKeyEnv?: string;
	embeddingModel?: string;
	rerankModel?: string;
	baseUrl?: string;
	chunkSize?: number;
	chunkOverlap?: number;
	defaultTopK?: number;
};

type Manifest = {
	name: string;
	createdAt: string;
	updatedAt: string;
	embeddingModel: string;
	dimension: number;
	chunkSize: number;
	chunkOverlap: number;
	sourcePaths: string[];
	fileCount: number;
	chunkCount: number;
};

type ChunkRow = {
	id: string;
	sourcePath: string;
	relPath: string;
	chunkIndex: number;
	text: string;
	embedding: number[];
};

const EXT_DIR = path.dirname(new URL(import.meta.url).pathname);
const INDEXES_DIR = path.join(EXT_DIR, "_indexes");
const DEFAULTS = {
	embeddingModel: "jina-embeddings-v5-text-small",
	rerankModel: "jina-reranker-v3",
	baseUrl: "https://api.jina.ai/v1",
	chunkSize: 1200,
	chunkOverlap: 200,
	defaultTopK: 5,
};

function readJsonIfExists(filePath: string): Record<string, unknown> | undefined {
	try {
		if (!fs.existsSync(filePath)) return undefined;
		return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
	} catch {
		return undefined;
	}
}

function findNearestProjectSettings(cwd: string): string | null {
	let current = path.resolve(cwd);
	while (true) {
		const candidate = path.join(current, ".pi", "settings.json");
		if (fs.existsSync(candidate)) return candidate;
		const parent = path.dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

function getSettings(cwd: string): Required<JinaIndexSettings> & { apiKey: string } {
	const globalSettings = readJsonIfExists(path.join(os.homedir(), ".pi", "agent", "settings.json")) ?? {};
	const projectSettingsPath = findNearestProjectSettings(cwd);
	const projectSettings = projectSettingsPath ? readJsonIfExists(projectSettingsPath) ?? {} : {};
	const merged = {
		...((globalSettings.jinaIndex as Record<string, unknown> | undefined) ?? {}),
		...((projectSettings.jinaIndex as Record<string, unknown> | undefined) ?? {}),
	};

	const apiKeyEnv = typeof merged.apiKeyEnv === "string" && merged.apiKeyEnv.trim() ? merged.apiKeyEnv.trim() : "JINA_API_KEY";
	const apiKey =
		typeof merged.apiKey === "string" && merged.apiKey.trim()
			? merged.apiKey.trim()
			: (process.env[apiKeyEnv] ?? "").trim();
	if (!apiKey) {
		throw new Error(`Jina API key ausente. Defina ${apiKeyEnv} no ambiente ou settings.json -> jinaIndex.apiKey`);
	}

	return {
		apiKey,
		apiKeyEnv,
		embeddingModel:
			typeof merged.embeddingModel === "string" && merged.embeddingModel.trim() ? merged.embeddingModel.trim() : DEFAULTS.embeddingModel,
		rerankModel: typeof merged.rerankModel === "string" && merged.rerankModel.trim() ? merged.rerankModel.trim() : DEFAULTS.rerankModel,
		baseUrl: typeof merged.baseUrl === "string" && merged.baseUrl.trim() ? merged.baseUrl.replace(/\/+$/, "") : DEFAULTS.baseUrl,
		chunkSize: typeof merged.chunkSize === "number" && merged.chunkSize > 200 ? merged.chunkSize : DEFAULTS.chunkSize,
		chunkOverlap: typeof merged.chunkOverlap === "number" && merged.chunkOverlap >= 0 ? merged.chunkOverlap : DEFAULTS.chunkOverlap,
		defaultTopK: typeof merged.defaultTopK === "number" && merged.defaultTopK > 0 ? merged.defaultTopK : DEFAULTS.defaultTopK,
	};
}

async function walkFiles(root: string, out: string[]): Promise<void> {
	const entries = await fsp.readdir(root, { withFileTypes: true });
	for (const entry of entries) {
		const full = path.join(root, entry.name);
		if (entry.isDirectory()) {
			if (["node_modules", ".git", "dist", "build", ".next", ".zread", "_indexes"].includes(entry.name)) continue;
			await walkFiles(full, out);
			continue;
		}
		if (!entry.isFile()) continue;
		if (/\.(png|jpg|jpeg|gif|webp|pdf|zip|gz|mp4|mp3|woff2?|ttf|ico|db|sqlite|lock)$/i.test(entry.name)) continue;
		out.push(full);
	}
}

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
	const normalized = text.replace(/\r\n/g, "\n").trim();
	if (!normalized) return [];
	const chunks: string[] = [];
	let start = 0;
	while (start < normalized.length) {
		const end = Math.min(start + chunkSize, normalized.length);
		chunks.push(normalized.slice(start, end));
		if (end >= normalized.length) break;
		start = Math.max(0, end - overlap);
	}
	return chunks;
}

async function embedBatch(settings: ReturnType<typeof getSettings>, input: string[], task: "retrieval.passage" | "retrieval.query"): Promise<number[][]> {
	const res = await fetch(`${settings.baseUrl}/embeddings`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${settings.apiKey}`,
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify({
			model: settings.embeddingModel,
			input,
			task,
			normalized: true,
		}),
	});
	if (!res.ok) throw new Error(`Jina embeddings falhou: ${res.status} ${await res.text()}`);
	const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
	const rows = data.data ?? [];
	return rows.map((r) => r.embedding);
}

function dot(a: number[], b: number[]): number {
	const n = Math.min(a.length, b.length);
	let s = 0;
	for (let i = 0; i < n; i++) s += a[i]! * b[i]!;
	return s;
}

async function readManifest(indexDir: string): Promise<Manifest> {
	return JSON.parse(await fsp.readFile(path.join(indexDir, "manifest.json"), "utf8")) as Manifest;
}

async function readAllChunks(indexDir: string): Promise<ChunkRow[]> {
	const file = await fsp.readFile(path.join(indexDir, "chunks.jsonl"), "utf8");
	return file
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => JSON.parse(line) as ChunkRow);
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "jina_index_build",
		label: "Jina Index Build",
		description: "Indexa documentação local usando embeddings Jina e salva no diretório da extensão.",
		parameters: Type.Object({
			name: Type.String({ description: "Nome do índice." }),
			paths: Type.Optional(Type.Array(Type.String(), { description: "Pastas/arquivos para indexar. Padrão: cwd." })),
			rebuild: Type.Optional(Type.Boolean({ default: true })),
			chunkSize: Type.Optional(Type.Number()),
			chunkOverlap: Type.Optional(Type.Number()),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const settings = getSettings(ctx.cwd);
			const sources = (params.paths?.length ? params.paths : [ctx.cwd]).map((p) => path.resolve(ctx.cwd, p));
			const chunkSize = params.chunkSize && params.chunkSize > 200 ? params.chunkSize : settings.chunkSize;
			const chunkOverlap = params.chunkOverlap && params.chunkOverlap >= 0 ? params.chunkOverlap : settings.chunkOverlap;

			await fsp.mkdir(INDEXES_DIR, { recursive: true });
			const indexDir = path.join(INDEXES_DIR, params.name);
			if (params.rebuild !== false) await fsp.rm(indexDir, { recursive: true, force: true });
			await fsp.mkdir(indexDir, { recursive: true });

			const files: string[] = [];
			for (const src of sources) {
				if (!fs.existsSync(src)) continue;
				const stat = await fsp.stat(src);
				if (stat.isFile()) files.push(src);
				else await walkFiles(src, files);
			}

			const rows: Omit<ChunkRow, "embedding">[] = [];
			for (const file of files) {
				try {
					const content = await fsp.readFile(file, "utf8");
					const chunks = chunkText(content, chunkSize, chunkOverlap);
					const relPath = path.relative(ctx.cwd, file);
					chunks.forEach((text, i) => {
						rows.push({
							id: `${relPath}#${i}`,
							sourcePath: file,
							relPath,
							chunkIndex: i,
							text,
						});
					});
				} catch {
					// ignora arquivos inválidos
				}
			}

			const BATCH = 16;
			const withEmbeddings: ChunkRow[] = [];
			for (let i = 0; i < rows.length; i += BATCH) {
				const batch = rows.slice(i, i + BATCH);
				const embs = await embedBatch(settings, batch.map((r) => r.text), "retrieval.passage");
				batch.forEach((row, idx) => withEmbeddings.push({ ...row, embedding: embs[idx] ?? [] }));
			}

			const manifest: Manifest = {
				name: params.name,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				embeddingModel: settings.embeddingModel,
				dimension: withEmbeddings[0]?.embedding?.length ?? 0,
				chunkSize,
				chunkOverlap,
				sourcePaths: sources,
				fileCount: files.length,
				chunkCount: withEmbeddings.length,
			};

			await fsp.writeFile(path.join(indexDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
			await fsp.writeFile(path.join(indexDir, "chunks.jsonl"), withEmbeddings.map((r) => JSON.stringify(r)).join("\n"), "utf8");

			return {
				content: [{ type: "text", text: JSON.stringify({ ok: true, indexDir, ...manifest }, null, 2) }],
				details: { ok: true, indexDir, manifest },
			};
		},
	});

	pi.registerTool({
		name: "jina_index_list",
		label: "Jina Index List",
		description: "Lista índices locais da extensão jina-index.",
		parameters: Type.Object({}),
		async execute() {
			await fsp.mkdir(INDEXES_DIR, { recursive: true });
			const dirs = await fsp.readdir(INDEXES_DIR, { withFileTypes: true });
			const items = await Promise.all(
				dirs
					.filter((d) => d.isDirectory())
					.map(async (d) => {
						try {
							return await readManifest(path.join(INDEXES_DIR, d.name));
						} catch {
							return null;
						}
					}),
			);
			const indexes = items.filter(Boolean);
			return {
				content: [{ type: "text", text: JSON.stringify({ ok: true, indexes }, null, 2) }],
				details: { ok: true, indexes },
			};
		},
	});

	pi.registerTool({
		name: "jina_index_search",
		label: "Jina Index Search",
		description: "Busca semântica em índice local da extensão jina-index.",
		parameters: Type.Object({
			name: Type.String({ description: "Nome do índice." }),
			query: Type.String({ description: "Consulta." }),
			topK: Type.Optional(Type.Number()),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const settings = getSettings(ctx.cwd);
			const topK = params.topK && params.topK > 0 ? params.topK : settings.defaultTopK;
			const indexDir = path.join(INDEXES_DIR, params.name);
			const chunks = await readAllChunks(indexDir);
			const [q] = await embedBatch(settings, [params.query], "retrieval.query");
			const hits = chunks
				.map((c) => ({
					id: c.id,
					relPath: c.relPath,
					chunkIndex: c.chunkIndex,
					score: dot(q, c.embedding),
					content: c.text,
				}))
				.sort((a, b) => b.score - a.score)
				.slice(0, topK);

			return {
				content: [{ type: "text", text: JSON.stringify({ ok: true, query: params.query, hits }, null, 2) }],
				details: { ok: true, query: params.query, hits },
			};
		},
	});
}
