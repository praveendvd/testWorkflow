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

  // Rule 2: both passed -> success
  if (internalResult === 'success' && prodResult === 'success') {
    conclusion = 'success';
    title = 'E2E Internal and Prod passed';
    summary = 'Both E2E stages passed successfully.';
    console.error('[e2e-gate] Both E2E passed -> success');
  }
  // Rule 3: both skipped and comment validation enabled -> failure with skip message
  else if (internalResult === 'skipped' && prodResult === 'skipped') {
    if (enableE2ECommentValidation) {
      conclusion = 'failure';
      title = 'E2E skipped';
      summary =
        'E2E skipped. Comment /runtests on this PR to run E2E on the latest head commit.';
      console.error('[e2e-gate] Both skipped, comment validation enabled -> failure (skip)');
    } else {
      // Rule 4: comment validation disabled -> failure because both must succeed
      conclusion = 'failure';
      title = 'E2E required but skipped';
      summary =
        'ENABLE_E2E_COMMENT_VALIDATION is false, but both E2E stages were skipped. They must succeed.';
      console.error('[e2e-gate] Both skipped, comment validation disabled -> failure');
    }
  }
  // Rule 5: any other combination (one fails, one skips, one passes, etc.) -> failure
  else {
    conclusion = 'failure';
    title = 'E2E gate failed';
    summary = `E2E gate failed: internal=${internalResult}, prod=${prodResult}`;
    console.error(`[e2e-gate] Unsuccessful combination: internal=${internalResult}, prod=${prodResult} -> failure`);
  }

  // Determine head_sha and pull_number for the check
  const { owner, repo } = context.repo;
  const head_sha =
    eventName === 'pull_request'
      ? context.payload.pull_request.head.sha
      : process.env.COMMENT_HEAD_SHA ?? '';
  const pull_number =
    eventName === 'pull_request'
      ? context.payload.pull_request.number
      : process.env.COMMENT_PULL_NUMBER ?? '';
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
  // Do not fail the reporter job; the check run itself carries the gating status.
};