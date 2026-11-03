#!/usr/bin/env bash
# Drill: web assertion signing key rotation against a real acr-api (CHAOS-11236).
# Venue: the bigboy k3s, one own namespace. Never kind, never prod. No secret is printed.
#
#   KUBECONFIG=/etc/rancher/k3s/k3s.yaml DRILL_NS=w11-<id>-<n> DRILL_DIR=<0700 dir> \
#   ACR_IMAGE=ghcr.io/full-chaos/dev-health-acr/acr-api@sha256:<64 hex> \
#   bash scripts/drills/assertion-key-rotation/drill.sh run
#
# Verbs: setup (namespace, stack, migrations), cells (the drill), teardown (delete the namespace), run (all three).
# The acr-api image must carry the per-key retire_after check (acr CHAOS-12380) and be on the node already.
# Cells (a kid is "accepted" when acr does not answer 401, and the seeded packet read answers 200; refused = 401):
#   C0 only the old key in the JWKS: old accepted, new refused (the runbook adds the new key first)
#   C1 old (retire_after = now+OVERLAP) and new in the JWKS: both kids accepted inside the overlap
#   C2 after retire_after: old refused, new accepted
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
web_root="$(cd "$here/../../.." && pwd)"
: "${KUBECONFIG:?set KUBECONFIG explicitly}"
: "${DRILL_NS:?set DRILL_NS}"
: "${DRILL_DIR:?set DRILL_DIR (an existing 0700 directory)}"
: "${ACR_IMAGE:?set ACR_IMAGE (digest form)}"
OVERLAP_SECONDS="${OVERLAP_SECONDS:-60}"
LOCAL_PORT="${LOCAL_PORT:-18236}"
umask 077
export KUBECONFIG
k() { kubectl -n "$DRILL_NS" "$@"; }
drill() { (cd "$web_root" && node_modules/.bin/tsx --conditions react-server scripts/drills/assertion-key-rotation/drill.ts "$@"); }
keys="$DRILL_DIR/keys"
sec="$DRILL_DIR/sec"

setup() {
    mkdir -p "$keys" "$sec"
    kubectl get ns "$DRILL_NS" >/dev/null 2>&1 || kubectl create ns "$DRILL_NS" >/dev/null
    echo "ns=$DRILL_NS created"
    # Pull secret by pipe only; never printed.
    kubectl -n acr-trial-data get secret ghcr-pull -o json |
        jq '{apiVersion,kind,type,data,metadata:{name:.metadata.name}}' | k apply -f - >/dev/null
    local f
    for f in pg-admin pg-runtime ch-pass ent-token; do
        [ -e "$sec/$f" ] || head -c 24 /dev/urandom | base64 | tr -d '/+=\n' >"$sec/$f"
    done
    [ -e "$sec/evid" ] || head -c 32 /dev/urandom | base64 >"$sec/evid"
    # The first JWKS holds the old key only: acr-api refuses an empty key set at start.
    drill keygen "$keys" kid-old
    drill keygen "$keys" kid-new
    drill jwks "$DRILL_DIR/web-jwks.json" "kid-old=$keys/kid-old.x"
    k create configmap jwks-seed --from-file=web-jwks.json="$DRILL_DIR/web-jwks.json" --dry-run=client -o yaml | k apply -f - >/dev/null
    k create secret generic stack-secrets --from-file=pg-admin="$sec/pg-admin" --from-file=pg-runtime="$sec/pg-runtime" \
        --from-file=ent-token="$sec/ent-token" --from-file=ch-pass="$sec/ch-pass" --from-file=evid="$sec/evid" \
        --dry-run=client -o yaml | k apply -f - >/dev/null
    sed "s#ghcr.io/full-chaos/dev-health-acr/acr-api@sha256:[0-9a-f]*#$ACR_IMAGE#" "$here/stack.yaml" | k apply -f - >/dev/null
    local i
    for i in $(seq 1 30); do
        k exec stack -c postgres -- pg_isready -U postgres -d acr -h 127.0.0.1 >/dev/null 2>&1 && break
        sleep 4
    done
    printf "CREATE ROLE acr_runtime LOGIN PASSWORD '%s';\nGRANT ALL ON DATABASE acr TO acr_runtime;\n" "$(cat "$sec/pg-runtime")" |
        k exec -i stack -c postgres -- psql -U postgres -d acr -v ON_ERROR_STOP=1 -q
    k exec -i stack -c clickhouse -- sh -c 'clickhouse-client --user ch --password "$CLICKHOUSE_PASSWORD" --multiquery' <"$here/clickhouse-seed.sql"
    echo "clickhouse seeded"
    local verb
    for verb in up grant-runtime-acl; do
        k delete job "migrate-$verb" --ignore-not-found >/dev/null
        k apply -f - >/dev/null <<JOB
apiVersion: batch/v1
kind: Job
metadata: {name: migrate-$verb}
spec:
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      imagePullSecrets: [{name: ghcr-pull}]
      containers:
        - name: m
          image: $ACR_IMAGE
          command: ["/usr/local/bin/acr-migrate", "$verb"]
          env:
            - {name: PGA, valueFrom: {secretKeyRef: {name: stack-secrets, key: pg-admin}}}
            - {name: PGRT, valueFrom: {secretKeyRef: {name: stack-secrets, key: pg-runtime}}}
            - {name: ACR_POSTGRES_MIGRATION_DSN, value: "postgres://postgres:\$(PGA)@stack:5432/acr?sslmode=disable"}
            - {name: ACR_POSTGRES_DSN, value: "postgres://acr_runtime:\$(PGRT)@stack:5432/acr?sslmode=disable"}
JOB
        k wait --for=condition=complete "job/migrate-$verb" --timeout=120s >/dev/null
        echo "migrate-$verb complete"
    done
    # grant-runtime-acl grants the tables; the schema USAGE is the deploy's role setup.
    k exec stack -c postgres -- psql -U postgres -d acr -v ON_ERROR_STOP=1 -q -c "GRANT USAGE ON SCHEMA acr TO acr_runtime;"
    for i in $(seq 1 60); do
        [ "$(k get pod stack -o json | jq -r '.status.containerStatuses[]?|select(.name=="acr-api")|.ready')" = true ] && sleep 8 &&
            [ "$(k get pod stack -o json | jq -r '.status.containerStatuses[]?|select(.name=="acr-api")|.ready')" = true ] && break
        sleep 10
    done
    k get pod stack -o json | jq -r '.status.containerStatuses[]|"container \(.name) ready=\(.ready)"'
    echo "acr-api image: $(k get pod stack -o json | jq -r '.status.containerStatuses[]|select(.name=="acr-api")|.imageID')"
}

write_jwks() { # <spec...> ; build in DRILL_DIR, copy into the sidecar's volume
    drill jwks "$DRILL_DIR/web-jwks.json" "$@"
    k exec -i stack -c jwks -- sh -c 'cat > /jwks/web-jwks.json' <"$DRILL_DIR/web-jwks.json"
}

call_as() { # <kid>
    ACR_API_ORIGIN="http://127.0.0.1:$LOCAL_PORT" ACR_WEB_ASSERTION_AUDIENCE=acr-api ACR_WEB_ASSERTION_ISSUER=dev-health-web \
        ACR_WEB_ASSERTION_KID="$1" ACR_WEB_ASSERTION_KEY_FILE="$keys/$1.pem" drill call
}

expect() { # <want accepted|refused> <kid>
    local out status
    out="$(call_as "$2")"
    echo "$1 $out"
    status="$(sed -n 's/.* status=\([0-9]*\).*/\1/p' <<<"$out")"
    case "$1" in
        accepted) [ "$status" = 200 ] || { echo "FAIL: $2 was not accepted"; return 1; } ;;
        refused) [ "$status" = 401 ] || { echo "FAIL: $2 was not refused"; return 1; } ;;
    esac
}

cells() {
    k port-forward pod/stack "$LOCAL_PORT:8080" >"$DRILL_DIR/port-forward.log" 2>&1 &
    local pf=$!
    trap 'kill "$pf" 2>/dev/null || true' RETURN
    local i
    for i in $(seq 1 30); do
        curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$LOCAL_PORT/" && break
        sleep 2
    done
    echo "== C0 old key only"
    write_jwks "kid-old=$keys/kid-old.x"
    expect accepted kid-old
    expect refused kid-new
    local retire
    retire="$(date -u -d "+${OVERLAP_SECONDS} seconds" +%Y-%m-%dT%H:%M:%SZ)"
    echo "== C1 overlap: old retire_after=$retire, new added"
    write_jwks "kid-old=$keys/kid-old.x@$retire" "kid-new=$keys/kid-new.x"
    expect accepted kid-old
    expect accepted kid-new
    local now_s end_s
    end_s="$(date -u -d "$retire" +%s)"
    now_s="$(date -u +%s)"
    echo "waiting $((end_s - now_s + 2)) s for retire_after"
    sleep "$((end_s - now_s + 2))"
    echo "== C2 after retire_after"
    expect refused kid-old
    expect accepted kid-new
    echo "DRILL OK"
}

teardown() {
    kubectl delete ns "$DRILL_NS" --wait=true >/dev/null
    echo "ns=$DRILL_NS deleted"
}

case "${1:-}" in
    setup) setup ;;
    cells) cells ;;
    teardown) teardown ;;
    run) setup && cells ;;
    *) echo "usage: drill.sh setup|cells|teardown|run" >&2; exit 2 ;;
esac
