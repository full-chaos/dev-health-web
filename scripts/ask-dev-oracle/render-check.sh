#!/usr/bin/env bash
# The E8 render-shape differential oracle (CHAOS-11941): executes ask-dev's real verifier modules
# (ASK_DEV_DIR, at the pinned commit) beside web's ports in three time zones. Always a fresh run (a
# vitest run has no result cache); FAILS, never skips, on a missing or wrong checkout.
set -euo pipefail
: "${ASK_DEV_DIR:?set ASK_DEV_DIR to an ask-dev checkout}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
pinned="$(tr -d '[:space:]' < "$root/scripts/ask-dev-oracle/ASK_DEV_SHA")"
actual="$(git -C "$ASK_DEV_DIR" rev-parse HEAD 2>/dev/null || true)"
if [ "$actual" != "$pinned" ]; then
  echo "ask-dev checkout is at '${actual:-none}', the oracle is pinned to $pinned" >&2
  exit 1
fi
out="${ORACLE_REPORT_DIR:-$(mktemp -d)}"
mkdir -p "$out"
for tz in UTC Asia/Tokyo America/Los_Angeles; do
  echo "== TZ=$tz"
  TZ="$tz" ORACLE_REPORT="$out/report-${tz//\//_}.json" ASK_DEV_DIR="$ASK_DEV_DIR" \
    pnpm exec vitest run -c "$root/scripts/ask-dev-oracle/vitest.render-oracle.config.ts"
done
echo "oracle reports: $out"
