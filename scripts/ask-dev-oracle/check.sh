#!/usr/bin/env bash
# Re-executes ask-dev's real request builder (ASK_DEV_DIR) and fails when the committed oracle
# differs. Run with `--write` to refresh the committed file after an intended ask-dev change.
set -euo pipefail
: "${ASK_DEV_DIR:?set ASK_DEV_DIR to an ask-dev checkout}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
committed="$root/src/lib/ask-dev/__tests__/oracle/request-builder.cases.json"
fresh="$(mktemp)"
trap 'rm -f "$fresh"' EXIT
ORACLE_OUT="$fresh" ASK_DEV_DIR="$ASK_DEV_DIR" \
  pnpm exec vitest run -c "$root/scripts/ask-dev-oracle/vitest.oracle.config.ts"
if [ "${1:-}" = "--write" ]; then cp "$fresh" "$committed"; echo "oracle written"; exit 0; fi
diff -u "$committed" "$fresh" && echo "oracle fresh"
