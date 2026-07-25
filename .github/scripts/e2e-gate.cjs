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

  console.error(`[e2e-gate] conclusion=${conclusion}, checkRunId=${checkRunId}`);

  const parsedCheckRunId = Number.parseInt(checkRunId || '', 10);
  if (!Number.isInteger(parsedCheckRunId) || parsedCheckRunId <= 0) {
    core.setFailed('[e2e-gate] check_run_id is mandatory and must be a valid integer.');
    throw new Error('Missing or invalid check_run_id; cannot update E2E gate check.');
  }

  // Determine head_sha and pull_number for check creation.
  // For pull_request and PR issue_comment events these must be valid.
  const { owner, repo } = context.repo;
  let head_sha = null;
  let pull_number = null;
  let isPrContext = false;

  if (eventName === 'pull_request') {
    head_sha = context.payload.pull_request?.head?.sha || null;
    pull_number = context.payload.pull_request?.number || null;
    isPrContext = true;
  } else if (eventName === 'issue_comment') {
    if (!issue?.pull_request) {
      core.info('[comment-context] issue_comment is not on a pull request. Skipping E2E check creation.');
      core.setOutput('should_run', 'false');
      core.setOutput('check_run_id', '');
      return;
    }

    const issueNumber = context.payload.issue.number;
    const { data: pullRequest } = await github.rest.pulls.get({
      owner,
      repo,
      pull_number: issueNumber,
    });
    head_sha = pullRequest?.head?.sha || null;
    pull_number = issueNumber;
    isPrContext = true;
  } else {
    core.info(`[comment-context] Unsupported event \"${eventName}\". Skipping E2E check creation.`);
    core.setOutput('should_run', 'false');
    core.setOutput('check_run_id', '');
    return;
  }

  if (!isPrContext || !pull_number || !head_sha) {
    core.setFailed(
      `[comment-context] Invalid PR context. event=${eventName}, pull_number=${String(
        pull_number
      )}, head_sha=${String(head_sha)}`
    );
    throw new Error('Unable to resolve required pull request number and head SHA.');
  }

  const checksUrl = `https://github.com/${owner}/${repo}/pull/${pull_number}/checks`;

  const checkPayload = {
    name: 'E2E (Internal & Prod)',
    head_sha,
    status: 'in_progress',  // or 'queued'
    details_url: checksUrl,
    output: {
      title: 'E2E tests in progress',
      summary: 'The E2E tests have been triggered and are running.',
    },
  };
  const created = await github.rest.checks.create({
    owner,
    repo,
    ...checkPayload,
  });


};