#!/bin/bash
# Shared script to generate version tags for builds
# Usage: generate-version-tag.sh [custom_tag] [validate_docker]
#
# Parameters:
#   custom_tag: Optional custom tag from workflow_dispatch input
#   validate_docker: Set to "true" to validate tag format for Docker compatibility
#
# Environment variables expected:
#   GITHUB_REF, GITHUB_EVENT_NAME, GITHUB_SHA, GITHUB_REF_NAME, 
#   GITHUB_EVENT_PULL_REQUEST_NUMBER (for PRs)

set -e

CUSTOM_TAG="${1:-}"
VALIDATE_DOCKER="${2:-false}"

# Determine the tag based on context
if [ -n "${CUSTOM_TAG}" ]; then
  # Manual dispatch with custom tag - validate input
  TAG_INPUT="${CUSTOM_TAG}"
  
  if [ "${VALIDATE_DOCKER}" = "true" ]; then
    # Check for consecutive periods or trailing period
    if echo "${TAG_INPUT}" | grep -qE '(\.\.|\.$)' ; then
      echo "Error: Invalid Docker tag '${TAG_INPUT}'. Tags cannot contain consecutive periods or end with a period." >&2
      exit 1
    fi
    # Validate Docker tag format: must start with [A-Za-z0-9_], max 128 chars
    # Trailing period check above ensures tags don't end with periods
    if ! echo "${TAG_INPUT}" | grep -Eq '^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$'; then
      echo "Error: Invalid Docker tag '${TAG_INPUT}'. Tags must start with alphanumeric or underscore, contain only [A-Za-z0-9_.-], and be 1-128 chars." >&2
      exit 1
    fi
  else
    # Validate general tag format
    if ! echo "${TAG_INPUT}" | grep -Eq '^[A-Za-z0-9._-]+$'; then
      echo "Error: Invalid tag format '${TAG_INPUT}'. Allowed characters: letters, digits, '.', '_', '-'." >&2
      exit 1
    fi
  fi
  
  VERSION="${TAG_INPUT}"
elif [[ "${GITHUB_REF}" == refs/tags/v* ]]; then
  # Version tag (v1.0.0)
  VERSION="${GITHUB_REF#refs/tags/}"
elif [[ "${GITHUB_EVENT_NAME}" == "pull_request" ]]; then
  # Pull request
  VERSION="pr-${GITHUB_EVENT_PULL_REQUEST_NUMBER}"
elif [[ "${GITHUB_REF}" == refs/heads/main ]]; then
  # Main branch
  VERSION="main-$(echo "${GITHUB_SHA}" | cut -c1-7)"
else
  # Other branches
  BRANCH_NAME=$(echo "${GITHUB_REF_NAME}" | sed 's/[^a-zA-Z0-9]/-/g' | tr '[:upper:]' '[:lower:]')
  VERSION="${BRANCH_NAME}-$(echo "${GITHUB_SHA}" | cut -c1-7)"
fi

echo "${VERSION}"
