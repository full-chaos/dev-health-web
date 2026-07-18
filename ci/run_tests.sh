#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: ci/run_tests.sh <format|quality|build|unit|integration|e2e|live-e2e|design-lint|ci>" >&2
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

PLAYWRIGHT_RESULTS_ROOT="${PLAYWRIGHT_RESULTS_DIR:-test-results/playwright}"
PLAYWRIGHT_REPORT_ROOT="${PLAYWRIGHT_REPORT_DIR:-${PLAYWRIGHT_RESULTS_ROOT}-html}"

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
  echo "PLAYWRIGHT_REPORT_ROOT=${PLAYWRIGHT_REPORT_ROOT}"
  echo "PLAYWRIGHT_RESULTS_ROOT=${PLAYWRIGHT_RESULTS_ROOT}"
  echo "node $(node --version)"
  echo "pnpm $(pnpm --version)"
  echo "playwright $(npx playwright --version)"
}

prepare_playwright_artifacts() {
  if [[ -z "${PLAYWRIGHT_REPORT_ROOT}" || -z "${PLAYWRIGHT_RESULTS_ROOT}" ]]; then
    echo "Playwright artifact directories must not be empty." >&2
    exit 1
  fi

  rm -rf "${PLAYWRIGHT_REPORT_ROOT}" "${PLAYWRIGHT_RESULTS_ROOT}"
  mkdir -p "${PLAYWRIGHT_REPORT_ROOT}" "${PLAYWRIGHT_RESULTS_ROOT}"
}

print_playwright_artifact_summary() {
  echo "==> playwright artifact summary"
  for artifact_path in "${PLAYWRIGHT_REPORT_ROOT}" "${PLAYWRIGHT_RESULTS_ROOT}"; do
    if [[ -d "${artifact_path}" ]]; then
      echo "  ${artifact_path}"
      find "${artifact_path}" -maxdepth 4 -type f | sort || true
    else
      echo "  ${artifact_path} (missing)"
    fi
  done
}

run_unit() {
  run_pnpm_script test:unit
}

run_format() {
  run_pnpm_script format:check:changed
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
  if ! run_playwright_suite default test:e2e; then
    echo "E2E tests failed. Captured artifacts:" >&2
    print_playwright_artifact_summary
    return 1
  fi
  # Guided first-run onboarding runs in its own config so its flag-on dev server
  # never overlaps the default flag-off one (CHAOS-2670).
  if ! run_playwright_suite onboarding test:e2e:onboarding; then
    echo "Onboarding E2E tests failed. Captured artifacts:" >&2
    print_playwright_artifact_summary
    return 1
  fi
  if ! run_playwright_suite context-fabric test:e2e:context-fabric; then
    echo "Context Fabric production E2E tests failed. Captured artifacts:" >&2
    print_playwright_artifact_summary
    return 1
  fi
  print_playwright_artifact_summary
}

run_playwright_suite() {
  local suite_name="$1"
  local script_name="$2"
  local report_directory="${PLAYWRIGHT_REPORT_ROOT}/${suite_name}"
  local results_directory="${PLAYWRIGHT_RESULTS_ROOT}/${suite_name}"

  echo "==> pnpm ${script_name} (${suite_name})"
  PLAYWRIGHT_HTML_REPORT="${report_directory}" \
    PLAYWRIGHT_JUNIT_OUTPUT_NAME="${results_directory}/junit.xml" \
    PLAYWRIGHT_RESULTS_DIR="${results_directory}" \
    pnpm "${script_name}"
}

run_live_e2e() {
  install_playwright_browser
  run_pnpm_script test:e2e:live
}

case "${tier}" in
  format)
    run_format
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
    run_format
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
