#!/usr/bin/env bash
set -e

GH_TOKEN="${GH_TOKEN?Missing GH_TOKEN}"
CHECK_RUN_ID="${CHECK_RUN_ID?Missing CHECK_RUN_ID}"
INTERNAL="${E2E_INTERNAL_RESULT:-}"
PROD="${E2E_PROD_RESULT:-}"
ENABLE="${ENABLE_E2E_COMMENT_VALIDATION:-false}"
PULL_NUMBER="${PULL_NUMBER:-}"
BRANCH_NAME="${BRANCH_NAME:-}"
TRIGGERED_BY_SLASH="${TRIGGERED_BY_SLASH:-false}"

if [ -z "$CHECK_RUN_ID" ] || [ "$CHECK_RUN_ID" = "null" ]; then
  echo "No check run to update. Exiting."
  exit 0
fi

# Determine final state
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

# Update the check run
REPO="${GITHUB_REPOSITORY?Missing GITHUB_REPOSITORY}"
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

curl -s -X PATCH \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/$REPO/check-runs/$CHECK_RUN_ID" \
  -d "$PAYLOAD"

echo "Check run $CHECK_RUN_ID updated with conclusion: $CONCLUSION"

# ------------------------------------------------------------
# Post a final comment on the PR (if we have PR info)
# ------------------------------------------------------------
if [ -n "$PULL_NUMBER" ] && [ "$PULL_NUMBER" != "unknown" ] && [ -n "$BRANCH_NAME" ]; then
  # Get head_sha from the check run (or use the one from the environment)
  # We can fetch the check run to get the head_sha
  CHECK_DATA=$(curl -s -H "Authorization: Bearer $GH_TOKEN" \
    "https://api.github.com/repos/$REPO/check-runs/$CHECK_RUN_ID")
  HEAD_SHA=$(echo "$CHECK_DATA" | jq -r '.head_sha')
  SHORT_SHA=$(echo "$HEAD_SHA" | cut -c1-7)

  GITHUB_WORKFLOW="${GITHUB_WORKFLOW:-Pull Request Validation}"
  GITHUB_RUN_ID="${GITHUB_RUN_ID?Missing GITHUB_RUN_ID}"
  GITHUB_SERVER_URL="${GITHUB_SERVER_URL:-https://github.com}"

  WORKFLOW_RUN_URL="$GITHUB_SERVER_URL/$REPO/actions/runs/$GITHUB_RUN_ID"
  CHECK_URL="$GITHUB_SERVER_URL/$REPO/pull/$PULL_NUMBER/checks"

  # Build comment text
  if [ "$TRIGGERED_BY_SLASH" = "true" ]; then
    COMMENT_HEADER="PR checks requested via slash command (/runchecks / /runtests) **completed**"
  else
    COMMENT_HEADER="PR checks **completed**"
  fi

  # Determine status emoji and reason
  if [ "$CONCLUSION" = "success" ]; then
    STATUS_ICON="✅"
    RESULT_LINE="**Result:** Success ($STATUS_ICON)"
  else
    STATUS_ICON="❌"
    RESULT_LINE="**Result:** Failure ($STATUS_ICON)"
  fi

  COMMENT_BODY="${COMMENT_HEADER}

Branch: \`$BRANCH_NAME\`
Commit: \`$SHORT_SHA\`
Dispatched: \`$GITHUB_WORKFLOW@$BRANCH_NAME\`
Workflow run: [$GITHUB_WORKFLOW]($WORKFLOW_RUN_URL)
PR checks: [View checks]($CHECK_URL)
${RESULT_LINE}
**Reason:** $SUMMARY"

  COMMENT_JSON=$(jq -n --arg body "$COMMENT_BODY" '{body: $body}')
  curl -s -X POST \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer $GH_TOKEN" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/$REPO/issues/$PULL_NUMBER/comments" \
    -d "$COMMENT_JSON"

  echo "Posted final comment on PR #$PULL_NUMBER"
else
  echo "Skipping final comment: missing PR number or branch name."
fi