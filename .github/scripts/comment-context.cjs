// Evaluates whether E2E tests should run and manages the "E2E (Internal & Prod)".
// check-run state so users see real-time feedback.
//
// When ENABLE_E2E_COMMENT_VALIDATION=true:
//   - pull_request event  → creates the check as "queued" (waiting for /runtests)
//   - issue_comment /runtests → sets the existing check to "in_progress"
//
// Outputs: should_run, pull_number, head_sha

module.exports = async ({ github, context, core }) => {
  const enable = process.env.ENABLE_E2E_COMMENT_VALIDATION === 'true';
  const eventName = context.eventName;
  const { owner, repo } = context.repo;

  let shouldRun = false;
  let pullNumber = '';
  let headSha = '';

  if (eventName === 'pull_request') {
    shouldRun = !enable;
    pullNumber = String(context.payload.pull_request.number);
    headSha = context.payload.pull_request.head.sha;

    if (enable) {
      const checksUrl = `https://github.com/${owner}/${repo}/pull/${pullNumber}/checks`;
      await github.rest.checks.create({
        owner,
        repo,
        name: 'E2E (Internal & Prod)',
        head_sha: headSha,
        status: 'completed',
        conclusion: 'failure',
        details_url: checksUrl,
        output: {
          title: 'E2E not started',
          summary: 'Comment `/runtests` on this PR to run E2E on the latest commit.'
        }
      });
    }
  } else if (eventName === 'issue_comment') {
    const issue = context.payload.issue;
    const commentBody = (context.payload.comment?.body || '').trim();
    const association = context.payload.comment?.author_association || '';
    const allowedAssociations = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

    if (enable && issue?.pull_request && commentBody === '/runtests' && allowedAssociations.has(association)) {
      pullNumber = String(issue.number);
      const pr = await github.rest.pulls.get({ owner, repo, pull_number: issue.number });
      headSha = pr.data.head.sha;
      shouldRun = true;

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
          status: 'in_progress',
          details_url: checksUrl,
          output: {
            title: 'E2E in progress',
            summary: 'E2E triggered by `/runtests` comment. Tests are running.'
          }
        });
      } else {
        await github.rest.checks.create({
          owner,
          repo,
          name: 'E2E (Internal & Prod)',
          head_sha: headSha,
          status: 'in_progress',
          details_url: checksUrl,
          output: {
            title: 'E2E in progress',
            summary: 'E2E triggered by `/runtests` comment. Tests are running.'
          }
        });
      }
    }
  }

  core.setOutput('should_run', shouldRun ? 'true' : 'false');
  core.setOutput('pull_number', pullNumber);
  core.setOutput('head_sha', headSha);
};
