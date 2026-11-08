#!/usr/bin/env bash
# CHAOS-13330 (7.12 s3a): runs the ACR legacy cells (tests/acr-legacy/legacy-cells.proof.ts) against a real
# dev-health-ops stack of ONE named sha: go-api, query-api, auth-service, the ops router, Postgres, ClickHouse, in a
# compose project private to this run (ci/acr-legacy/compose.override.yml). The web code runs in vitest
# (vitest.acr-legacy.config.ts) with the switch ACR_SCOPES_FROM_GRANTS off; ACR is a capture-only double in the test.
#
#   ACR_LEGACY_OPS_DIR=<dev-health-ops checkout> ci/acr-legacy/run-legacy-cells.sh <ops-sha> <out-dir>
#
# Optional: ACR_LEGACY_PROJECT (compose project; default acrlegacy<pid><random>), ACR_LEGACY_ROUTER_PORT (loopback
# port of the router; default ephemeral), ACR_LEGACY_IMAGE_PREFIX (image tag prefix; default the project name).
# The ops checkout must be at <ops-sha> with no local change. Output: <out-dir>/legacy-cells.log (ends with
# `ALL-DONE rc=<n>`) and <out-dir>/legacy-cells.record.jsonl (one line per cell: route status, body, assertion
# scopes). An existing output file is never overwritten. No token is printed.
#
# Seed (org X with 3 repositories, the ACR feature on): one user per org role (viewer, member, admin, owner);
# platform_admin_no_row: users.is_superuser, a member of X at its login (so the session org is X), the membership row
# deleted after the login, so it holds NO row in X when the cells run; platform_admin_no_org: users.is_superuser with
# no membership row ever (its login gives a session with no org).
# Needs: docker with compose v2, curl, python3 with bcrypt, node and this checkout's dependencies installed.
set -euo pipefail
set -o noclobber # LOG and RECORD are never overwritten; temp files in the private WORK dir are rewritten with >|

WEB_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." >/dev/null 2>&1 && pwd -P)"
HERE="${WEB_DIR}/ci/acr-legacy"
OPS_DIR="${ACR_LEGACY_OPS_DIR:?ACR_LEGACY_OPS_DIR must name a dev-health-ops checkout}"
WANT_SHA="${1:?usage: run-legacy-cells.sh <ops-sha> <out-dir>}"
OUT="${2:?usage: run-legacy-cells.sh <ops-sha> <out-dir>}"
PROJECT="${ACR_LEGACY_PROJECT:-acrlegacy$$$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')}"
export ACR_LEGACY_ROUTER_PORT="${ACR_LEGACY_ROUTER_PORT:-}"
IMAGE_PREFIX="${ACR_LEGACY_IMAGE_PREFIX:-${PROJECT}}"
mkdir -p "${OUT}"
LOG="${OUT}/legacy-cells.log"
RECORD="${OUT}/legacy-cells.record.jsonl"
for f in "${LOG}" "${RECORD}"; do
  [ ! -e "${f}" ] || { printf 'refused: %s exists (records are append-only; use a new out-dir)\n' "${f}" >&2; exit 2; }
done
: >"${LOG}"
exec > >(tee -a "${LOG}") 2>&1

RC=1
STACK_UP=0
WORK=""
compose() { docker compose -p "${PROJECT}" -f "${OPS_DIR}/compose.yml" -f "${HERE}/compose.override.yml" "$@"; }
finish() {
  local status=$?
  [ "${RC}" -eq 0 ] || [ "${status}" -eq 0 ] || RC="${status}"
  if [ "${STACK_UP}" = 1 ]; then
    if [ "${RC}" -ne 0 ]; then
      printf '\n--- services at failure ---\n'
      compose ps --all || true
      compose logs --no-color --tail 60 go-api query-api auth-service router || true
    fi
    compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
  [ -z "${WORK}" ] || rm -rf -- "${WORK}"
  printf 'ALL-DONE rc=%s\n' "${RC}"
  exit "${RC}"
}
trap finish EXIT
die() { printf 'FAIL: %s\n' "$1"; RC=1; exit 1; }

for tool in docker curl python3 node; do command -v "${tool}" >/dev/null 2>&1 || die "${tool} is required"; done
python3 -I -c 'import bcrypt' 2>/dev/null || die "python3 bcrypt is required"
[ -x "${WEB_DIR}/node_modules/.bin/vitest" ] || die "install this checkout's dependencies first (pnpm install --frozen-lockfile)"
OPS_SHA="$(git -C "${OPS_DIR}" rev-parse HEAD)"
[ "${OPS_SHA}" = "${WANT_SHA}" ] || die "the ops checkout is at ${OPS_SHA}, not ${WANT_SHA}"
[ -z "$(git -C "${OPS_DIR}" status --porcelain)" ] || die "the ops checkout has local changes; the cells run a clean sha"
CATALOG="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["catalog_version"])' "${OPS_DIR}/contracts/auth/v1/vocabulary/roles.v1.json")"
printf '=== ACR legacy cells (CHAOS-13330)\nops sha: %s\nauth catalog_version: %s\nweb sha: %s\nproject: %s\nstarted: %s\n' \
  "${OPS_SHA}" "${CATALOG}" "$(git -C "${WEB_DIR}" rev-parse HEAD)" "${PROJECT}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# A private project: refuse when anything of it exists (compose would adopt it; cleanup would remove it).
[ -z "$(docker ps -aq --filter "label=com.docker.compose.project=${PROJECT}")" ] || die "a container of project ${PROJECT} exists"
[ -z "$(docker volume ls -q --filter "label=com.docker.compose.project=${PROJECT}")" ] || die "a volume of project ${PROJECT} exists"
[ -z "$(docker network ls -q --filter "label=com.docker.compose.project=${PROJECT}")" ] || die "a network of project ${PROJECT} exists"

WORK="$(mktemp -d "${TMPDIR:-${OUT}}/acr-legacy.XXXXXX")"
chmod 700 "${WORK}"
TAG="${OPS_SHA:0:12}"
export DEV_HEALTH_GO_DHO_IMAGE="${IMAGE_PREFIX}-dho:${TAG}"
export DEV_HEALTH_GO_OPERATOR_IMAGE="${IMAGE_PREFIX}-operator:${TAG}"
export DEV_HEALTH_GO_CONTRACTCHECK_IMAGE="${IMAGE_PREFIX}-contractcheck:${TAG}"
export DEV_HEALTH_GO_AUTH_MIGRATE_IMAGE="${IMAGE_PREFIX}-auth-migrate:${TAG}"
export DEV_HEALTH_GO_AUTH_SERVICE_IMAGE="${IMAGE_PREFIX}-auth-service:${TAG}"
export COMMIT="${OPS_SHA}"
export BUGSINK_SECRET_KEY=acr-legacy-unused
export POSTGRES_USER=postgres POSTGRES_DB=postgres
POSTGRES_PASSWORD="$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"
AUTH_RUNTIME_DATABASE_PASSWORD="$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"
AUTH_SESSION_SUCCESSOR_KEY="$(head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n')"
AUTH_LOGIN_LOCKOUT_KEY="$(head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n')"
export POSTGRES_PASSWORD AUTH_RUNTIME_DATABASE_PASSWORD AUTH_SESSION_SUCCESSOR_KEY AUTH_LOGIN_LOCKOUT_KEY
export AUTH_TOKEN_ISSUER_URL="https://auth.dev-health.internal:8443"

psql_one() { compose exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d postgres -At -c "$1"; }
ch() { compose exec -T clickhouse clickhouse-client --user "${CLICKHOUSE_USER:-ch}" --password "${CLICKHOUSE_PASSWORD:-ch}" --query "$1"; }

printf '\n--- flags (compose.yml defaults; names and values of the AUTH_PROXY_* and *_OWNED keys only) ---\n'
compose config --format json | python3 -I -c '
import json, sys
cfg = json.load(sys.stdin)
for name in ("go-api", "query-api", "auth-service"):
    env = cfg["services"][name].get("environment") or {}
    keys = sorted(k for k in env if k.startswith("AUTH_PROXY_") or k.endswith("_OWNED") or k == "AUTH_SESSION_ISSUE_CREDENTIAL")
    print(name, {k: env[k] for k in keys})
'

printf '\n--- step 1: build the ops images (tags %s-*:%s) ---\n' "${IMAGE_PREFIX}" "${TAG}"
compose build migrate go-api auth-migrate auth-service
STACK_UP=1

printf '\n--- step 2: migrations, auth schema, go-api workload credential ---\n'
compose run --rm auth-grants
# shellcheck source=/dev/null
source "${OPS_DIR}/ci/lib/auth_workload_session_issue.sh"
auth_workload_session_issue compose || die "the go-api workload credential is not ready"

printf '\n--- step 3: seed (owner login) ---\n'
uuid() { python3 -I -c 'import uuid; print(uuid.uuid4())'; }
ORG_X="$(uuid)"
PASSWORD="Pw-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')-Aa1!"
HASH="$(PW="${PASSWORD}" python3 -I -c 'import bcrypt, os; print(bcrypt.hashpw(os.environ["PW"].encode(), bcrypt.gensalt(12)).decode())')"
CALLERS=(viewer member admin owner platform_admin_no_row platform_admin_no_org)
declare -A USER_ID EMAIL
for who in "${CALLERS[@]}"; do
  USER_ID[${who}]="$(uuid)"
  EMAIL[${who}]="${who//_/-}-$(od -An -N3 -tx1 /dev/urandom | tr -d ' \n')@acr-legacy.example.com"
done
superuser() { case "$1" in platform_admin_*) echo true ;; *) echo false ;; esac; }
role_at_login() { case "$1" in platform_admin_no_row) echo member ;; platform_admin_no_org) echo "" ;; *) echo "$1" ;; esac; }
{
  printf "INSERT INTO public.organizations (id, slug, name) VALUES ('%s','acr-legacy-x','ACR Legacy X');\n" "${ORG_X}"
  for who in "${CALLERS[@]}"; do
    printf "INSERT INTO public.users (id, email, password_hash, full_name, auth_provider, is_active, is_verified, is_superuser) VALUES ('%s','%s','%s','%s','local',true,true,%s);\n" \
      "${USER_ID[${who}]}" "${EMAIL[${who}]}" "${HASH}" "${who}" "$(superuser "${who}")"
    role="$(role_at_login "${who}")"
    [ -z "${role}" ] || printf "INSERT INTO public.memberships (id, user_id, org_id, role, joined_at) VALUES ('%s','%s','%s','%s',now());\n" \
      "$(uuid)" "${USER_ID[${who}]}" "${ORG_X}" "${role}"
  done
  printf "INSERT INTO public.org_feature_overrides (id, org_id, feature_id, is_enabled, reason, created_at, updated_at) SELECT gen_random_uuid(), '%s', id, true, 'acr legacy cells', now(), now() FROM public.feature_flags WHERE key = 'agent_context_runtime';\n" "${ORG_X}"
} >|"${WORK}/seed.sql"
compose exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d postgres -q <"${WORK}/seed.sql"
[ "$(psql_one "SELECT count(*) FROM public.org_feature_overrides WHERE org_id = '${ORG_X}'")" = 1 ] \
  || die "no agent_context_runtime override row (feature_flags has no agent_context_runtime key?)"
for who in "${CALLERS[@]}"; do
  printf 'user %-22s id=%s superuser=%s membership at login=%s\n' "${who}" "${USER_ID[${who}]}" "$(superuser "${who}")" "$(role_at_login "${who}")"
done
printf 'org X=%s\n' "${ORG_X}"
INVENTORY='["acme/alpha","acme/beta","acme/gamma"]'
ch "INSERT INTO repos (id, repo, created_at, last_synced, org_id, provider) VALUES (generateUUIDv4(),'acme/alpha',now64(3),now64(3),'${ORG_X}','github'), (generateUUIDv4(),'acme/beta',now64(3),now64(3),'${ORG_X}','github'), (generateUUIDv4(),'acme/gamma',now64(3),now64(3),'${ORG_X}','github')"
printf 'clickhouse repos rows (org X): %s\n' "$(ch "SELECT count() FROM repos FINAL WHERE org_id = '${ORG_X}'")"
compose run --rm auth-users-backfill

printf '\n--- step 4: up the ops router (go-api, query-api, auth-service behind it) ---\n'
compose up --detach --wait --wait-timeout 900 router
compose ps
ROUTER_PORT="$(compose port router 8000 | sed 's/.*://')"
[[ "${ROUTER_PORT}" =~ ^[0-9]+$ ]] || die "could not read the router port"
BACKEND="http://127.0.0.1:${ROUTER_PORT}"
printf 'backend (ops router): %s\n' "${BACKEND}"

printf '\n--- step 5: log every caller in (POST /api/v1/auth/login, as web passwordLogin) ---\n'
CALLER_ROWS="${WORK}/callers.jsonl"
for who in "${CALLERS[@]}"; do
  EMAIL="${EMAIL[${who}]}" PW="${PASSWORD}" python3 -I -c 'import json, os; print(json.dumps({"email": os.environ["EMAIL"], "password": os.environ["PW"]}))' >|"${WORK}/login.json"
  status="$(curl --silent --show-error --max-time 30 --output "${WORK}/login.out" --write-out '%{http_code}' \
    -H 'Content-Type: application/json' --data-binary "@${WORK}/login.json" "${BACKEND}/api/v1/auth/login" || echo curl_error)"
  printf 'login %-22s -> HTTP %s; body with token values redacted: ' "${who}" "${status}"
  python3 -I - "${WORK}/login.out" "${who}" "${USER_ID[${who}]}" "$(superuser "${who}")" "${CALLER_ROWS}" <<'PY'
import json, sys
path, name, user_id, superuser, rows = sys.argv[1:6]
try:
    doc = json.load(open(path))
except Exception as error:
    print("unparsable:", type(error).__name__); sys.exit(0)
def red(v):
    if isinstance(v, dict):
        return {k: ("<redacted len=%d>" % len(x) if "token" in k.lower() and isinstance(x, str) else red(x)) for k, x in v.items()}
    if isinstance(v, list):
        return [red(x) for x in v]
    return v
print(json.dumps(red(doc), sort_keys=True))
user = doc.get("user") or {}
row = {"name": name, "userId": user_id, "sessionOrgId": user.get("org_id") or None,
       "isSuperuser": superuser == "true", "accessToken": doc.get("access_token") or ""}
with open(rows, "a") as out:
    out.write(json.dumps(row) + "\n")
PY
done
rm -f -- "${WORK}/login.json" "${WORK}/login.out"

printf '\n--- step 6: delete the membership row of platform_admin_no_row (after its login) ---\n'
printf 'deleted rows: %s\n' "$(psql_one "WITH d AS (DELETE FROM public.memberships WHERE user_id = '${USER_ID[platform_admin_no_row]}' RETURNING 1) SELECT count(*) FROM d")"
for who in platform_admin_no_row platform_admin_no_org; do
  printf '%s membership rows now: %s\n' "${who}" "$(psql_one "SELECT count(*) FROM public.memberships WHERE user_id = '${USER_ID[${who}]}'")"
done

FIXTURE="${WORK}/fixture.json"
python3 -I - "${CALLER_ROWS}" "${FIXTURE}" "${OPS_SHA}" "${CATALOG}" "${ORG_X}" "${INVENTORY}" <<'PY'
import json, os, sys
rows_path, out, ops_sha, catalog, org, inventory = sys.argv[1:7]
callers = [json.loads(line) for line in open(rows_path)]
expect = {c["name"]: c for c in callers}
for name in ("viewer", "member", "admin", "owner", "platform_admin_no_row"):
    if expect[name]["sessionOrgId"] != org or not expect[name]["accessToken"]:
        sys.exit("FAIL: %s has no session in org X (login org %r)" % (name, expect[name]["sessionOrgId"]))
if expect["platform_admin_no_org"]["sessionOrgId"] is not None or not expect["platform_admin_no_org"]["accessToken"]:
    sys.exit("FAIL: platform_admin_no_org must have a session with no org")
fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, "w") as f:
    json.dump({"opsSha": ops_sha, "catalogVersion": int(catalog), "orgId": org,
               "inventory": json.loads(inventory), "callers": callers}, f)
print("fixture: %d callers; sessions: %s" % (len(callers), {c["name"]: c["sessionOrgId"] for c in callers}))
PY
rm -f -- "${CALLER_ROWS}"

printf '\n--- step 7: the cells (vitest, vitest.acr-legacy.config.ts) ---\n'
: >"${RECORD}"
set +e
(cd "${WEB_DIR}" && ACR_LEGACY_FIXTURE="${FIXTURE}" ACR_LEGACY_BACKEND_URL="${BACKEND}" ACR_LEGACY_RECORD="${RECORD}" \
  ./node_modules/.bin/vitest run --config vitest.acr-legacy.config.ts)
VITEST_RC=$?
set -e
printf '\n--- recorded bytes (%s) ---\n' "${RECORD}"
cat "${RECORD}"
printf 'record sha256: %s\nvitest rc=%s\n' "$(sha256sum "${RECORD}" | cut -d' ' -f1)" "${VITEST_RC}"
RC="${VITEST_RC}"
