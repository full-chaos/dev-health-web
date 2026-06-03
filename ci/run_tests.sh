#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: ci/run_tests.sh <quality|build|unit|integration|e2e|live-e2e|design-lint|ci>" >&2
}

if [[ $# -ne 1 ]]; then
  usage
  exit 1
fi

tier="$1"

export TZ=UTC
export LANG=C.UTF-8
export LC_ALL=C.UTF-8
export NODE_ENV=test
export NEXT_TELEMETRY_DISABLED=1
export FORCE_COLOR=0

PLAYWRIGHT_REPORT_DIR="${PLAYWRIGHT_REPORT_DIR:-playwright-report}"
PLAYWRIGHT_RESULTS_DIR="${PLAYWRIGHT_RESULTS_DIR:-test-results/playwright}"
PLAYWRIGHT_JUNIT_PATH="${PLAYWRIGHT_JUNIT_PATH:-${PLAYWRIGHT_RESULTS_DIR}/junit.xml}"

export PLAYWRIGHT_HTML_REPORT="${PLAYWRIGHT_HTML_REPORT:-${PLAYWRIGHT_REPORT_DIR}}"
export PLAYWRIGHT_JUNIT_OUTPUT_NAME="${PLAYWRIGHT_JUNIT_OUTPUT_NAME:-${PLAYWRIGHT_JUNIT_PATH}}"

run_pnpm_script() {
  local script_name="$1"
  echo "==> pnpm ${script_name}"
  pnpm "${script_name}"
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
  echo "==> e2e diagnostics"
  echo "CI=${CI:-false}"
  echo "NODE_ENV=${NODE_ENV}"
  echo "PLAYWRIGHT_HTML_REPORT=${PLAYWRIGHT_HTML_REPORT}"
  echo "PLAYWRIGHT_JUNIT_OUTPUT_NAME=${PLAYWRIGHT_JUNIT_OUTPUT_NAME}"
  echo "PLAYWRIGHT_RESULTS_DIR=${PLAYWRIGHT_RESULTS_DIR}"
  echo "node $(node --version)"
  echo "pnpm $(pnpm --version)"
  echo "playwright $(npx playwright --version)"
}

prepare_playwright_artifacts() {
  if [[ -z "${PLAYWRIGHT_HTML_REPORT}" || -z "${PLAYWRIGHT_RESULTS_DIR}" ]]; then
    echo "Playwright artifact directories must not be empty." >&2
    exit 1
  fi

  rm -rf "${PLAYWRIGHT_HTML_REPORT}" "${PLAYWRIGHT_RESULTS_DIR}"
  mkdir -p "${PLAYWRIGHT_HTML_REPORT}" "${PLAYWRIGHT_RESULTS_DIR}"
}

print_playwright_artifact_summary() {
  echo "==> playwright artifact summary"
  for artifact_path in "${PLAYWRIGHT_HTML_REPORT}" "${PLAYWRIGHT_RESULTS_DIR}"; do
    if [[ -d "${artifact_path}" ]]; then
      echo "  ${artifact_path}"
      find "${artifact_path}" -maxdepth 2 -type f | sort || true
    else
      echo "  ${artifact_path} (missing)"
    fi
  done
}

run_unit() {
  run_pnpm_script test:unit
}

run_quality() {
  echo "==> pnpm audit --audit-level=high --prod"
  pnpm audit --audit-level=high --prod
  run_pnpm_script codegen:check
  run_pnpm_script lint
  run_pnpm_script typecheck
}

run_build() {
  run_pnpm_script build
}

run_design_lint() {
  run_pnpm_script design-lint
}

run_integration() {
  run_pnpm_script test:integration
}

run_e2e() {
  install_playwright_browser
  prepare_playwright_artifacts
  print_e2e_diagnostics
  if ! run_pnpm_script test:e2e; then
    echo "E2E tests failed. Captured artifacts:" >&2
    print_playwright_artifact_summary
    return 1
  fi
  print_playwright_artifact_summary
}

run_live_e2e() {
  install_playwright_browser
  run_pnpm_script test:e2e:live
}

case "${tier}" in
  quality)
    run_quality
    ;;
  build)
    run_build
    ;;
  unit)
    run_unit
    ;;
  integration)
    run_integration
    ;;
  e2e)
    run_e2e
    ;;
  live-e2e)
    run_live_e2e
    ;;
  design-lint)
    run_design_lint
    ;;
  ci)
    export CI=true
    run_quality
    run_build
    run_unit
    run_integration
    run_e2e
    ;;
  *)
    usage
    exit 1
    ;;
esac
