# Configuração do tmux

O Pi funciona dentro do tmux, mas por padrão o tmux remove informações de modificadores de certas teclas. Sem configuração, `Shift+Enter` e `Ctrl+Enter` geralmente são indistinguíveis de um `Enter` simples.

## Configuração Recomendada

Adicione ao `~/.tmux.conf`:

```tmux
set -g extended-keys on
set -g extended-keys-format csi-u
```

Em seguida, reinicie o tmux completamente:

```bash
tmux kill-server
tmux
```

O Pi solicita o relatório estendido de teclas automaticamente quando o protocolo de teclado Kitty não está disponível. Com `extended-keys-format csi-u`, o tmux encaminha as teclas modificadas no formato CSI-u, que é a configuração mais confiável.

## Por que `csi-u` é Recomendado

Usando apenas:

```tmux
set -g extended-keys on
```

o tmux usa por padrão `extended-keys-format xterm`. Quando uma aplicação solicita o relatório estendido de teclas, as teclas modificadas são encaminhadas no formato `modifyOtherKeys` do xterm, como:

- `Ctrl+C` → `\x1b[27;5;99~`
- `Ctrl+D` → `\x1b[27;5;100~`
- `Ctrl+Enter` → `\x1b[27;5;13~`

Com `extended-keys-format csi-u`, as mesmas teclas são encaminhadas como:

- `Ctrl+C` → `\x1b[99;5u`
- `Ctrl+D` → `\x1b[100;5u`
- `Ctrl+Enter` → `\x1b[13;5u`

O Pi suporta ambos os formatos, mas `csi-u` é a configuração recomendada para o tmux.

## O que Isso Corrige

Sem as teclas estendidas do tmux, as teclas Enter modificadas colapsam para sequências legadas:

| Tecla | Sem extkeys | Com `csi-u` |
|-------|-------------|-------------|
| Enter | `\r` | `\r` |
| Shift+Enter | `\r` | `\x1b[13;2u` |
| Ctrl+Enter | `\r` | `\x1b[13;5u` |
| Alt/Option+Enter | `\x1b\r` | `\x1b[13;3u` |

Isso afeta os atalhos padrão (`Enter` para enviar, `Shift+Enter` para nova linha) e quaisquer atalhos personalizados que usem Enter modificado.

## Requisitos

- tmux 3.2 ou posterior (execute `tmux -V` para verificar)
- Um emulador de terminal que suporte teclas estendidas (Ghostty, Kitty, iTerm2, WezTerm, Windows Terminal)
