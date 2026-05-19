/**
 * Domínio compaction (consolidado).
 *
 * Unifica as 3 peças antes espalhadas (2 soltas + 1 dir):
 * - custom.ts    custom-compaction: resumo cumulativo via summarizer
 * - trigger.ts   comando manual /trigger-compact
 * - snapshot.ts  persiste o summary cumulativo em disco (cache efêmero)
 *
 * Carregam juntas como um único subsistema de compaction.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCustomCompaction } from "./custom.ts";
import { registerTriggerCompact } from "./trigger.ts";
import { registerCompactionSnapshot } from "./snapshot.ts";

export default function (pi: ExtensionAPI) {
	registerCustomCompaction(pi);
	registerTriggerCompact(pi);
	registerCompactionSnapshot(pi);
}
