module.exports = async ({ core, context, github }) => {
  const enable = process.env.ENABLE_E2E_COMMENT_VALIDATION === 'true';
  const eventName = context.eventName;
  let shouldRun = false;
  const issue = context.payload.issue;
  const commentBody = (context.payload.comment?.body || '').trim();
  const normalizedComment = commentBody.toLowerCase();
  const isE2ECommand = /^[\\/](runtests|runchecks)$/.test(normalizedComment);
  const association = context.payload.comment?.author_association || '';
  const allowedAssociations = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

  if (eventName === 'pull_request') {
    shouldRun = !enable;
  } else if (
    eventName === 'issue_comment' &&
    enable &&
    issue?.pull_request &&
    isE2ECommand &&
    allowedAssociations.has(association)
  ) {
    shouldRun = true;
  }

  // Determine head_sha and pull_number for check creation
  const { owner, repo } = context.repo;
  let head_sha;
  let pull_number;

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
  checkRunId = created.data.id;
  console.error(`[comment-context] Created check run ID: ${checkRunId}`);

  core.setOutput('should_run', shouldRun ? 'true' : 'false');
  core.setOutput('check_run_id', checkRunId ? String(checkRunId) : '');
};