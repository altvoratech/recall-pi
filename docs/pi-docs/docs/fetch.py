#!/usr/bin/env python3
"""Refresh Pi docs from pi.dev via Jina Reader (no clone needed).

Pulls each page from https://pi.dev/docs/latest/<slug> through r.jina.ai,
which renders the page server-side and returns clean markdown. Saves to
~/Downloads/zread-documents/pi/docs/coding-agent/<slug>.md, replacing the
local cache.

Strips repeated nav chrome by truncating before the first '# <title>' heading
that matches the page slug.

Usage:
  python3 fetch.py            # fetch all known slugs
  python3 fetch.py extensions # fetch a single slug
"""
import os, re, sys, time, urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent / "coding-agent"
JINA_KEY = os.environ["JINA_API_KEY"]
BASE = "https://pi.dev/docs/latest"

# Slug -> filename (slug 'index' maps to overview)
SLUGS = [
    "",                  # Overview (index.md)
    "quickstart",
    "usage",
    "providers",
    "settings",
    "keybindings",
    "sessions",
    "compaction",
    "extensions",
    "skills",
    "prompt-templates",
    "themes",
    "packages",
    "models",
    "custom-provider",
    "session-format",
    "sdk",
    "rpc",
    "json",
    "tui",
    "windows",
    "termux",
    "tmux",
    "terminal-setup",
    "shell-aliases",
    "development",
]


def fetch_markdown(slug: str) -> str:
    url = f"{BASE}/{slug}" if slug else BASE
    reader_url = f"https://r.jina.ai/{url}"
    req = urllib.request.Request(
        reader_url,
        headers={
            "Authorization": f"Bearer {JINA_KEY}",
            "Accept": "text/markdown",
            "X-Return-Format": "markdown",
            "X-Target-Selector": "main",  # skip nav/header chrome if site uses <main>
        },
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", errors="replace")


def clean(text: str, slug: str) -> str:
    # Drop the Reader preamble (Title:/URL Source:/Markdown Content:)
    text = re.sub(r"^Title:.*?\nMarkdown Content:\s*\n", "", text, count=1, flags=re.DOTALL)
    # Try to anchor at the first H1 to skip residual nav
    m = re.search(r"^# .+$", text, flags=re.MULTILINE)
    if m:
        text = text[m.start():]
    return text.strip() + "\n"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    targets = sys.argv[1:] if len(sys.argv) > 1 else SLUGS
    for slug in targets:
        out_name = ("index" if slug == "" else slug) + ".md"
        out_path = OUT / out_name
        print(f"fetching {slug or '<index>'} ...", end=" ", flush=True)
        try:
            raw = fetch_markdown(slug)
        except Exception as e:
            print(f"FAIL: {e}")
            continue
        body = clean(raw, slug)
        out_path.write_text(body, encoding="utf-8")
        print(f"-> {out_path.name} ({len(body)} chars)")
        time.sleep(0.5)


if __name__ == "__main__":
    main()
