<p align="center">
  <a href="https://pi.dev">
    <img alt="logo pi" src="https://pi.dev/logo-auto.svg" width="128">
  </a>
</p>
<p align="center">
  <a href="https://discord.com/invite/3cU7Bz4UPx"><img alt="Discord" src="https://img.shields.io/badge/discord-community-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
</p>
<p align="center">
  <a href="https://pi.dev">pi.dev</a> domínio gentilmente doado por
  <br /><br />
  <a href="https://exe.dev"><img src="packages/coding-agent/docs/images/exy.png" alt="Mascote Exy" width="48" /><br />exe.dev</a>
</p>

> Novas issues e PRs de novos colaboradores são fechados automaticamente por padrão. Os mantenedores revisam as issues fechadas automaticamente diariamente. Veja [CONTRIBUTING.md](CONTRIBUTING.md).

---

# Pi Agent Harness Mono Repo

Este é o repositório do projeto pi agent harness, incluindo nosso agente de programação auto-extensível.

* **[@earendil-works/pi-coding-agent](packages/coding-agent)**: CLI interativo do agente de programação
* **[@earendil-works/pi-agent-core](packages/agent)**: Runtime do agente com chamada de ferramentas e gerenciamento de estado
* **[@earendil-works/pi-ai](packages/ai)**: API LLM unificada multi-provedor (OpenAI, Anthropic, Google, …)

Para saber mais sobre o pi:

* [Visite pi.dev](https://pi.dev), o site do projeto com demonstrações
* [Leia a documentação](https://pi.dev/docs/latest), ou peça ao agente que se explique

## Compartilhe suas sessões de agente OSS

Se você usa o pi ou outros agentes de programação para trabalho em código aberto, por favor compartilhe suas sessões.

Dados públicos de sessões OSS ajudam a melhorar os agentes de programação com tarefas reais, uso de ferramentas, falhas e correções, em vez de benchmarks artificiais.

Para a explicação completa, veja [este post no X](https://x.com/badlogicgames/status/2037811643774652911).

Para publicar sessões, use [`badlogic/pi-share-hf`](https://github.com/badlogic/pi-share-hf). Leia o README.md para instruções de configuração. Tudo que você precisa é de uma conta no Hugging Face, o CLI do Hugging Face e o `pi-share-hf`.

Você também pode assistir [este vídeo](https://x.com/badlogicgames/status/2041151967695634619), onde mostro como publico minhas sessões do `pi-mono`.

Publico regularmente minhas próprias sessões de trabalho do `pi-mono` aqui:

- [badlogicgames/pi-mono no Hugging Face](https://huggingface.co/datasets/badlogicgames/pi-mono)

## Todos os Pacotes

| Pacote | Descrição |
|--------|-----------|
| **[@earendil-works/pi-ai](packages/ai)** | API LLM unificada multi-provedor (OpenAI, Anthropic, Google, etc.) |
| **[@earendil-works/pi-agent-core](packages/agent)** | Runtime do agente com chamada de ferramentas e gerenciamento de estado |
| **[@earendil-works/pi-coding-agent](packages/coding-agent)** | CLI interativo do agente de programação |
| **[@earendil-works/pi-tui](packages/tui)** | Biblioteca de UI para terminal com renderização diferencial |
| **[@earendil-works/pi-web-ui](packages/web-ui)** | Componentes web para interfaces de chat com IA |

Para automação de Slack/chat e fluxos de trabalho, veja [earendil-works/pi-chat](https://github.com/earendil-works/pi-chat).

## Contribuindo

Veja [CONTRIBUTING.md](CONTRIBUTING.md) para diretrizes de contribuição e [AGENTS.md](AGENTS.md) para regras específicas do projeto (para humanos e agentes).

## Desenvolvimento

```bash
npm install          # Instalar todas as dependências
npm run build        # Compilar todos os pacotes
npm run check        # Lint, formatação e verificação de tipos
./test.sh            # Executar testes (pula testes dependentes de LLM sem chaves de API)
./pi-test.sh         # Executar pi a partir do código-fonte (pode ser executado de qualquer diretório)
```

> **Nota:** `npm run check` requer que `npm run build` seja executado primeiro. O pacote web-ui usa `tsc` que precisa dos arquivos `.d.ts` compilados das dependências.

## Licença

MIT
