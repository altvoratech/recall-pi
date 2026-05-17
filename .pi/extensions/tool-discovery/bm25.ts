/**
 * BM25 ranking — okapi BM25 puro, in-memory, sem dependências externas.
 *
 * Uso típico:
 *   const index = buildIndex(docs, doc => `${doc.name} ${doc.summary}`);
 *   const top = search(index, "query", { limit: 8 });
 */

const BM25_K1 = 1.5;
const BM25_B = 0.75;

const STOPWORDS = new Set([
	"the", "a", "an", "and", "or", "but", "if", "then", "to", "of", "in", "on",
	"at", "by", "for", "with", "from", "as", "is", "are", "was", "were", "be",
	"been", "being", "do", "does", "did", "have", "has", "had", "this", "that",
	"these", "those", "it", "its", "i", "you", "he", "she", "we", "they",
	"de", "da", "do", "das", "dos", "e", "ou", "se", "para", "com", "por",
	"em", "no", "na", "nos", "nas", "que", "qual", "como", "um", "uma",
	"uns", "umas", "o", "os", "as", "ao", "aos",
]);

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^\w\s]+/g, " ")
		.split(/\s+/)
		.filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export interface IndexedDoc<TDoc> {
	doc: TDoc;
	tf: Map<string, number>;
	length: number;
}

export interface BM25Index<TDoc> {
	docs: IndexedDoc<TDoc>[];
	df: Map<string, number>; // document frequency per term
	avgLength: number;
}

export function buildIndex<TDoc>(docs: TDoc[], textOf: (doc: TDoc) => string): BM25Index<TDoc> {
	const indexed: IndexedDoc<TDoc>[] = docs.map((doc) => {
		const tokens = tokenize(textOf(doc));
		const tf = new Map<string, number>();
		for (const token of tokens) {
			tf.set(token, (tf.get(token) ?? 0) + 1);
		}
		return { doc, tf, length: tokens.length };
	});

	const df = new Map<string, number>();
	for (const entry of indexed) {
		for (const term of entry.tf.keys()) {
			df.set(term, (df.get(term) ?? 0) + 1);
		}
	}

	const totalLength = indexed.reduce((sum, e) => sum + e.length, 0);
	const avgLength = indexed.length > 0 ? totalLength / indexed.length : 0;

	return { docs: indexed, df, avgLength };
}

export interface SearchHit<TDoc> {
	doc: TDoc;
	score: number;
}

export interface SearchOptions {
	limit?: number;
	minScore?: number;
}

export function search<TDoc>(
	index: BM25Index<TDoc>,
	query: string,
	opts: SearchOptions = {},
): SearchHit<TDoc>[] {
	const limit = opts.limit ?? 8;
	const minScore = opts.minScore ?? 0;
	const queryTerms = tokenize(query);
	if (queryTerms.length === 0 || index.docs.length === 0) return [];

	const N = index.docs.length;
	const hits: SearchHit<TDoc>[] = [];

	for (const entry of index.docs) {
		let score = 0;
		for (const term of queryTerms) {
			const tf = entry.tf.get(term);
			if (!tf) continue;
			const df = index.df.get(term) ?? 0;
			// Okapi BM25 IDF (with +1 to avoid negatives on very common terms)
			const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
			const numerator = tf * (BM25_K1 + 1);
			const denominator = tf + BM25_K1 * (1 - BM25_B + BM25_B * (entry.length / (index.avgLength || 1)));
			score += idf * (numerator / denominator);
		}
		if (score > minScore) hits.push({ doc: entry.doc, score });
	}

	hits.sort((a, b) => b.score - a.score);
	return hits.slice(0, limit);
}
