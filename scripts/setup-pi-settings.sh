#!/usr/bin/env bash

# WARNING: DO NOT USE recall-pi AS GLOBAL PI SETUP.
#
# This repo is meant to run as a project (project-local) with `.pi/extensions` and `.pi/prompts`.
# Installing it as global config can cause confusing behavior across unrelated directories.
#
# If you really want a global setup, do it explicitly in your own dotfiles and accept the tradeoffs.

set -euo pipefail

cat <<'MSG'

=====================================================================
  DO NOT USE recall-pi AS GLOBAL PI SETUP

  This script has been disabled on purpose.

  Why:
  - recall-pi is designed to run project-locally
  - global install affects every cwd and can break expectations

  What to do instead:
  - run Pi from inside this repo:  cd ~/recall-pi && pi
  - or copy only the specific settings you want into ~/.pi/agent/settings.json

=====================================================================

MSG

exit 1
