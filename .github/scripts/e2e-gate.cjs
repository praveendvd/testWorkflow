// Evaluates E2E results and updates (or creates) the "E2E (Internal & Prod)"
// check-run to its final completed state.
//
// Required env vars:
//   ENABLE_E2E_COMMENT_VALIDATION, VALIDATION_RESULT,
//   E2E_INTERNAL_RESULT, E2E_PROD_RESULT, HEAD_SHA, PULL_NUMBER

module.exports = async ({ github, context, core }) => {
  const enableE2ECommentValidation = process.env.ENABLE_E2E_COMMENT_VALIDATION === 'true';
  const validation = process.env.VALIDATION_RESULT;
  const internal = process.env.E2E_INTERNAL_RESULT;
  const prod = process.env.E2E_PROD_RESULT;
  const headSha = process.env.HEAD_SHA;
  const pullNumber = process.env.PULL_NUMBER;

  const { owner, repo } = context.repo;

  let conclusion = 'success';
  let title = 'E2E Internal and Prod passed';
  let summary = `internal=${internal}, prod=${prod}`;

  // When running via /runtests (issue_comment event), the validation job is
  // skipped in this workflow run. Instead, verify that the same SHA already
  // passed `validation / snyk-scan` in a prior pull_request workflow run.
  let validationPassed = validation === 'success';
  if (!validationPassed && enableE2ECommentValidation && validation === 'skipped') {
    const priorChecks = await github.rest.checks.listForRef({
      owner,
      repo,
      ref: headSha,
      check_name: 'validation / snyk-scan',
      per_page: 100,
      filter: 'latest'
    });
    const snykPassed = priorChecks.data.check_runs.some(
      run => run.name === 'validation / snyk-scan' && run.conclusion === 'success'
    );
    if (snykPassed) {
      validationPassed = true;
    }
  }

  if (!validationPassed) {
    conclusion = 'failure';
    title = 'Validation did not succeed';
    summary = enableE2ECommentValidation && validation === 'skipped'
      ? `Validation has not passed for commit ${headSha}. Push a new commit or wait for the pull_request workflow to complete before running /runtests.`
      : `Validation result is ${validation}.`;
  } else if (internal === 'success' && prod === 'success') {
    conclusion = 'success';
    title = 'E2E Internal and Prod passed';
    summary = enableE2ECommentValidation
      ? 'Both E2E stages passed in this run.'
      : 'Both E2E stages passed in continuous mode.';
  } else {
    conclusion = 'failure';
    title = 'E2E failed';
    summary = `E2E gate failed: internal=${internal}, prod=${prod}`;
  }

  const checksUrl = `https://github.com/${owner}/${repo}/pull/${pullNumber}/checks`;

  const existing = await github.rest.checks.listForRef({
    owner,
    repo,
    ref: headSha,
    check_name: 'E2E (Internal & Prod)',
    per_page: 100
  });
  const existingRun = existing.data.check_runs
    .filter(run => run.name === 'E2E (Internal & Prod)')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

  if (existingRun) {
    await github.rest.checks.update({
      owner,
      repo,
      check_run_id: existingRun.id,
      status: 'completed',
      conclusion,
      completed_at: new Date().toISOString(),
      details_url: checksUrl,
      output: { title, summary }
    });
  } else {
    await github.rest.checks.create({
      owner,
      repo,
      name: 'E2E (Internal & Prod)',
      head_sha: headSha,
      status: 'completed',
      conclusion,
      details_url: checksUrl,
      output: { title, summary }
    });
  }

  // Do not fail this reporter job itself; the required check-run
  // "E2E (Internal & Prod)" already carries the gating conclusion.
};
