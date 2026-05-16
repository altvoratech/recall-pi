// Shared text heuristics used by multiple extensions.
// Keep these lightweight: no external deps, safe to run on every prompt.

export function normalizeText(text: string): string {
	// Strip accents so "e aí" -> "e ai", "olá" -> "ola".
	const stripped = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
	return stripped.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

const SMALL_TALK = new Set([
	"oi",
	"ola",
	"olá",
	"bom dia",
	"boa tarde",
	"boa noite",
	"e ai",
	"e aí",
	"hello",
	"hi",
	"hey",
	"opa",
	"eae",
	"fala",
	"salve",
	"yo",
	"obrigado",
	"obrigada",
	"valeu",
	"thanks",
	"thank you",
	"thx",
	"vlw",
	"ok",
	"sim",
	"nao",
	"não",
	"yes",
	"no",
	"blz",
	"beleza",
	"show",
	"perfeito",
	"certo",
	"combinado",
	"uhum",
	"tchau",
	"bye",
	"ate mais",
	"até mais",
	"ate logo",
	"até logo",
	"flw",
	"ate",
	"até",
	"goodbye",
]);

export function isSmallTalk(text: string): boolean {
	const normalized = normalizeText(text);
	if (!normalized) return true;
	if (SMALL_TALK.has(normalized)) return true;
	const words = normalized.split(" ");
	if (words.length <= 2 && SMALL_TALK.has(words.join(" "))) return true;
	return false;
}

export type ComplexityTier = "skip" | "inject" | "auto";

// ─── Lexical complexity heuristic (fallback) ──────────────────────────────
// Used when an LLM classifier cannot be used.
// Design goals:
// - conservative (avoid false-positive auto-delegation)
// - cheap (runs every prompt)
// - stable (small wording changes shouldn't flip tiers wildly)

const STRONG_COMPLEX_PHRASES_RAW = [
	// explicit repo/multi-file intent
	"repo inteiro",
	"repositorio inteiro",
	"repositório inteiro",
	"varios arquivos",
	"vários arquivos",
	"multi arquivo",
	"multi-arquivo",
	"multi file",
	"multi-file",
	"cross layer",
	"cross-layer",
	"end to end",
	"end-to-end",
	"e2e",

	// common multi-step verbs
	"refatora",
	"refatorar",
	"refactor",
	"refactoring",
	"arquitetura",
	"mapeia",
	"mapear",
	"investiga",
	"investigar",
	"audita",
	"auditar",
	"audit",
	"review",

	// risk/bug language
	"riscos",
	"ameaças",
	"threat model",
	"deadlock",
	"race condition",

	// delegation/orchestration language
	"orquestrador",
	"delegar",
	"delegacao",
	"delegação",
	"heuristica",
	"heurística",
];

// Pre-normalize once (avoid repeated normalizeText per prompt)
const STRONG_COMPLEX_PHRASES = STRONG_COMPLEX_PHRASES_RAW.map((p) => normalizeText(p)).filter(Boolean);

const COMPLEX_VERB_RE = /(investig|refator|mape|implemen|corrig|fix|debug|otimiz|revis|audit|review|migra|port|hardening|seguranc)/;

export function looksComplex(text: string): boolean {
	return lexicalComplexity(text).tier === "auto";
}

export function lexicalComplexity(
	text: string,
): { tier: ComplexityTier; score: number; reasons: string[] } {
	const raw = String(text ?? "").trim();
	if (!raw) return { tier: "skip", score: 0, reasons: ["empty"] };
	if (isSmallTalk(raw)) return { tier: "skip", score: 0, reasons: ["small_talk"] };

	const normalized = normalizeText(raw);
	const reasons: string[] = [];
	let score = 0;

	// Strong phrases: explicit multi-file/repo-wide/refactor/audit intent.
	for (const phrase of STRONG_COMPLEX_PHRASES) {
		if (normalized.includes(phrase)) {
			score += 3;
			reasons.push(`phrase:${phrase}`);
		}
	}

	// Length is a weak signal (users can write long rambles).
	const words = normalized ? normalized.split(" ") : [];
	if (words.length >= 30) {
		score += 2;
		reasons.push("long:30+");
	} else if (words.length >= 18) {
		score += 1;
		reasons.push("long:18+");
	}

	// Verbs that correlate with multi-step work.
	if (COMPLEX_VERB_RE.test(normalized)) {
		score += 1;
		reasons.push("complex_verb");
	}

	// Code-ish signals: paths, extensions, fenced blocks.
	if (/(^|\s)(\.\/|\.\.|\/)[\w./-]+/.test(raw)) {
		score += 1;
		reasons.push("path_like");
	}
	if (/```/.test(raw)) {
		score += 1;
		reasons.push("code_fence");
	}

	// Tier mapping:
	// - auto: high confidence the request benefits from delegation
	// - inject: default (show policy, but don't auto-route)
	// - skip: already handled above
	const tier: ComplexityTier = score >= 4 ? "auto" : "inject";
	return { tier, score, reasons };
}

export function lexicalComplexityTier(prompt: string): ComplexityTier {
	return lexicalComplexity(prompt).tier;
}

export function classifierWordToTier(word: string): ComplexityTier {
	const w = normalizeText(word);
	// Accept both pt-br and en variants.
	if (w.startsWith("complex")) return "auto";
	if (w.startsWith("moder")) return "inject";
	if (w.startsWith("triv") || w.startsWith("simple") || w.startsWith("easy")) return "skip";
	// Unknown classifier output: be safe and still inject policy (instead of silently skipping).
	return "inject";
}
