# Shell Aliases

O Pi executa o bash em modo não-interativo (`bash -c`), que não expande aliases por padrão.

Para habilitar seus shell aliases, adicione ao `~/.pi/agent/settings.json`:

```json
{
  "shellCommandPrefix": "shopt -s expand_aliases\neval \"$(grep '^alias ' ~/.zshrc)\""
}
```

Ajuste o caminho (`~/.zshrc`, `~/.bashrc`, etc.) para corresponder à configuração do seu shell.
