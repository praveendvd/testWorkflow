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

  // Create the final check run with the conclusion
  const { owner, repo } = context.repo;
  let head_sha = context.sha;
  if (context.eventName === 'pull_request') {
    head_sha = context.payload.pull_request.head.sha;
  }

  const checkPayload = {
    name: 'E2E (Internal & Prod)',
    head_sha,
    status: 'completed',
    conclusion,
    output: {
      title,
      summary,
    },
  };

  await github.rest.checks.create({
    owner,
    repo,
    ...checkPayload,
  });
  console.error(`[e2e-gate] Created final check with conclusion=${conclusion}`);




};