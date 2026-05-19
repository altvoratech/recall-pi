# Configuração do Termux (Android)

O pi roda no Android via [Termux](https://termux.dev/), um emulador de terminal e ambiente Linux para Android.

## Pré-requisitos

1. Instale o [Termux](https://github.com/termux/termux-app#installation) pelo GitHub ou F-Droid (não pelo Google Play, pois essa versão está descontinuada)
2. Instale o [Termux:API](https://github.com/termux/termux-api#installation) pelo GitHub ou F-Droid para área de transferência e outras integrações com o dispositivo

## Instalação

```bash
# Atualizar pacotes
pkg update && pkg upgrade

# Instalar dependências
pkg install nodejs termux-api git

# Instalar o pi
npm install -g @earendil-works/pi-coding-agent

# Criar diretório de configuração
mkdir -p ~/.pi/agent

# Executar o pi
pi
```

## Suporte à Área de Transferência

As operações de área de transferência usam `termux-clipboard-set` e `termux-clipboard-get` quando executadas no Termux. O aplicativo Termux:API precisa estar instalado para que funcionem.

A área de transferência de imagens não é suportada no Termux (o recurso de colar imagem com `ctrl+v` não funcionará).

## Exemplo de AGENTS.md para Termux

Crie `~/.pi/agent/AGENTS.md` para ajudar o agente a entender o ambiente Termux:

```markdown
# Agent Environment: Termux on Android

## Location
- **OS**: Android (Termux terminal emulator)
- **Home**: `/data/data/com.termux/files/home`
- **Prefix**: `/data/data/com.termux/files/usr`
- **Shared storage**: `/storage/emulated/0` (Downloads, Documents, etc.)

## Opening URLs
```bash
termux-open-url "https://example.com"
```

## Opening Files
```bash
termux-open file.pdf          # Abre com o aplicativo padrão
termux-open --chooser image.jpg      # Escolher aplicativo
```

## Clipboard
```bash
termux-clipboard-set "text"   # Copiar
termux-clipboard-get          # Colar
```

## Notifications
```bash
termux-notification -t "Title" -c "Content"
```

## Device Info
```bash
termux-battery-status         # Informações da bateria
termux-wifi-connectioninfo    # Informações do WiFi
termux-telephony-deviceinfo   # Informações do dispositivo
```

## Sharing
```bash
termux-share -a send file.txt # Compartilhar arquivo
```

## Other Useful Commands
```bash
termux-toast "message"        # Notificação rápida em toast
termux-vibrate                # Vibrar o dispositivo
termux-tts-speak "hello"      # Texto para fala
termux-camera-photo out.jpg   # Tirar foto
```

## Notes
- O aplicativo Termux:API deve estar instalado para os comandos `termux-*`
- Use `pkg install termux-api` para as ferramentas de linha de comando
- Permissão de armazenamento necessária para acesso a `/storage/emulated/0`
```

## Limitações

- **Sem área de transferência de imagens**: a API de área de transferência do Termux suporta apenas texto
- **Sem binários nativos**: algumas dependências nativas opcionais (como o módulo de área de transferência) não estão disponíveis no Android ARM64 e são ignoradas durante a instalação
- **Acesso ao armazenamento**: para acessar arquivos em `/storage/emulated/0` (Downloads etc.), execute `termux-setup-storage` uma vez para conceder as permissões

## Solução de Problemas

### Área de transferência não funciona

Certifique-se de que ambos os aplicativos estão instalados:
1. Termux (pelo GitHub ou F-Droid)
2. Termux:API (pelo GitHub ou F-Droid)

Em seguida, instale as ferramentas de CLI:
```bash
pkg install termux-api
```

### Permissão negada para armazenamento compartilhado

Execute uma vez para conceder permissões de armazenamento:
```bash
termux-setup-storage
```

### Problemas na instalação do Node.js

Se o npm falhar, tente limpar o cache:
```bash
npm cache clean --force
```
