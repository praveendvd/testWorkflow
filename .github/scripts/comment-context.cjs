module.exports = async ({ core, github, context }) => {
  const enable = process.env.ENABLE_E2E_COMMENT_VALIDATION === 'true';
  const eventName = context.eventName;

  let shouldRun = false;
  let pullNumber = '';
  let headSha = '';

  if (eventName === 'pull_request') {
    shouldRun = !enable;
    pullNumber = String(context.payload.pull_request.number);
    headSha = context.payload.pull_request.head.sha;
  } else if (eventName === 'issue_comment') {
    const issue = context.payload.issue;
    const commentBody = (context.payload.comment?.body || '').trim();
    const association = context.payload.comment?.author_association || '';
    const allowedAssociations = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

    if (
      enable &&
      issue?.pull_request &&
      (commentBody === '\\runtests' || commentBody === '/runtests') &&
      allowedAssociations.has(association)
    ) {
      pullNumber = String(issue.number);
      const { owner, repo } = context.repo;
      const pr = await github.rest.pulls.get({
        owner,
        repo,
        pull_number: issue.number,
      });
      headSha = pr.data.head.sha;
      shouldRun = true;

      // Surface immediate feedback that /runtest was accepted and E2E is underway.
      const checksUrl = `https://github.com/${owner}/${repo}/pull/${pullNumber}/checks`;
      const existing = await github.rest.checks.listForRef({
        owner,
        repo,
        ref: headSha,
        check_name: 'E2E (Internal & Prod)',
        per_page: 100,
      });

      const existingRun = existing.data.check_runs
        .filter((run) => run.name === 'E2E (Internal & Prod)')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

      const checkPayload = {
        status: 'in_progress',
        details_url: checksUrl,
        output: {
          title: 'E2E requested',
          summary:
            'Received /runtest. Running E2E Internal and Prod, then publishing gate result.',
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
          head_sha: headSha,
          ...checkPayload,
        });
      }
    }
  }

  core.setOutput('should_run', shouldRun ? 'true' : 'false');
  core.setOutput('pull_number', pullNumber);
  core.setOutput('head_sha', headSha);
};
