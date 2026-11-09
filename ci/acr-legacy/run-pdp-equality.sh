#!/usr/bin/env bash
# CHAOS-13325 (7.12 s3b): runs the ACR real-PDP equality cells (tests/acr-legacy/pdp-equality.pdp.ts) against a real
# dev-health-ops stack of ONE named sha (s2b delta B, catalog 18): go-api, query-api, auth-service, the ops router,
# Postgres, ClickHouse, in a compose project private to this run (ci/acr-legacy/compose.override.yml + pdp.override.yml).
# The web code runs in vitest (vitest.acr-pdp.config.ts), each cell twice: ACR_SCOPES_FROM_GRANTS off and on. The PDP is
# the stack's auth-service; ACR is a capture-only double in the test.
#
#   ACR_PDP_OPS_DIR=<dev-health-ops checkout> ci/acr-legacy/run-pdp-equality.sh <ops-sha> <out-dir>
#
# Optional: ACR_PDP_PROJECT (compose project; default acrpdp<pid><random>), ACR_PDP_ROUTER_PORT and ACR_PDP_AUTH_PORT
# (loopback ports of the router and of auth-service's API listener; default ephemeral), ACR_PDP_IMAGE_PREFIX (image tag
# prefix; default the project name). The ops checkout must be at <ops-sha> with no local change; the log names the
# sha and the catalog version. Output: <out-dir>/pdp-equality.log (ends with `ALL-DONE rc=<n>`) and
# <out-dir>/pdp-equality.record.jsonl (per caller and cell: the legacy and the grants answers). No token is printed.
#
# Seed (org X, 3 repositories, the ACR feature on): viewer, member, admin, owner on the membership default (no grant
# row); wildcard_grant (member, one live "*" repository grant); exact_grant (member, one live grant on acme/alpha);
# platform_admin_no_row (users.is_superuser: a member login, then the membership row is deleted, so the session org is
# X with no row); platform_admin_no_row_suspended (the same, in a second org S: member login in S, the row deleted,
# then S is suspended as go-api's admin PATCH is_active=false writes it: public.organizations.is_active = false);
# platform_admin_no_org (users.is_superuser, no membership row ever); impersonating (member; the web
# session says it impersonates). The grants are created through auth-service's own route (POST
# /internal/v1/grants/create, actor = the owner, caller = the api workload). The web workload's /v1/authorize token is
# exchanged from a compose bootstrap credential for the `web` workload (prod exchanges its ServiceAccount token).
# Needs: docker with compose v2, curl, python3 with bcrypt, node and this checkout's dependencies installed.
set -euo pipefail
set -o noclobber # LOG and RECORD are never overwritten; temp files in the private WORK dir are rewritten with >|

WEB_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." >/dev/null 2>&1 && pwd -P)"
HERE="${WEB_DIR}/ci/acr-legacy"
OPS_DIR="${ACR_PDP_OPS_DIR:?ACR_PDP_OPS_DIR must name a dev-health-ops checkout}"
WANT_SHA="${1:?usage: run-pdp-equality.sh <ops-sha> <out-dir>}"
OUT="${2:?usage: run-pdp-equality.sh <ops-sha> <out-dir>}"
PROJECT="${ACR_PDP_PROJECT:-acrpdp$$$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')}"
export ACR_LEGACY_ROUTER_PORT="${ACR_PDP_ROUTER_PORT:-}"
export ACR_PDP_AUTH_PORT="${ACR_PDP_AUTH_PORT:-}"
export ACR_PDP_AUTHORIZE_CALLERS=""
IMAGE_PREFIX="${ACR_PDP_IMAGE_PREFIX:-${PROJECT}}"
mkdir -p "${OUT}"
LOG="${OUT}/pdp-equality.log"
RECORD="${OUT}/pdp-equality.record.jsonl"
for f in "${LOG}" "${RECORD}"; do
  [ ! -e "${f}" ] || { printf 'refused: %s exists (records are append-only; use a new out-dir)\n' "${f}" >&2; exit 2; }
done
: >"${LOG}"
exec > >(tee -a "${LOG}") 2>&1

RC=1
STACK_UP=0
WORK=""
compose() { docker compose -p "${PROJECT}" -f "${OPS_DIR}/compose.yml" -f "${HERE}/compose.override.yml" -f "${HERE}/pdp.override.yml" "$@"; }
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
printf '=== ACR real-PDP equality cells (CHAOS-13325)\nops sha: %s\nauth catalog_version: %s\nweb sha: %s\nproject: %s\nstarted: %s\n' \
  "${OPS_SHA}" "${CATALOG}" "$(git -C "${WEB_DIR}" rev-parse HEAD)" "${PROJECT}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# A private project: refuse when anything of it exists (compose would adopt it; cleanup would remove it).
[ -z "$(docker ps -aq --filter "label=com.docker.compose.project=${PROJECT}")" ] || die "a container of project ${PROJECT} exists"
[ -z "$(docker volume ls -q --filter "label=com.docker.compose.project=${PROJECT}")" ] || die "a volume of project ${PROJECT} exists"
[ -z "$(docker network ls -q --filter "label=com.docker.compose.project=${PROJECT}")" ] || die "a network of project ${PROJECT} exists"

WORK="$(mktemp -d "${TMPDIR:-${OUT}}/acr-pdp.XXXXXX")"
chmod 700 "${WORK}"
TAG="${OPS_SHA:0:12}"
export DEV_HEALTH_GO_DHO_IMAGE="${IMAGE_PREFIX}-dho:${TAG}"
export DEV_HEALTH_GO_OPERATOR_IMAGE="${IMAGE_PREFIX}-operator:${TAG}"
export DEV_HEALTH_GO_CONTRACTCHECK_IMAGE="${IMAGE_PREFIX}-contractcheck:${TAG}"
export DEV_HEALTH_GO_AUTH_MIGRATE_IMAGE="${IMAGE_PREFIX}-auth-migrate:${TAG}"
export DEV_HEALTH_GO_AUTH_SERVICE_IMAGE="${IMAGE_PREFIX}-auth-service:${TAG}"
export COMMIT="${OPS_SHA}"
export BUGSINK_SECRET_KEY=acr-pdp-unused
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

printf '\n--- step 2b: the web workload: bootstrap credential, principal, authorize caller ---\n'
compose run --rm auth-workload-bootstrap workloads bootstrap-create -workload web -out /run/workload/web.bootstrap -apply
WEB_PRN="$(psql_one "SELECT 'prn_' || translate(rtrim(encode(decode(replace(principal_id::text, '-', ''), 'hex'), 'base64'), '='), '+/', '-_') FROM auth.workloads WHERE name = 'web'")"
[[ "${WEB_PRN}" =~ ^prn_[A-Za-z0-9_-]{22}$ ]] || die "the web workload principal is not a wire principal id (${WEB_PRN})"
export ACR_PDP_AUTHORIZE_CALLERS="${WEB_PRN}"
printf 'web workload principal (authorize caller): %s\n' "${WEB_PRN}"
for name in web api; do
  (
    umask 077
    # The volume's files are 65532-owned 0600 and this service drops every capability but CHOWN, so root cannot read them.
    compose run --rm --no-deps -T --user 65532:65532 auth-workload-volume "cat /run/workload/${name}.bootstrap" >|"${WORK}/${name}.bootstrap"
  )
  [ -s "${WORK}/${name}.bootstrap" ] || die "could not read the ${name} bootstrap credential"
done

printf '\n--- step 3: seed (owner login) ---\n'
uuid() { python3 -I -c 'import uuid; print(uuid.uuid4())'; }
ORG_X="$(uuid)"
ORG_S="$(uuid)"
PASSWORD="Pw-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')-Aa1!"
HASH="$(PW="${PASSWORD}" python3 -I -c 'import bcrypt, os; print(bcrypt.hashpw(os.environ["PW"].encode(), bcrypt.gensalt(12)).decode())')"
CALLERS=(viewer member admin owner wildcard_grant exact_grant platform_admin_no_row platform_admin_no_row_suspended platform_admin_no_org impersonating)
declare -A USER_ID EMAIL
for who in "${CALLERS[@]}"; do
  USER_ID[${who}]="$(uuid)"
  EMAIL[${who}]="${who//_/-}-$(od -An -N3 -tx1 /dev/urandom | tr -d ' \n')@acr-legacy.example.com"
done
superuser() { case "$1" in platform_admin_*) echo true ;; *) echo false ;; esac; }
role_at_login() {
  case "$1" in
    platform_admin_no_row | platform_admin_no_row_suspended | wildcard_grant | exact_grant | impersonating) echo member ;;
    platform_admin_no_org) echo "" ;;
    *) echo "$1" ;;
  esac
}
{
  printf "INSERT INTO public.organizations (id, slug, name) VALUES ('%s','acr-legacy-x','ACR Legacy X');\n" "${ORG_X}"
  printf "INSERT INTO public.organizations (id, slug, name) VALUES ('%s','acr-legacy-s','ACR Legacy S');\n" "${ORG_S}"
  for who in "${CALLERS[@]}"; do
    printf "INSERT INTO public.users (id, email, password_hash, full_name, auth_provider, is_active, is_verified, is_superuser) VALUES ('%s','%s','%s','%s','local',true,true,%s);\n" \
      "${USER_ID[${who}]}" "${EMAIL[${who}]}" "${HASH}" "${who}" "$(superuser "${who}")"
    role="$(role_at_login "${who}")"
    login_org="${ORG_X}"
    [ "${who}" != platform_admin_no_row_suspended ] || login_org="${ORG_S}"
    [ -z "${role}" ] || printf "INSERT INTO public.memberships (id, user_id, org_id, role, joined_at) VALUES ('%s','%s','%s','%s',now());\n" \
      "$(uuid)" "${USER_ID[${who}]}" "${login_org}" "${role}"
  done
  for org in "${ORG_X}" "${ORG_S}"; do
    printf "INSERT INTO public.org_feature_overrides (id, org_id, feature_id, is_enabled, reason, created_at, updated_at) SELECT gen_random_uuid(), '%s', id, true, 'acr legacy cells', now(), now() FROM public.feature_flags WHERE key = 'agent_context_runtime';\n" "${org}"
  done
} >|"${WORK}/seed.sql"
compose exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d postgres -q <"${WORK}/seed.sql"
[ "$(psql_one "SELECT count(*) FROM public.org_feature_overrides WHERE org_id IN ('${ORG_X}','${ORG_S}')")" = 2 ] \
  || die "no agent_context_runtime override row (feature_flags has no agent_context_runtime key?)"
for who in "${CALLERS[@]}"; do
  printf 'user %-22s id=%s superuser=%s membership at login=%s\n' "${who}" "${USER_ID[${who}]}" "$(superuser "${who}")" "$(role_at_login "${who}")"
done
printf 'org X=%s\norg S (suspended after the logins)=%s\n' "${ORG_X}" "${ORG_S}"
INVENTORY='["acme/alpha","acme/beta","acme/gamma"]'
ch "INSERT INTO repos (id, repo, created_at, last_synced, org_id, provider) VALUES (generateUUIDv4(),'acme/alpha',now64(3),now64(3),'${ORG_X}','github'), (generateUUIDv4(),'acme/beta',now64(3),now64(3),'${ORG_X}','github'), (generateUUIDv4(),'acme/gamma',now64(3),now64(3),'${ORG_X}','github'), (generateUUIDv4(),'acme/alpha',now64(3),now64(3),'${ORG_S}','github'), (generateUUIDv4(),'acme/beta',now64(3),now64(3),'${ORG_S}','github'), (generateUUIDv4(),'acme/gamma',now64(3),now64(3),'${ORG_S}','github')"
printf 'clickhouse repos rows (org X): %s\n' "$(ch "SELECT count() FROM repos FINAL WHERE org_id = '${ORG_X}'")"
compose run --rm auth-users-backfill

printf '\n--- step 4: up the ops router (go-api, query-api, auth-service behind it) ---\n'
compose up --detach --wait --wait-timeout 900 router
compose ps
AUTH_PORT="$(compose port auth-service 8095 | sed 's/.*://')"
[[ "${AUTH_PORT}" =~ ^[0-9]+$ ]] || die "could not read the auth-service API port"
AUTH="http://127.0.0.1:${AUTH_PORT}"
printf 'auth-service API (loopback): %s\n' "${AUTH}"

printf '\n--- step 4b: the grants, through auth-service (POST /internal/v1/grants/create; caller: api workload; actor: owner) ---\n'
for who in owner wildcard_grant exact_grant; do
  printf 'auth principal row for %s: %s\n' "${who}" "$(psql_one "SELECT count(*) FROM auth.principals WHERE id = '${USER_ID[${who}]}'")"
done
exchange() { # bootstrap-file -> access token on stdout
  curl --silent --show-error --max-time 30 --fail-with-body \
    --data-urlencode grant_type=urn:ietf:params:oauth:grant-type:token-exchange \
    --data-urlencode "subject_token@$1" \
    --data-urlencode subject_token_type=urn:dev-health:params:oauth:token-type:workload-bootstrap \
    --data-urlencode audience=auth-service \
    "${AUTH}/internal/v1/token/exchange" | python3 -I -c 'import json, sys; print(json.load(sys.stdin)["access_token"])'
}
API_TOKEN="$(exchange "${WORK}/api.bootstrap")" || die "the api workload token exchange failed"
grant() { # principal-name key
  ORG="${ORG_X}" ACTOR="${USER_ID[owner]}" PRINCIPAL="${USER_ID[$1]}" KEY="$2" python3 -I -c 'import json, os; print(json.dumps({"organization_id": os.environ["ORG"], "actor_principal_id": os.environ["ACTOR"], "principal_id": os.environ["PRINCIPAL"], "role": "member", "resource_key": os.environ["KEY"]}))' >|"${WORK}/grant.json"
  status="$(curl --silent --show-error --max-time 30 --output "${WORK}/grant.out" --write-out '%{http_code}' \
    -H "Authorization: Bearer ${API_TOKEN}" -H 'Content-Type: application/json' --data-binary "@${WORK}/grant.json" \
    "${AUTH}/internal/v1/grants/create" || echo curl_error)"
  printf 'grant %s %s -> HTTP %s: %s\n' "$1" "$2" "${status}" "$(cat "${WORK}/grant.out")"
  [ "${status}" = 200 ] || [ "${status}" = 201 ] || die "grant create for $1 answered ${status}"
}
grant wildcard_grant '*'
grant exact_grant acme/alpha
unset API_TOKEN
printf 'live resource_grants in org X: %s\n' "$(psql_one "SELECT string_agg(resource_id, ',' ORDER BY resource_id) FROM auth.resource_grants WHERE organization_id = '${ORG_X}' AND revoked_at IS NULL")"
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

printf '\n--- step 6: delete the membership rows of platform_admin_no_row and platform_admin_no_row_suspended (after their logins) ---\n'
for who in platform_admin_no_row platform_admin_no_row_suspended; do
  printf 'deleted rows (%s): %s\n' "${who}" "$(psql_one "WITH d AS (DELETE FROM public.memberships WHERE user_id = '${USER_ID[${who}]}' RETURNING 1) SELECT count(*) FROM d")"
done
for who in platform_admin_no_row platform_admin_no_row_suspended platform_admin_no_org; do
  printf '%s membership rows now: %s\n' "${who}" "$(psql_one "SELECT count(*) FROM public.memberships WHERE user_id = '${USER_ID[${who}]}'")"
done

printf '\n--- step 6b: suspend org S as the product does (go-api PATCH is_active=false: orgstore.go UPDATE organizations SET ... is_active) ---\n'
# The PDP reads public.organizations.is_active (decisionstate.go organization(): false = suspended), as do go-api's membership reads
# (policy/store.go membershipSQL). With AUTH_PROXY_ORG_PROVISIONING on the PATCH also calls auth-service's suspend first; that
# route is not called here (no guarded auth.* write by SQL), and no read of this stack's decisions consults it.
printf 'suspended rows: %s\n' "$(psql_one "WITH u AS (UPDATE public.organizations SET is_active = false, updated_at = now() WHERE id = '${ORG_S}' RETURNING 1) SELECT count(*) FROM u")"
printf 'org S is_active now: %s\n' "$(psql_one "SELECT is_active FROM public.organizations WHERE id = '${ORG_S}'")"

FIXTURE="${WORK}/fixture.json"
python3 -I - "${CALLER_ROWS}" "${FIXTURE}" "${OPS_SHA}" "${CATALOG}" "${ORG_X}" "${INVENTORY}" "${WORK}/web.bootstrap" "${ORG_S}" <<'PY'
import json, os, sys
rows_path, out, ops_sha, catalog, org, inventory, web_bootstrap, org_s = sys.argv[1:9]
callers = [json.loads(line) for line in open(rows_path)]
for c in callers:
    c["impersonating"] = c["name"] == "impersonating"
expect = {c["name"]: c for c in callers}
for name in ("viewer", "member", "admin", "owner", "wildcard_grant", "exact_grant", "platform_admin_no_row", "impersonating"):
    if expect[name]["sessionOrgId"] != org or not expect[name]["accessToken"]:
        sys.exit("FAIL: %s has no session in org X (login org %r)" % (name, expect[name]["sessionOrgId"]))
if expect["platform_admin_no_row_suspended"]["sessionOrgId"] != org_s or not expect["platform_admin_no_row_suspended"]["accessToken"]:
    sys.exit("FAIL: platform_admin_no_row_suspended has no session in org S (login org %r)" % expect["platform_admin_no_row_suspended"]["sessionOrgId"])
if expect["platform_admin_no_org"]["sessionOrgId"] is not None or not expect["platform_admin_no_org"]["accessToken"]:
    sys.exit("FAIL: platform_admin_no_org must have a session with no org")
fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, "w") as f:
    json.dump({"opsSha": ops_sha, "catalogVersion": int(catalog), "orgId": org, "suspendedOrgId": org_s,
               "inventory": json.loads(inventory), "webBootstrapFile": web_bootstrap, "callers": callers}, f)
print("fixture: %d callers; sessions: %s" % (len(callers), {c["name"]: c["sessionOrgId"] for c in callers}))
PY
rm -f -- "${CALLER_ROWS}"

printf '\n--- step 7: the cells (vitest, vitest.acr-pdp.config.ts) ---\n'
: >"${RECORD}"
set +e
(cd "${WEB_DIR}" && ACR_PDP_FIXTURE="${FIXTURE}" ACR_PDP_BACKEND_URL="${BACKEND}" ACR_PDP_AUTH_INTERNAL_URL="${AUTH}" \
  ACR_PDP_RECORD="${RECORD}" ./node_modules/.bin/vitest run --config vitest.acr-pdp.config.ts)
VITEST_RC=$?
set -e
printf '\n--- recorded bytes (%s) ---\n' "${RECORD}"
cat "${RECORD}"
printf 'record sha256: %s\nvitest rc=%s\n' "$(sha256sum "${RECORD}" | cut -d' ' -f1)" "${VITEST_RC}"
RC="${VITEST_RC}"
