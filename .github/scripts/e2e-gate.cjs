module.exports = async ({ github, context }) => {
  const eventName = context.eventName;
  const validation = process.env.VALIDATION_RESULT ?? '';
  const internal = process.env.E2E_INTERNAL_RESULT ?? '';
  const prod = process.env.E2E_PROD_RESULT ?? '';
  const enableE2ECommentValidation =
    process.env.ENABLE_E2E_COMMENT_VALIDATION === 'true';

  let conclusion = 'success';
  let title = 'E2E Internal and Prod passed';
  let summary = `internal=${internal}, prod=${prod}`;

  if (eventName === 'pull_request' && validation !== 'success') {
    conclusion = 'failure';
    title = 'Validation did not succeed';
    summary = `Validation result is ${validation}.`;
  } else if (eventName === 'pull_request' && enableE2ECommentValidation) {
    if (internal === 'success' && prod === 'success') {
      conclusion = 'success';
      title = 'E2E Internal and Prod passed';
      summary = 'Both E2E stages passed in this run.';
    } else {
      conclusion = 'failure';
      title = 'E2E not started';
      summary =
        'Comment /runtests on this PR to run E2E on the latest head commit.';
    }
  } else if (internal === 'success' && prod === 'success') {
    conclusion = 'success';
    title = 'E2E Internal and Prod passed';
    summary = 'Both E2E stages passed in continuous mode.';
  } else {
    conclusion = 'failure';
    title = 'E2E failed';
    summary = `E2E gate failed: internal=${internal}, prod=${prod}`;
  }

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

  const existing = await github.rest.checks.listForRef({
    owner,
    repo,
    ref: head_sha,
    check_name: 'E2E (Internal & Prod)',
    per_page: 100,
  });

  const existingRun = existing.data.check_runs
    .filter((run) => run.name === 'E2E (Internal & Prod)')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

  const checkPayload = {
    status: 'completed',
    conclusion,
    details_url: checksUrl,
    output: {
      title,
      summary,
    },
  };

  if (existingRun) {
    await github.rest.checks.update({
      owner,
      repo,
      check_run_id: existingRun.id,
      ...checkPayload,
    });
  } else {
    await github.rest.checks.create({
      owner,
      repo,
      name: 'E2E (Internal & Prod)',
      head_sha,
      ...checkPayload,
    });
  }

  // Do not fail this reporter job itself; the required check-run
  // "E2E (Internal & Prod)" already carries the gating conclusion.
};
