#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

echo "Setting up git hooks..."
git config core.hooksPath "$REPO_DIR/.githooks"
chmod +x "$REPO_DIR/.githooks"/*
echo "Git hooks installed. Using .githooks/ directory."
