# jina-index

Extensão Pi para indexar e buscar documentação local com Jina (TS, sem Python).

## Tools
- `jina_index_build`
- `jina_index_list`
- `jina_index_search`

## Storage temporário
- `extensions/jina-index/_indexes/<nome>/manifest.json`
- `extensions/jina-index/_indexes/<nome>/chunks.jsonl`

## Config
Em `~/.pi/agent/settings.json` (opcional):

```json
{
  "jinaIndex": {
    "apiKeyEnv": "JINA_API_KEY",
    "embeddingModel": "jina-embeddings-v5-text-small",
    "rerankModel": "jina-reranker-v3",
    "baseUrl": "https://api.jina.ai/v1",
    "chunkSize": 1200,
    "chunkOverlap": 200,
    "defaultTopK": 5
  }
}
```

Se `apiKey` não estiver no settings, usa `process.env[apiKeyEnv]`.
