#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: ci/run_tests.sh <format|quality|build|unit|auth-profiles-gate|e2e|e2e-default|e2e-customer-push|e2e-navigation|e2e-onboarding|e2e-context-fabric|pagerduty-final-qa|live-e2e|live-e2e-guided|live-e2e-two-pass|design-lint|ci> [current/total]" >&2
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage
  exit 1
fi

tier="$1"

if [[ "${tier}" == "e2e-default" ]]; then
  if [[ $# -ne 2 ]]; then
    echo "e2e-default requires a shard in current/total form." >&2
    usage
    exit 1
  fi
elif [[ $# -ne 1 ]]; then
  usage
  exit 1
fi

export TZ=UTC
export LANG=C.UTF-8
export LC_ALL=C.UTF-8
export NODE_ENV=test
export NEXT_TELEMETRY_DISABLED=1
export FORCE_COLOR=0

PLAYWRIGHT_RESULTS_ROOT="${PLAYWRIGHT_RESULTS_DIR:-test-results/playwright}"
PLAYWRIGHT_REPORT_ROOT="${PLAYWRIGHT_REPORT_DIR:-${PLAYWRIGHT_RESULTS_ROOT}-html}"

run_pnpm_script() {
  local script_name="$1"
  echo "==> pnpm ${script_name}"
  pnpm "${script_name}"
}

# The production build, then the check that no client file holds server-only code or a secret
# value. A secret variable with no value in this job gets a placeholder for the build and the
# check only (a subshell), so the check always has a value to look for.
run_build() {
  (
    local name
    for name in AUTH_SECRET NEXTAUTH_SECRET AUTH_GITHUB_SECRET AUTH_GOOGLE_SECRET AUTH_GITLAB_SECRET LINEAR_API_KEY; do
      if [[ -z "${!name:-}" ]]; then
        export "${name}=client-bundle-check-placeholder-${name}"
      fi
    done
    run_pnpm_script build
    echo "==> pnpm check:client-bundle --require-secrets"
    pnpm check:client-bundle --require-secrets
    # CHAOS-12337: no page may be prerendered under the per-request nonce CSP (its scripts are blocked).
    echo "==> pnpm check:nonce-csp-pages"
    pnpm check:nonce-csp-pages
  )
}

run_timed() {
  local phase="$1"
  shift
  local started_at="${SECONDS}"
  local status

  echo "==> ${phase} started"
  if "$@"; then
    echo "==> ${phase} passed in $((SECONDS - started_at))s"
    return 0
  else
    status=$?
    echo "==> ${phase} failed in $((SECONDS - started_at))s (exit ${status})" >&2
    return "${status}"
  fi
}

is_ci() {
  [[ "${CI:-}" == "true" || "${CI:-}" == "1" ]]
}

playwright_launch_probe() {
  timeout --kill-after=5 60 node -e 'const { chromium } = require("@playwright/test"); chromium.launch().then((b) => b.close()).catch((e) => { console.error(e.message); process.exit(1); })'
}

# GitHub-hosted Ubuntu runners already carry Chromium's system libraries, and
# `--with-deps` spent up to 546 s in a slow apt mirror to confirm that. Install
# the browser only, prove it launches (60 s cap, so a hung launch also falls
# back), and run apt only if it cannot. Every failure returns its own status so
# timed and direct callers see the same result.
install_playwright_browser_ci_linux() {
  echo "==> npx playwright install chromium (download)"
  run_timed "playwright browser download" npx playwright install chromium || return $?

  if run_timed "playwright launch probe" playwright_launch_probe; then
    return 0
  fi

  echo "==> launch probe failed; falling back to npx playwright install-deps chromium"
  run_timed "playwright install-deps fallback" npx playwright install-deps chromium || return $?
  run_timed "playwright launch probe after install-deps" playwright_launch_probe || return $?
}

install_playwright_browser() {
  local os_name
  os_name="$(uname -s)"

  if is_ci && [[ "${os_name}" == "Linux" ]]; then
    install_playwright_browser_ci_linux
    return
  fi

  echo "==> npx playwright install chromium"
  npx playwright install chromium
}

print_e2e_diagnostics() {
  local report_root="${1:-${PLAYWRIGHT_REPORT_ROOT}}"
  local results_root="${2:-${PLAYWRIGHT_RESULTS_ROOT}}"

  echo "==> e2e diagnostics"
  echo "CI=${CI:-false}"
  echo "NODE_ENV=${NODE_ENV}"
  echo "PLAYWRIGHT_REPORT_ROOT=${report_root}"
  echo "PLAYWRIGHT_RESULTS_ROOT=${results_root}"
  echo "node $(node --version)"
  echo "pnpm $(pnpm --version)"
  echo "playwright $(npx playwright --version)"
}

validate_playwright_artifact_root() {
  local artifact_root="$1"

  if [[ ! "${artifact_root}" =~ ^test-results/[A-Za-z0-9._/-]+$ ]] ||
    [[ "/${artifact_root}/" == *"/../"* ]] ||
    [[ "/${artifact_root}/" == *"/./"* ]]; then
    echo "Playwright artifact root '${artifact_root}' must be a safe subdirectory of test-results." >&2
    return 1
  fi
}

prepare_playwright_artifacts() {
  validate_playwright_artifact_root "${PLAYWRIGHT_REPORT_ROOT}" || return
  validate_playwright_artifact_root "${PLAYWRIGHT_RESULTS_ROOT}" || return
  if [[ "${PLAYWRIGHT_REPORT_ROOT}" == "${PLAYWRIGHT_RESULTS_ROOT}" ]]; then
    echo "Playwright report and result roots must be different directories." >&2
    return 1
  fi

  rm -rf "${PLAYWRIGHT_REPORT_ROOT}" "${PLAYWRIGHT_RESULTS_ROOT}"
  mkdir -p "${PLAYWRIGHT_REPORT_ROOT}" "${PLAYWRIGHT_RESULTS_ROOT}"

  # Drop the dev server's compiled chunks, never the production build.
  #
  # The `ci` tier runs `pnpm build` (which writes .next/) and then Playwright
  # starts `next dev` (which uses .next/dev). On a fresh CI checkout .next
  # starts empty, so those two never disagree. On a local checkout that already
  # has a .next from earlier work, the dev server serves stale chunks against
  # the current tree and fails with "module factory is not available" -- and the
  # symptom is not a build error. It surfaces as unrelated PRODUCT tests
  # failing: a broken app/global-error.tsx chunk stops an error toast
  # rendering and stops a post-signin redirect completing, so auth specs go
  # red and look like a real regression. Two of them cost a full gate run
  # before the durations gave it away (10.7s and ~31s timeout-shaped failures,
  # the same specs finishing in 575ms and 4.9s once .next was cleared).
  #
  # Scoped to .next/dev on purpose: wiping .next entirely would discard the
  # production build this tier just made, so the e2e stage would silently stop
  # exercising it.
  rm -rf .next/dev
}

reset_dev_output() {
  rm -rf .next/dev
}

reset_navigation_output() {
  rm -rf .next/navigation
}

print_playwright_artifact_summary() {
  local report_root="${1:-${PLAYWRIGHT_REPORT_ROOT}}"
  local results_root="${2:-${PLAYWRIGHT_RESULTS_ROOT}}"

  echo "==> playwright artifact summary"
  for artifact_path in "${report_root}" "${results_root}"; do
    if [[ -d "${artifact_path}" ]]; then
      echo "  ${artifact_path}"
      find "${artifact_path}" -maxdepth 4 -type f | sort || true
    else
      echo "  ${artifact_path} (missing)"
    fi
  done
}

run_wire_parity() {
  # CHAOS-4696: query-api resolves a request by digesting the raw query text it
  # receives. For every registered document, assert that query-api's const (read
  # via ops main's registrydump, the LIVE tip) digests to what this repo's pinned
  # @urql/core puts on the wire. A paired change is checked against the ops
  # branch: CI passes WIRE_PARITY_OPS_ROOT for that.
  if [[ -z "${WIRE_PARITY_OPS_ROOT:-}" && -z "${WIRE_PARITY_OPS_MAIN_ROOT:-}" ]]; then
    echo "WIRE_PARITY_OPS_ROOT or WIRE_PARITY_OPS_MAIN_ROOT must name a clean dev-health-ops checkout." >&2
    return 1
  fi
  local wire_parity_root="${WIRE_PARITY_OPS_ROOT:-${WIRE_PARITY_OPS_MAIN_ROOT}}"
  echo "==> pnpm graphql:wire-parity:check --ops-root ${wire_parity_root}"
  pnpm graphql:wire-parity:check --ops-root "${wire_parity_root}"
}

run_audit() {
  echo "==> pnpm audit --audit-level=high --prod (retried on registry errors only)"
  node ci/pnpm-audit-retry.mjs
}

# CHAOS-3595: every quality step runs, and each verdict is printed. One red step
# no longer hides the steps after it (a red audit used to hide lint, typecheck
# and the contract checks). The job still fails if any step failed.
run_quality() {
  local failures=()
  local first_rc=0
  local step
  local rc
  local steps=(
    "run_pnpm_script codegen:check"
    "run_wire_parity"
    "run_pnpm_script lint"
    "run_pnpm_script typecheck"
    "run_audit"
  )
  for step in "${steps[@]}"; do
    # shellcheck disable=SC2086
    if ${step}; then
      echo "QUALITY-STEP PASS: ${step}"
    else
      rc=$?
      (( first_rc == 0 )) && first_rc=${rc}
      echo "QUALITY-STEP FAIL: ${step}" >&2
      failures+=("${step}")
    fi
  done
  if (( ${#failures[@]} > 0 )); then
    echo "quality: ${#failures[@]} of ${#steps[@]} steps failed:" >&2
    printf '  %s\n' "${failures[@]}" >&2
    return "${first_rc}"
  fi
}

run_unit() {
  echo "==> pnpm exec vitest run --coverage"
  # On GitHub runners keep a copy of the output for the CHAOS-8789 parse diagnostics step.
  if [[ -n "${RUNNER_TEMP:-}" ]]; then
    pnpm exec vitest run --coverage --coverage.reporter=text --coverage.reporter=lcov 2>&1 | tee "${RUNNER_TEMP}/unit.log"
  else
    pnpm exec vitest run --coverage --coverage.reporter=text --coverage.reporter=lcov
  fi
}

# CHAOS-3273 Wave 0: guardrail G-1's web-side CI gate
# (ci/gate_web_auth_profiles.ts). WEB_ENDPOINT_PROFILE_SCHEMA/
# WEB_CREDENTIAL_CLASSES, when set, must name the pinned ops-owned contract
# files (see ci/ops-contract.pin and .github/workflows/tests.yml's sparse
# checkout). A missing input fails the gate, in CI and locally. A local run
# that cannot supply them sets WEB_ALLOW_MISSING_CONTRACT_INPUTS=1: the gate
# then skips those checks and lists them (never in CI).
run_auth_profiles_gate() {
  local args=()
  if [[ -n "${WEB_ENDPOINT_PROFILE_SCHEMA:-}" ]]; then
    args+=(--schema "${WEB_ENDPOINT_PROFILE_SCHEMA}")
  fi
  if [[ -n "${WEB_CREDENTIAL_CLASSES:-}" ]]; then
    args+=(--credential-classes "${WEB_CREDENTIAL_CLASSES}")
  fi
  if [[ -n "${WEB_CREDENTIAL_CLASSES_SCHEMA:-}" ]]; then
    args+=(--credential-classes-schema "${WEB_CREDENTIAL_CLASSES_SCHEMA}")
  fi
  if [[ "${WEB_ALLOW_MISSING_CONTRACT_INPUTS:-}" == "1" ]]; then
    args+=(--allow-missing-contract-inputs)
  fi
  echo "==> pnpm auth-profiles:gate ${args[*]}"
  pnpm auth-profiles:gate "${args[@]}"
}

# CHAOS-10461: the TS access-token verifier decides the ops-owned golden corpus
# from the pinned sparse checkout. WEB_REQUIRE_ACCESS_TOKEN_CORPUS=1 makes a
# missing checkout a failure instead of a skip.
run_access_token_corpus() {
  if [[ -z "${WEB_OPS_CONTRACT_ROOT:-}" ]]; then
    echo "WEB_OPS_CONTRACT_ROOT must name the pinned ops contract checkout." >&2
    return 1
  fi
  echo "==> vitest access-token and authorization corpus (${WEB_OPS_CONTRACT_ROOT})"
  WEB_REQUIRE_ACCESS_TOKEN_CORPUS=1 pnpm exec vitest run --project unit src/lib/auth/accesstoken src/lib/auth/authorize
}

run_e2e() {
  run_timed "e2e artifact preparation" prepare_playwright_artifacts
  run_timed "e2e browser installation" install_playwright_browser
  print_e2e_diagnostics
  local status
  run_timed "e2e default suite" run_playwright_suite default test:e2e || {
    status=$?
    echo "E2E tests failed. Captured artifacts:" >&2
    print_playwright_artifact_summary
    return "${status}"
  }
  # The long-lived Turbopack server can lose dynamic routes or stop completing
  # requests after route-stress specs in hosted CI. Give each proven stressor
  # its own short-lived server so compiler state cannot cross suites.
  run_timed "customer-push dev reset" reset_dev_output
  run_timed "e2e customer-push suite" run_playwright_suite customer-push test:e2e:customer-push || {
    status=$?
    echo "Customer-push E2E tests failed. Captured artifacts:" >&2
    print_playwright_artifact_summary
    return "${status}"
  }
  run_timed "navigation dev reset" reset_navigation_output
  run_timed "e2e navigation suite" run_playwright_suite navigation test:e2e:navigation || {
    status=$?
    echo "Navigation E2E tests failed. Captured artifacts:" >&2
    print_playwright_artifact_summary
    return "${status}"
  }
  # Guided first-run onboarding runs in its own config so its flag-on dev server
  # never overlaps the default flag-off one (CHAOS-2670).
  run_timed "e2e onboarding suite" run_playwright_suite onboarding test:e2e:onboarding || {
    status=$?
    echo "Onboarding E2E tests failed. Captured artifacts:" >&2
    print_playwright_artifact_summary
    return "${status}"
  }
  run_timed "e2e context-fabric suite" run_playwright_suite context-fabric test:e2e:context-fabric || {
    status=$?
    echo "Context Fabric production E2E tests failed. Captured artifacts:" >&2
    print_playwright_artifact_summary
    return "${status}"
  }
  print_playwright_artifact_summary
}

run_pagerduty_final_qa() {
  local report_root="${1:-${PLAYWRIGHT_REPORT_ROOT}}"
  local results_root="${2:-${PLAYWRIGHT_RESULTS_ROOT}}"

  PLAYWRIGHT_REPORT_ROOT="${report_root}" \
    PLAYWRIGHT_RESULTS_ROOT="${results_root}" \
    run_isolated_e2e_suite pagerduty-final-qa test:e2e:pagerduty-final-qa
}

run_playwright_suite() {
  local suite_name="$1"
  local script_name="$2"
  shift 2
  local report_directory="${PLAYWRIGHT_REPORT_ROOT}/${suite_name}"
  local results_directory="${PLAYWRIGHT_RESULTS_ROOT}/${suite_name}"

  echo "==> pnpm ${script_name} (${suite_name})"
  PLAYWRIGHT_HTML_REPORT="${report_directory}" \
    PLAYWRIGHT_JUNIT_OUTPUT_NAME="${results_directory}/junit.xml" \
    PLAYWRIGHT_RESULTS_DIR="${results_directory}" \
    pnpm "${script_name}" "$@"
}

validate_playwright_shard() {
  local shard="$1"
  local current
  local total

  if [[ ! "${shard}" =~ ^([1-9][0-9]*)/([1-9][0-9]*)$ ]]; then
    echo "Invalid Playwright shard '${shard}'; expected current/total with positive integers." >&2
    return 1
  fi

  current="${BASH_REMATCH[1]}"
  total="${BASH_REMATCH[2]}"
  if (( current > total )); then
    echo "Invalid Playwright shard '${shard}'; current must not exceed total." >&2
    return 1
  fi
}

run_isolated_e2e_suite() {
  local suite_name="$1"
  local script_name="$2"
  shift 2
  local status

  run_timed "${suite_name} artifact preparation" prepare_playwright_artifacts
  run_timed "${suite_name} browser installation" install_playwright_browser
  print_e2e_diagnostics
  if run_timed "${suite_name} suite" run_playwright_suite "${suite_name}" "${script_name}" "$@"; then
    print_playwright_artifact_summary
    return 0
  else
    status=$?
    echo "${suite_name} E2E tests failed. Captured artifacts:" >&2
    print_playwright_artifact_summary
    return "${status}"
  fi
}

run_e2e_default() {
  local shard="$1"
  local artifact_suite="default-${shard//\//-}"

  validate_playwright_shard "${shard}"
  run_isolated_e2e_suite "${artifact_suite}" test:e2e --shard "${shard}"
}

run_e2e_customer_push() {
  run_isolated_e2e_suite customer-push test:e2e:customer-push
}

run_e2e_navigation() {
  reset_navigation_output
  run_isolated_e2e_suite navigation test:e2e:navigation
}

run_e2e_onboarding() {
  run_isolated_e2e_suite onboarding test:e2e:onboarding
}

run_e2e_context_fabric() {
  run_isolated_e2e_suite context-fabric test:e2e:context-fabric
}

# CHAOS-12138: a skipped live test is an environment fault, not a pass. Run the tier, then fail
# on any skipped test and print the counts. The gate runs even when playwright failed, so the
# summary always shows; the first non-zero status wins.
run_live_e2e() {
  install_playwright_browser
  local json="${LIVE_E2E_JSON:-playwright-report/live-results.json}"
  rm -f "${json}"
  local status=0
  LIVE_E2E_JSON="${json}" run_pnpm_script test:e2e:live || status=$?
  node ci/live-e2e-skip-gate.mjs "${json}" "${LIVE_E2E_LABEL:-default}" || status=$?
  return "${status}"
}

case "${tier}" in
  format)
    run_pnpm_script format:check:changed
    ;;
  quality)
    run_quality
    ;;
  build)
    run_build
    ;;
  unit)
    run_unit
    ;;
  auth-profiles-gate)
    run_auth_profiles_gate
    ;;
  access-token-corpus)
    run_access_token_corpus
    ;;
  e2e)
    run_e2e
    ;;
  e2e-default)
    run_e2e_default "$2"
    ;;
  e2e-customer-push)
    run_e2e_customer_push
    ;;
  e2e-navigation)
    run_e2e_navigation
    ;;
  e2e-onboarding)
    run_e2e_onboarding
    ;;
  e2e-context-fabric)
    run_e2e_context_fabric
    ;;
  pagerduty-final-qa)
    run_pagerduty_final_qa
    ;;
  live-e2e)
    run_live_e2e
    ;;
  live-e2e-two-pass)
    status=0
    run_live_e2e || status=$?
    bash ci/live-e2e-restart-go-api.sh || exit 1
    LIVE_GUIDED_ONBOARDING=1 LIVE_E2E_JSON=playwright-report/live-results-guided.json LIVE_E2E_LABEL=guided run_live_e2e || status=$?
    exit "${status}"
    ;;
  live-e2e-guided)
    LIVE_GUIDED_ONBOARDING=1 LIVE_E2E_JSON=playwright-report/live-results-guided.json LIVE_E2E_LABEL=guided run_live_e2e
    ;;
  design-lint)
    run_pnpm_script design-lint
    ;;
  ci)
    export CI=true
    run_pnpm_script format:check:changed
    run_quality
    run_build
    run_unit
    run_auth_profiles_gate
    run_e2e
    run_pagerduty_final_qa "${PLAYWRIGHT_REPORT_ROOT}/pagerduty-final-qa" "${PLAYWRIGHT_RESULTS_ROOT}/pagerduty-final-qa"
    ;;
  *)
    usage
    exit 1
    ;;
esac
