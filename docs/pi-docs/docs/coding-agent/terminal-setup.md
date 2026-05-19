# Configuração de Terminal

O pi usa o [protocolo de teclado Kitty](https://sw.kovidgoyal.net/kitty/keyboard-protocol/) para detecção confiável de teclas modificadoras. A maioria dos terminais modernos suporta esse protocolo, mas alguns requerem configuração.

## Kitty, iTerm2

Funcionam sem configuração adicional.

## Ghostty

Adicione à sua configuração do Ghostty (`~/Library/Application Support/com.mitchellh.ghostty/config` no macOS, `~/.config/ghostty/config` no Linux):

```
keybind = alt+backspace=text:\x1b\x7f
```

Versões mais antigas do Claude Code podem ter adicionado este mapeamento ao Ghostty:

```
keybind = shift+enter=text:\n
```

Esse mapeamento envia um byte de avanço de linha bruto. Dentro do pi, isso é indistinguível de `Ctrl+J`, portanto o tmux e o pi não conseguem mais identificar um evento real de tecla `shift+enter`.

Se o Claude Code 2.x ou mais recente for o único motivo pelo qual você adicionou esse mapeamento, você pode removê-lo, a menos que queira usar o Claude Code no tmux, onde ele ainda requer esse mapeamento do Ghostty.

Se quiser que `Shift+Enter` continue funcionando no tmux via esse remapeamento, adicione `ctrl+j` ao keybinding `newLine` do pi em `~/.pi/agent/keybindings.json`:

```json
{
  "newLine": ["shift+enter", "ctrl+j"]
}
```

## WezTerm

Crie `~/.wezterm.lua`:

```lua
local wezterm = require 'wezterm'
local config = wezterm.config_builder()
config.enable_kitty_keyboard = true
return config
```

## VS Code (Terminal Integrado)

Localizações do `keybindings.json`:
- macOS: `~/Library/Application Support/Code/User/keybindings.json`
- Linux: `~/.config/Code/User/keybindings.json`
- Windows: `%APPDATA%\\Code\\User\\keybindings.json`

Adicione ao `keybindings.json` para habilitar `Shift+Enter` para entrada em múltiplas linhas:

```json
{
  "key": "shift+enter",
  "command": "workbench.action.terminal.sendSequence",
  "args": { "text": "[13;2u" },
  "when": "terminalFocus"
}
```

## Windows Terminal

Adicione ao `settings.json` (Ctrl+Shift+, ou Configurações → Abrir arquivo JSON) para encaminhar as teclas Enter modificadas que o pi usa:

```json
{
  "actions": [
    {
      "command": { "action": "sendInput", "input": "[13;2u" },
      "keys": "shift+enter"
    },
    {
      "command": { "action": "sendInput", "input": "[13;3u" },
      "keys": "alt+enter"
    }
  ]
}
```

- `Shift+Enter` insere uma nova linha.
- O Windows Terminal vincula `Alt+Enter` à tela cheia por padrão. Isso impede que o pi receba `Alt+Enter` para enfileirar mensagens de acompanhamento.
- Remapear `Alt+Enter` para `sendInput` encaminha a combinação de teclas real ao pi.

Se você já tiver um array `actions`, adicione os objetos a ele. Se o comportamento antigo de tela cheia persistir, feche e reabra o Windows Terminal completamente.

## xfce4-terminal, terminator

Esses terminais têm suporte limitado a sequências de escape. Teclas Enter modificadas como `Ctrl+Enter` e `Shift+Enter` não podem ser diferenciadas de um `Enter` simples, impedindo que keybindings personalizados como `submit: ["ctrl+enter"]` funcionem.

Para a melhor experiência, use um terminal que suporte o protocolo de teclado Kitty:
- [Kitty](https://sw.kovidgoyal.net/kitty/)
- [Ghostty](https://ghostty.org/)
- [WezTerm](https://wezfurlong.org/wezterm/)
- [iTerm2](https://iterm2.com/)
- [Alacritty](https://github.com/alacritty/alacritty) (requer compilação com suporte ao protocolo Kitty)

## IntelliJ IDEA (Terminal Integrado)

O terminal integrado tem suporte limitado a sequências de escape. Shift+Enter não pode ser diferenciado de Enter no terminal do IntelliJ.

Se quiser que o cursor de hardware fique visível, defina `PI_HARDWARE_CURSOR=1` antes de executar o pi (desabilitado por padrão para compatibilidade).

Considere usar um emulador de terminal dedicado para a melhor experiência.
