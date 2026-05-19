# Desenvolvimento

Consulte [AGENTS.md](../../../AGENTS.md) para diretrizes adicionais.

## Configuração

```bash
git clone https://github.com/earendil-works/pi-mono
cd pi-mono
npm install
npm run build
```

Executar a partir do código-fonte:

```bash
/path/to/pi-mono/pi-test.sh
```

O script pode ser executado a partir de qualquer diretório. O Pi mantém o diretório de trabalho atual do chamador.

## Fork / Rebranding

Configure via `package.json`:

```json
{
  "piConfig": {
    "name": "pi",
    "configDir": ".pi"
  }
}
```

Altere `name`, `configDir` e o campo `bin` para o seu fork. Afeta o banner da CLI, os caminhos de configuração e os nomes das variáveis de ambiente.

## Resolução de Caminhos

Três modos de execução: instalação via npm, binário standalone, tsx a partir do código-fonte.

**Sempre use `src/config.ts`** para assets do pacote:

```typescript
import { getPackageDir, getThemeDir } from "./config.js";
```

Nunca use `__dirname` diretamente para assets do pacote.

## Comando de Debug

`/debug` (oculto) escreve em `~/.pi/agent/pi-debug.log`:
- Linhas renderizadas da TUI com códigos ANSI
- Últimas mensagens enviadas ao LLM

## Testes

```bash
./test.sh                         # Executa testes sem LLM (sem necessidade de chaves de API)
npm test                          # Executa todos os testes
npm test -- test/specific.test.ts # Executa um teste específico
```

## Estrutura do Projeto

```
packages/
  ai/           # Abstração de provedores LLM
  agent/        # Loop do agente e tipos de mensagem
  tui/          # Componentes de interface de terminal
  coding-agent/ # CLI e modo interativo
```
