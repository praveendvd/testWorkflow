#!/usr/bin/env bash

# comment-context.sh
# Determines if E2E should run and creates a check run.
# Outputs: should_run, check_run_id (via GITHUB_OUTPUT)

set -e

# --- Read environment variables ---
GH_TOKEN="${GH_TOKEN?Missing GH_TOKEN}"
ENABLE="${ENABLE_E2E_COMMENT_VALIDATION:-false}"

# GitHub context available from runner environment
EVENT_NAME="${GITHUB_EVENT_NAME?Missing GITHUB_EVENT_NAME}"
REPO="${GITHUB_REPOSITORY?Missing GITHUB_REPOSITORY}"
GITHUB_SHA="${GITHUB_SHA?Missing GITHUB_SHA}"

# --- Helper to extract GitHub event payload fields ---
if [ -f "$GITHUB_EVENT_PATH" ]; then
  # Use jq to extract fields safely
  PR_HEAD_SHA=$(jq -r '.pull_request.head.sha // empty' "$GITHUB_EVENT_PATH")
  PR_NUMBER=$(jq -r '.pull_request.number // empty' "$GITHUB_EVENT_PATH")
  COMMENT_BODY=$(jq -r '.comment.body // empty' "$GITHUB_EVENT_PATH")
  ISSUE_NUMBER=$(jq -r '.issue.number // empty' "$GITHUB_EVENT_PATH")
  AUTHOR_ASSOCIATION=$(jq -r '.comment.author_association // empty' "$GITHUB_EVENT_PATH")
else
  echo "Error: GITHUB_EVENT_PATH not set or file missing"
  exit 1
fi

# --- Variables ---
SHOULD_RUN="false"
CREATE_CHECK="false"
HEAD_SHA=""
PULL_NUMBER=""

# --- Evaluate context ---
if [ "$EVENT_NAME" = "pull_request" ]; then
  HEAD_SHA="$PR_HEAD_SHA"
  PULL_NUMBER="$PR_NUMBER"
  CREATE_CHECK="true"
  if [ "$ENABLE" != "true" ]; then
    SHOULD_RUN="true"
  else
    SHOULD_RUN="false"
  fi

elif [ "$EVENT_NAME" = "issue_comment" ]; then
  # Normalize comment
  NORMALIZED=$(echo "$COMMENT_BODY" | tr '[:upper:]' '[:lower:]' | xargs)
  if [[ "$NORMALIZED" == "/runtests" || "$NORMALIZED" == "/runchecks" ]]; then
    if [[ "$AUTHOR_ASSOCIATION" == "OWNER" || "$AUTHOR_ASSOCIATION" == "MEMBER" || "$AUTHOR_ASSOCIATION" == "COLLABORATOR" ]]; then
      if [ "$ENABLE" = "true" ]; then
        SHOULD_RUN="true"
        CREATE_CHECK="true"
        # Fetch PR info to get head_sha
        PR_DATA=$(curl -s -H "Authorization: Bearer $GH_TOKEN" \
          "https://api.github.com/repos/$REPO/pulls/$ISSUE_NUMBER")
        HEAD_SHA=$(echo "$PR_DATA" | jq -r '.head.sha')
        PULL_NUMBER="$ISSUE_NUMBER"
      fi
    fi
  fi
else
  # Fallback for other events (e.g., workflow_dispatch)
  HEAD_SHA="$GITHUB_SHA"
  PULL_NUMBER="unknown"
  CREATE_CHECK="false"
fi

# Fallback for HEAD_SHA
if [ -z "$HEAD_SHA" ]; then
  HEAD_SHA="$GITHUB_SHA"
fi

echo "Event: $EVENT_NAME, should_run: $SHOULD_RUN, create_check: $CREATE_CHECK, HEAD_SHA: $HEAD_SHA"

CHECK_RUN_ID=""

if [ "$CREATE_CHECK" = "true" ]; then
  CHECK_NAME="E2E (Internal & Prod)"
  CHECK_URL="https://github.com/$REPO/pull/$PULL_NUMBER/checks"

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
fi

# --- Set outputs for the job ---
echo "should_run=$SHOULD_RUN" >> "$GITHUB_OUTPUT"
echo "check_run_id=$CHECK_RUN_ID" >> "$GITHUB_OUTPUT"