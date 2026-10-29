#!/usr/bin/env bash
# Re-executes ask-dev's real request builder (ASK_DEV_DIR) and fails when the committed oracle
# differs. Run with `--write` to refresh the committed file after an intended ask-dev change.
set -euo pipefail
: "${ASK_DEV_DIR:?set ASK_DEV_DIR to an ask-dev checkout}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
# The oracle is only meaningful against the ask-dev commit it is pinned to: a different checkout
# is a measurement of something else, so it fails rather than runs.
pinned="$(tr -d '[:space:]' < "$root/scripts/ask-dev-oracle/ASK_DEV_SHA")"
actual="$(git -C "$ASK_DEV_DIR" rev-parse HEAD 2>/dev/null || true)"
if [ "$actual" != "$pinned" ]; then
  echo "ask-dev checkout is at '${actual:-none}', the oracle is pinned to $pinned" >&2
  exit 1
fi
committed="$root/src/lib/ask-dev/__tests__/oracle/request-builder.cases.json"
fresh="$(mktemp)"
trap 'rm -f "$fresh"' EXIT
ORACLE_OUT="$fresh" ASK_DEV_DIR="$ASK_DEV_DIR" \
  pnpm exec vitest run -c "$root/scripts/ask-dev-oracle/vitest.oracle.config.ts"
if [ "${1:-}" = "--write" ]; then cp "$fresh" "$committed"; echo "oracle written"; exit 0; fi
diff -u "$committed" "$fresh" && echo "oracle fresh"
