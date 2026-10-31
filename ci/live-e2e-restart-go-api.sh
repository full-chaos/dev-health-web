#!/usr/bin/env bash
# CHAOS-12138: restart the live-e2e go-api with AUTH_AUTO_CREATE_ORG_ON_REGISTER=false and the rest
# of its environment unchanged (saved by the "Start dev-health-ops go-api" step).
set -euo pipefail

kill "$(cat /tmp/dev-health-go-api.pid)"
for _ in {1..30}; do
  kill -0 "$(cat /tmp/dev-health-go-api.pid)" 2>/dev/null || break
  sleep 1
done

mapfile -d '' -t saved_env </tmp/dev-health-go-api.environ
(
  cd dev-health-ops
  env "${saved_env[@]}" AUTH_AUTO_CREATE_ORG_ON_REGISTER=false \
    nohup /tmp/dho api --api-addr=127.0.0.1:8001 --http-addr=127.0.0.1:8002 \
    >/tmp/dev-health-go-api-guided.log 2>&1 &
  echo $! >/tmp/dev-health-go-api.pid
)

for _ in {1..60}; do
  if curl -fsS http://127.0.0.1:8002/healthz >/dev/null; then exit 0; fi
  sleep 2
done
echo "::error::go-api did not restart for the guided-onboarding pass" >&2
cat /tmp/dev-health-go-api-guided.log >&2 || true
exit 1
