# Configuração no Windows

O Pi requer um shell bash no Windows. Locais verificados (em ordem):

1. Caminho personalizado em `~/.pi/agent/settings.json`
2. Git Bash (`C:\Program Files\Git\bin\bash.exe`)
3. `bash.exe` no PATH (Cygwin, MSYS2, WSL)

Para a maioria dos usuários, o [Git for Windows](https://git-scm.com/download/win) é suficiente.

## Caminho de Shell Personalizado

```json
{
  "shellPath": "C:\\cygwin64\\bin\\bash.exe"
}
```
