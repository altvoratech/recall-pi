/**
 * trace-recorder — resolução de caminhos do harness.
 *
 * NOTA: este módulo vive em .pi/extensions/trace-recorder/, um nível mais
 * fundo que o antigo .pi/extensions/trace-recorder.ts. Por isso o resolve
 * sobe TRÊS níveis (trace-recorder → extensions → .pi → raiz do pacote),
 * um a mais que a versão single-file.
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url)); // .pi/extensions/trace-recorder
export const PACKAGE_ROOT = resolve(MODULE_DIR, "..", "..", ".."); // raiz do pacote (recall-pi)

export function getRunsRoot(): string {
	return join(PACKAGE_ROOT, ".pi", "harness", "runs");
}

export function getIndexPath(): string {
	return join(getRunsRoot(), "index.jsonl");
}
