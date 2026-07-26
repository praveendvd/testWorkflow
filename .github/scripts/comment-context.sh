#!/usr/bin/env bash
set -e

GH_TOKEN="${GH_TOKEN?Missing GH_TOKEN}"
ENABLE="${ENABLE_E2E_COMMENT_VALIDATION:-false}"

EVENT_NAME="${GITHUB_EVENT_NAME?Missing GITHUB_EVENT_NAME}"
REPO="${GITHUB_REPOSITORY?Missing GITHUB_REPOSITORY}"
GITHUB_SHA="${GITHUB_SHA?Missing GITHUB_SHA}"
GITHUB_RUN_ID="${GITHUB_RUN_ID?Missing GITHUB_RUN_ID}"
GITHUB_WORKFLOW="${GITHUB_WORKFLOW?Missing GITHUB_WORKFLOW}"
GITHUB_SERVER_URL="${GITHUB_SERVER_URL:-https://github.com}"

if [ -f "$GITHUB_EVENT_PATH" ]; then
  PR_HEAD_SHA=$(jq -r '.pull_request.head.sha // empty' "$GITHUB_EVENT_PATH")
  PR_HEAD_REF=$(jq -r '.pull_request.head.ref // empty' "$GITHUB_EVENT_PATH")
  PR_NUMBER=$(jq -r '.pull_request.number // empty' "$GITHUB_EVENT_PATH")
  COMMENT_BODY=$(jq -r '.comment.body // empty' "$GITHUB_EVENT_PATH")
  ISSUE_NUMBER=$(jq -r '.issue.number // empty' "$GITHUB_EVENT_PATH")
  AUTHOR_ASSOCIATION=$(jq -r '.comment.author_association // empty' "$GITHUB_EVENT_PATH")
else
  echo "Error: GITHUB_EVENT_PATH not set or file missing"
  exit 1
fi

SHOULD_RUN="false"
CREATE_CHECK="false"
HEAD_SHA=""
PULL_NUMBER=""
BRANCH_NAME=""
TRIGGERED_BY_SLASH="false"
COMMENT_REPLY="false"

if [ "$EVENT_NAME" = "pull_request" ]; then
  HEAD_SHA="$PR_HEAD_SHA"
  BRANCH_NAME="$PR_HEAD_REF"
  PULL_NUMBER="$PR_NUMBER"
  CREATE_CHECK="true"
  [ "$ENABLE" != "true" ] && SHOULD_RUN="true" || SHOULD_RUN="false"

elif [ "$EVENT_NAME" = "issue_comment" ]; then
  NORMALIZED=$(echo "$COMMENT_BODY" | tr '[:upper:]' '[:lower:]' | xargs)
  if [[ "$NORMALIZED" == "/runtests" || "$NORMALIZED" == "/runchecks" ]]; then
    if [[ "$AUTHOR_ASSOCIATION" == "OWNER" || "$AUTHOR_ASSOCIATION" == "MEMBER" || "$AUTHOR_ASSOCIATION" == "COLLABORATOR" ]]; then
      if [ "$ENABLE" = "true" ]; then
        SHOULD_RUN="true"
        CREATE_CHECK="true"
        TRIGGERED_BY_SLASH="true"
        COMMENT_REPLY="true"
        PR_DATA=$(curl -s -H "Authorization: Bearer $GH_TOKEN" \
          "https://api.github.com/repos/$REPO/pulls/$ISSUE_NUMBER")
        HEAD_SHA=$(echo "$PR_DATA" | jq -r '.head.sha')
        BRANCH_NAME=$(echo "$PR_DATA" | jq -r '.head.ref')
        PULL_NUMBER="$ISSUE_NUMBER"
      fi
    fi
  fi
else
  HEAD_SHA="$GITHUB_SHA"
  PULL_NUMBER="unknown"
  CREATE_CHECK="false"
fi

[ -z "$HEAD_SHA" ] && HEAD_SHA="$GITHUB_SHA"

CHECK_RUN_ID=""
if [ "$CREATE_CHECK" = "true" ]; then
  CHECK_NAME="E2E (Internal & Prod)"
  CHECK_URL="$GITHUB_SERVER_URL/$REPO/pull/$PULL_NUMBER/checks"

  RESPONSE=$(curl -s -X POST \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer $GH_TOKEN" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/$REPO/check-runs" \
    -d "{\"name\":\"$CHECK_NAME\",\"head_sha\":\"$HEAD_SHA\",\"status\":\"in_progress\",\"details_url\":\"$CHECK_URL\",\"output\":{\"title\":\"E2E tests in progress\",\"summary\":\"The E2E tests have been triggered and are running.\"}}")

  CHECK_RUN_ID=$(echo "$RESPONSE" | jq -r '.id')
  if [ -z "$CHECK_RUN_ID" ] || [ "$CHECK_RUN_ID" = "null" ]; then
    echo "Error: Failed to create check run. Response: $RESPONSE"
    exit 1
  fi
  echo "Created check run ID: $CHECK_RUN_ID"

  if [ "$COMMENT_REPLY" = "true" ]; then
    SHORT_SHA=$(echo "$HEAD_SHA" | cut -c1-7)
    WORKFLOW_RUN_URL="$GITHUB_SERVER_URL/$REPO/actions/runs/$GITHUB_RUN_ID"
    COMMENT_BODY="PR checks were requested via slash command (/runchecks / /runtests).

Branch: \`$BRANCH_NAME\`
Commit: \`$SHORT_SHA\`
Dispatched: \`$GITHUB_WORKFLOW@$BRANCH_NAME\`
Workflow run: [$GITHUB_WORKFLOW]($WORKFLOW_RUN_URL)
PR checks: [View checks]($CHECK_URL)

Track progress in GitHub Actions (workflow run links above). Required checks update when jobs finish.  
Re-run after new pushes with /runchecks (or /runtests)."

    COMMENT_JSON=$(jq -n --arg body "$COMMENT_BODY" '{body: $body}')
    curl -s -X POST \
      -H "Accept: application/vnd.github+json" \
      -H "Authorization: Bearer $GH_TOKEN" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "https://api.github.com/repos/$REPO/issues/$PULL_NUMBER/comments" \
      -d "$COMMENT_JSON"
    echo "Posted initial comment on PR #$PULL_NUMBER"
  fi
fi

echo "should_run=$SHOULD_RUN" >> "$GITHUB_OUTPUT"
echo "check_run_id=$CHECK_RUN_ID" >> "$GITHUB_OUTPUT"
echo "pull_number=$PULL_NUMBER" >> "$GITHUB_OUTPUT"
echo "branch_name=$BRANCH_NAME" >> "$GITHUB_OUTPUT"
echo "triggered_by_slash=$TRIGGERED_BY_SLASH" >> "$GITHUB_OUTPUT"