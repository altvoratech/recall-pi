#!/usr/bin/env bash

# Create ~/.pi/agent/settings.json from project .pi/settings.json if not present
set -euo pipefail

PROJECT_SETTINGS="$(pwd)/.pi/settings.json"
GLOBAL_DIR="$HOME/.pi/agent"
GLOBAL_FILE="$GLOBAL_DIR/settings.json"

if [ ! -f "$PROJECT_SETTINGS" ]; then
  echo "Project .pi/settings.json not found: $PROJECT_SETTINGS"
  exit 1
fi

mkdir -p "$GLOBAL_DIR"

if [ -f "$GLOBAL_FILE" ]; then
  echo "Global settings already exist at $GLOBAL_FILE — leaving untouched"
  exit 0
fi

cp "$PROJECT_SETTINGS" "$GLOBAL_FILE"
chmod 600 "$GLOBAL_FILE"

echo "Created $GLOBAL_FILE from project .pi/settings.json"