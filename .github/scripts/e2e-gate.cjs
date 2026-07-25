module.exports = async ({ github, context }) => {
  const eventName = context.eventName;
  const internalResult = process.env.E2E_INTERNAL_RESULT ?? '';
  const prodResult = process.env.E2E_PROD_RESULT ?? '';
  const enableE2ECommentValidation =
    process.env.ENABLE_E2E_COMMENT_VALIDATION === 'true';

  // Determine conclusion, title, summary
  let conclusion = 'success';
  let title = 'E2E (Internal & Prod)';
  let summary = '';

  if (internalResult === 'success' && prodResult === 'success') {
    conclusion = 'success';
    title = 'E2E Internal and Prod passed';
    summary = 'Both E2E stages passed successfully.';
    console.error('[e2e-gate] Both E2E passed -> success');
  } else if (internalResult === 'skipped' && prodResult === 'skipped') {
    if (enableE2ECommentValidation) {
      conclusion = 'failure';
      title = 'E2E skipped';
      summary = 'E2E skipped. Comment /runtests on this PR to run E2E on the latest head commit.';
      console.error('[e2e-gate] Both skipped, comment validation enabled -> failure (skip)');
    } else {
      conclusion = 'failure';
      title = 'E2E required but skipped';
      summary = 'ENABLE_E2E_COMMENT_VALIDATION is false, but both E2E stages were skipped. They must succeed.';
      console.error('[e2e-gate] Both skipped, comment validation disabled -> failure');
    }
  } else {
    conclusion = 'failure';
    title = 'E2E gate failed';
    summary = `E2E gate failed: internal=${internalResult}, prod=${prodResult}`;
    console.error(`[e2e-gate] Unsuccessful combination: internal=${internalResult}, prod=${prodResult} -> failure`);
  }

  // --- Determine head_sha ---
  const { owner, repo } = context.repo;
  let head_sha;
  let pull_number;

  if (eventName === 'pull_request') {
    head_sha = context.payload.pull_request.head.sha;
    pull_number = context.payload.pull_request.number;
  } else if (eventName === 'issue_comment') {
    // Get the PR number from the issue
    const issueNumber = context.payload.issue.number;
    // Fetch the pull request to get its head SHA
    const { data: pullRequest } = await github.rest.pulls.get({
      owner,
      repo,
      pull_number: issueNumber,
    });
    head_sha = pullRequest.head.sha;
    pull_number = issueNumber;
    console.error(`[e2e-gate] Fetched PR #${issueNumber} head SHA: ${head_sha}`);
  } else {
    // Fallback: use context.sha (the commit that triggered the workflow)
    head_sha = context.sha;
    pull_number = 'unknown';
    console.warn(`[e2e-gate] Unknown event type: ${eventName}, using context.sha: ${head_sha}`);
  }

  const checksUrl = `https://github.com/${owner}/${repo}/pull/${pull_number}/checks`;

  console.error(
    `[e2e-gate] event=${eventName} pr=${pull_number} head=${head_sha} internal=${internalResult} prod=${prodResult} enableComment=${enableE2ECommentValidation}`
  );

  // Create the check run
  const checkPayload = {
    status: 'completed',
    conclusion,
    details_url: checksUrl,
    output: {
      title,
      summary,
    },
  };

  const created = await github.rest.checks.create({
    owner,
    repo,
    name: 'E2E (Internal & Prod)',
    head_sha,
    ...checkPayload,
  });

  console.error(
    `[e2e-gate] created check_run_id=${created.data.id} status=completed conclusion=${conclusion}`
  );
};