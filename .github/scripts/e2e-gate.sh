#!/usr/bin/env bash

set -e

# --- Read environment variables ---
GH_TOKEN="${GH_TOKEN?Missing GH_TOKEN}"
CHECK_RUN_ID="${CHECK_RUN_ID}"
E2E_INTERNAL_RESULT="${E2E_INTERNAL_RESULT}"
E2E_PROD_RESULT="${E2E_PROD_RESULT}"
ENABLE="${ENABLE_E2E_COMMENT_VALIDATION:-false}"
REPO="${GITHUB_REPOSITORY?Missing GITHUB_REPOSITORY}"

# --- If no check run ID, exit early ---
if [ -z "$CHECK_RUN_ID" ] || [ "$CHECK_RUN_ID" = "null" ]; then
  echo "No check run to update (either should_run was false or creation failed). Exiting."
  exit 0
fi

# --- Determine conclusion ---
INTERNAL="$E2E_INTERNAL_RESULT"
PROD="$E2E_PROD_RESULT"
ENABLE="$ENABLE"

if [ "$INTERNAL" = "success" ] && [ "$PROD" = "success" ]; then
  CONCLUSION="success"
  TITLE="E2E Internal and Prod passed"
  SUMMARY="Both E2E stages passed successfully."
elif [ "$INTERNAL" = "skipped" ] && [ "$PROD" = "skipped" ]; then
  if [ "$ENABLE" = "true" ]; then
    CONCLUSION="failure"
    TITLE="E2E skipped"
    SUMMARY="E2E skipped. Comment /runtests on this PR to run E2E on the latest head commit."
  else
    CONCLUSION="failure"
    TITLE="E2E required but skipped"
    SUMMARY="ENABLE_E2E_COMMENT_VALIDATION is false, but both E2E stages were skipped. They must succeed."
  fi
else
  CONCLUSION="failure"
  TITLE="E2E gate failed"
  SUMMARY="E2E gate failed: internal=${INTERNAL}, prod=${PROD}"
fi

# --- Prepare PATCH payload ---
PAYLOAD=$(jq -n \
  --arg status "completed" \
  --arg conclusion "$CONCLUSION" \
  --arg title "$TITLE" \
  --arg summary "$SUMMARY" \
  '{
    status: $status,
    conclusion: $conclusion,
    output: {
      title: $title,
      summary: $summary
    }
  }')

# --- Update the check run ---
curl -s -X PATCH \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/$REPO/check-runs/$CHECK_RUN_ID" \
  -d "$PAYLOAD"

echo "Check run $CHECK_RUN_ID updated with conclusion: $CONCLUSION"