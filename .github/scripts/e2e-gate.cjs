module.exports = async ({ core, context, github }) => {
  const internalResult = process.env.E2E_INTERNAL_RESULT ?? '';
  const prodResult = process.env.E2E_PROD_RESULT ?? '';
  const enableE2ECommentValidation = process.env.ENABLE_E2E_COMMENT_VALIDATION === 'true';
  const checkRunId = process.env.CHECK_RUN_ID; // passed from workflow

  // Determine conclusion based on your rules
  let conclusion = 'success';
  let title = 'E2E (Internal & Prod)';
  let summary = '';

  if (internalResult === 'success' && prodResult === 'success') {
    conclusion = 'success';
    title = 'E2E Internal and Prod passed';
    summary = 'Both E2E stages passed successfully.';
  } else if (internalResult === 'skipped' && prodResult === 'skipped') {
    if (enableE2ECommentValidation) {
      conclusion = 'failure';
      title = 'E2E skipped';
      summary = 'E2E skipped. Comment /runtests on this PR to run E2E on the latest head commit.';
    } else {
      conclusion = 'failure';
      title = 'E2E required but skipped';
      summary = 'ENABLE_E2E_COMMENT_VALIDATION is false, but both E2E stages were skipped. They must succeed.';
    }
  } else {
    conclusion = 'failure';
    title = 'E2E gate failed';
    summary = `E2E gate failed: internal=${internalResult}, prod=${prodResult}`;
  }
  // Determine head_sha and pull_number for check creation
  const { owner, repo } = context.repo;
  let head_sha;
  let pull_number;

  const eventName = context.eventName;
  if (eventName === 'pull_request') {
    head_sha = context.payload.pull_request.head.sha;
    pull_number = context.payload.pull_request.number;
  } else if (eventName === 'issue_comment') {
    const issueNumber = context.payload.issue.number;
    const { data: pullRequest } = await github.rest.pulls.get({
      owner,
      repo,
      pull_number: issueNumber,
    });
    head_sha = pullRequest.head.sha;
    pull_number = issueNumber;
  } else {
    head_sha = context.sha;
    pull_number = 'unknown';
  }

  const checksUrl = `https://github.com/${owner}/${repo}/pull/${pull_number}/checks`;

  // Create the check run ONLY if shouldRun is true
  let checkRunId = null;

  const checkPayload = {
    name: 'E2E (Internal & Prod)',
    head_sha,
    status: 'completed',  // or 'queued'
    details_url: checksUrl,
    conclusion,
    output: {
      title,
      summary,
    },
  };
  const created = await github.rest.checks.create({
    owner,
    repo,
    ...checkPayload,
  });
  checkRunId = created.data.id;
  console.error(`[comment-context] Created check run ID: ${checkRunId}`);

};


