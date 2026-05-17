#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SETTINGS_DIR="$HOME/.pi/agent"
SETTINGS_FILE="$SETTINGS_DIR/settings.json"

mkdir -p "$SETTINGS_DIR"

if [[ -f "$SETTINGS_FILE" ]]; then
  cp "$SETTINGS_FILE" "$SETTINGS_FILE.bak.$(date +%Y%m%d-%H%M%S)"
else
  echo "{}" > "$SETTINGS_FILE"
fi

node - "$SETTINGS_FILE" "$REPO_ROOT" <<'NODE'
const fs = require('fs');

const [settingsPath, repoRoot] = process.argv.slice(2);
let settings = {};

try {
  const raw = fs.readFileSync(settingsPath, 'utf8').trim();
  settings = raw ? JSON.parse(raw) : {};
} catch {
  settings = {};
}

if (!Array.isArray(settings.packages)) settings.packages = [];
if (!settings.packages.includes(repoRoot)) settings.packages.push(repoRoot);

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
console.log(`Added package: ${repoRoot}`);
console.log(`Updated: ${settingsPath}`);
NODE

cat <<MSG

Pronto.
- O pacote recall-pi foi adicionado em ~/.pi/agent/settings.json -> packages
- Rode /reload no Pi para recarregar

MSG
