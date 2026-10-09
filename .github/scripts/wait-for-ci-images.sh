#!/usr/bin/env bash
# Wait until the pinned ghcr.io mirror refs exist (CHAOS-9070). On a PR that bumps ci/ci-images.json,
# the `mirror` job fills the mirror at the same time the consumers start; this waits for it (up to
# 10 min) and then FAILS if a ref is still missing. It never falls back to Docker Hub.
# Usage: wait-for-ci-images.sh <name>...   (names from ci/ci-images.json; needs docker login first)
set -euo pipefail
for name in "$@"; do
  ref=$(node scripts/bump-ci-images.mjs --ref "${name}" mirror)
  ok=0
  for _ in $(seq 1 60); do
    if docker buildx imagetools inspect "${ref}" >/dev/null 2>&1; then ok=1; break; fi
    echo "waiting for ${ref} ..."
    sleep 10
  done
  if [ "${ok}" -ne 1 ]; then
    echo "mirror ref ${ref} is missing; the 'Mirror CI images' workflow must publish it first" >&2
    exit 1
  fi
  echo "found ${ref}"
done
