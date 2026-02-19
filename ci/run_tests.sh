#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: ci/run_tests.sh <unit|integration|e2e|ci>" >&2
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

run_npm_script() {
  local script_name="$1"
  echo "==> npm run ${script_name}"
  npm run "${script_name}"
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

run_unit() {
  run_npm_script test:unit
}

run_integration() {
  run_npm_script test:integration
}

run_e2e() {
  install_playwright_browser
  run_npm_script test:e2e
}

case "${tier}" in
  unit)
    run_unit
    ;;
  integration)
    run_integration
    ;;
  e2e)
    run_e2e
    ;;
  ci)
    export CI=true
    run_npm_script lint
    run_npm_script typecheck
    run_npm_script build
    run_unit
    run_integration
    run_e2e
    ;;
  *)
    usage
    exit 1
    ;;
esac
