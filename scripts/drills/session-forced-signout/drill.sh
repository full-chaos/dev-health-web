#!/usr/bin/env bash
# Drill: web session recovery and forced sign-out (CHAOS-11234). Bound: a forced sign-out ends every web
# session of the user within 60 s (VALIDATION_INTERVAL_MS, src/lib/authValidationMemo.ts; docs/auth-system.md).
# Venue: the bigboy compose venue (web with ONE replica: the validation memo is per process, go-api,
# auth-service). Never kind, never prod. No secret, cookie or token is printed.
#
#   WEB_URL=<web base URL> API_URL=<go-api base URL> DRILL_DIR=<existing 0700 dir> TARGET_USER_ID=<uuid> \
#   bash scripts/drills/session-forced-signout/drill.sh s1|s3-down|s3-up
#
# DRILL_DIR holds three 0600 files: target.json (the user that is signed out), control.json (a second user)
# and admin.json (an org admin of the target), each {"email": ..., "password": ...}.
# Verbs (each appends to $DRILL_DIR/records/drill.txt; line 1 of each block is HEAD, its last line rc=N):
#   s1       C0 three sessions (target A and B, control C) signed in; a stale copy of A's cookie; A checked at
#            61 s; the admin deactivates the target (T0); the stale copy hits the memo 58 s after A's check;
#            at T0+61 s: A, B and the stale copy signed out (C1 bound, C2 memo hit), the pre-T0 copy of A gets
#            no session (C3 old cookie), C still signed in (C4 control).
#   s3-down  run after the operator stops auth-service: C read once more after 61 s: still signed in (C5).
#   s3-up    run after the operator starts auth-service: C read after 61 s with the same jar: signed in,
#            no cookie cleared, no new sign-in (C6).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
web_root="$(cd "$here/../../.." && pwd)"
: "${WEB_URL:?set WEB_URL}"
: "${DRILL_DIR:?set DRILL_DIR (an existing 0700 directory)}"
[ -d "$DRILL_DIR" ] && [ "$(stat -c %a "$DRILL_DIR")" = 700 ] || { echo "DRILL_DIR must be an existing 0700 directory" >&2; exit 2; }
umask 077
export WEB_URL
jars="$DRILL_DIR/jars"
rec="$DRILL_DIR/records/drill.txt"
mkdir -p "$jars" "$DRILL_DIR/records"
drill() { (cd "$web_root" && node_modules/.bin/tsx scripts/drills/session-forced-signout/drill.ts "$@"); }
failed=0
say() { printf '%s\n' "$*" | tee -a "$rec"; }
cell() { # cell NAME WANT_SIGNED_IN JAR
    local line
    line="$(drill read "$3")"
    if grep -q "signed_in=$2 " <<<"$line"; then say "PASS: $1 $line t=$(date -u +%T)"; else say "FAIL: $1 $line t=$(date -u +%T)"; failed=1; fi
}
sleep_until() { local wait=$(($1 - $(date +%s))); [ "$wait" -le 0 ] || sleep "$wait"; }

s1() {
    : "${API_URL:?set API_URL}"
    : "${TARGET_USER_ID:?set TARGET_USER_ID}"
    export API_URL
    local login_at checked_at t0
    login_at="$(date +%s)"
    say "$(drill login "$DRILL_DIR/target.json" "$jars/a.json") jar=a"
    drill copy "$jars/a.json" "$jars/stale.json"
    say "$(drill login "$DRILL_DIR/target.json" "$jars/b.json") jar=b"
    say "$(drill login "$DRILL_DIR/control.json" "$jars/c.json") jar=c"
    cell c0-a-signed-in 1 "$jars/a.json"
    cell c0-b-signed-in 1 "$jars/b.json"
    cell c0-c-signed-in 1 "$jars/c.json"
    sleep_until $((login_at + 61))
    checked_at="$(date +%s)"
    cell c1-a-checked-at-61s 1 "$jars/a.json"
    drill copy "$jars/a.json" "$jars/a-pre.json"
    say "$(drill deactivate "$DRILL_DIR/admin.json" "$TARGET_USER_ID")"
    t0="$(date +%s)"
    say "T0 deactivated_after_check_s=$((t0 - checked_at))"
    sleep_until $((checked_at + 58))
    cell c2-stale-copy-memo-hit-still-in 1 "$jars/stale.json"
    sleep_until $((t0 + 61))
    cell c1-a-signed-out-within-60s 0 "$jars/a.json"
    cell c1-b-signed-out-within-60s 0 "$jars/b.json"
    cell c2-stale-copy-signed-out-within-60s 0 "$jars/stale.json"
    cell c3-pre-t0-cookie-gets-no-session 0 "$jars/a-pre.json"
    cell c4-control-still-signed-in 1 "$jars/c.json"
}

s3_down() {
    sleep 61
    cell c5-auth-service-down-session-kept 1 "$jars/c.json"
}

s3_up() {
    sleep 61
    cell c6-auth-service-back-same-cookie 1 "$jars/c.json"
}

verb="${1:-}"
case "$verb" in
    s1 | s3-down | s3-up) ;;
    *) echo "verbs: s1 | s3-down | s3-up" >&2; exit 2 ;;
esac
say "HEAD=$(git -C "$web_root" rev-parse HEAD) verb=$verb web_image=${WEB_IMAGE:-unset} start=$(date -u +%FT%TZ)"
case "$verb" in
    s1) s1 ;;
    s3-down) s3_down ;;
    s3-up) s3_up ;;
esac
say "rc=$failed"
exit "$failed"
