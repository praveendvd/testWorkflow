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

  // Create the check run and require a valid ID.
  let checkRunId = null;

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
  checkRunId = created?.data?.id ?? null;

  if (!checkRunId) {
    core.setFailed('[comment-context] Failed to create E2E check run: missing check run ID.');
    throw new Error('check_run_id is mandatory but was not generated.');
  }

  console.error(`[comment-context] Created check run ID: ${checkRunId}`);

  core.setOutput('should_run', shouldRun ? 'true' : 'false');
  core.setOutput('check_run_id', checkRunId ? String(checkRunId) : '');
};