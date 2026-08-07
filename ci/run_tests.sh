#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: ci/run_tests.sh <format|quality|build|unit|e2e|e2e-default|e2e-onboarding|e2e-context-fabric|pagerduty-final-qa|live-e2e|design-lint|ci> [current/total]" >&2
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

install_playwright_browser() {
  local os_name
  os_name="$(uname -s)"

  if is_ci && [[ "${os_name}" == "Linux" ]]; then
    echo "==> npx playwright install --with-deps chromium"
    npx playwright install --with-deps chromium
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

run_quality() {
  echo "==> pnpm audit --audit-level=high --prod"
  pnpm audit --audit-level=high --prod
  run_pnpm_script codegen:check
  if [[ -z "${ASK_DEV_OPS_ROOT:-}" ]]; then
    echo "ASK_DEV_OPS_ROOT must name the clean, pinned dev-health-ops checkout." >&2
    return 1
  fi
  echo "==> pnpm ask-dev:contracts:check --source ${ASK_DEV_OPS_ROOT}"
  pnpm ask-dev:contracts:check --source "${ASK_DEV_OPS_ROOT}"
  # CHAOS-3511: the pin's CURRENCY, not only its internal consistency -- a
  # separate ops checkout at main's current tip, diffed against the pinned
  # commit over the consumed surface only (contracts/ask-dev/v1/).
  if [[ -z "${ASK_DEV_OPS_MAIN_ROOT:-}" ]]; then
    echo "ASK_DEV_OPS_MAIN_ROOT must name a clean dev-health-ops checkout at ops main (CHAOS-3511 currency guard)." >&2
    return 1
  fi
  echo "==> pnpm ask-dev:contracts:check-currency --pinned ${ASK_DEV_OPS_ROOT} --current ${ASK_DEV_OPS_MAIN_ROOT}"
  pnpm ask-dev:contracts:check-currency --pinned "${ASK_DEV_OPS_ROOT}" --current "${ASK_DEV_OPS_MAIN_ROOT}"
  run_pnpm_script lint
  run_pnpm_script typecheck
}

run_unit() {
  echo "==> pnpm exec vitest run --coverage"
  pnpm exec vitest run --coverage --coverage.reporter=text --coverage.reporter=lcov
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

run_e2e_onboarding() {
  run_isolated_e2e_suite onboarding test:e2e:onboarding
}

run_e2e_context_fabric() {
  run_isolated_e2e_suite context-fabric test:e2e:context-fabric
}

run_live_e2e() {
  install_playwright_browser
  run_pnpm_script test:e2e:live
}

case "${tier}" in
  format)
    run_pnpm_script format:check:changed
    ;;
  quality)
    run_quality
    ;;
  build)
    run_pnpm_script build
    ;;
  unit)
    run_unit
    ;;
  e2e)
    run_e2e
    ;;
  e2e-default)
    run_e2e_default "$2"
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
  design-lint)
    run_pnpm_script design-lint
    ;;
  ci)
    export CI=true
    run_pnpm_script format:check:changed
    run_quality
    run_pnpm_script build
    run_unit
    run_e2e
    run_pagerduty_final_qa "${PLAYWRIGHT_REPORT_ROOT}/pagerduty-final-qa" "${PLAYWRIGHT_RESULTS_ROOT}/pagerduty-final-qa"
    ;;
  *)
    usage
    exit 1
    ;;
esac
