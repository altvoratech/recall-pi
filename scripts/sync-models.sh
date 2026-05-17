#!/usr/bin/env bash
set -euo pipefail

# Sync recall-pi model templates into Pi global models.json.
# - Merges providers from ./models.template.json into ~/.pi/agent/models.json
# - Does NOT write secrets into the repo; you must fill apiKey locally.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE="$REPO_ROOT/models.template.json"
TARGET_DIR="$HOME/.pi/agent"
TARGET="$TARGET_DIR/models.json"

mkdir -p "$TARGET_DIR"

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required for sync-models.sh" >&2
  exit 1
fi

if [ ! -f "$TEMPLATE" ]; then
  echo "Error: template not found: $TEMPLATE" >&2
  exit 1
fi

if [ ! -f "$TARGET" ]; then
  cat > "$TARGET" <<'EOF'
{ "providers": {} }
EOF
  chmod 600 "$TARGET" || true
fi

tmp="$(mktemp)"

# Merge template.providers into target.providers (template wins for provider definitions)
jq -s '
  def obj(x): (x // {});
  obj(.[0]) as $dst |
  obj(.[1]) as $src |
  {
    providers: (obj($dst.providers) * obj($src.providers))
  }
' "$TARGET" "$TEMPLATE" > "$tmp"

mv "$tmp" "$TARGET"
chmod 600 "$TARGET" || true

echo "Synced providers from $TEMPLATE into $TARGET"
echo "Next: edit $TARGET and set apiKey for the providers you want (e.g. providers.kilo.apiKey)."
