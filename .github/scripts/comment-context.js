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
      commentBody === '/runtests' &&
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
    }
  }

  core.setOutput('should_run', shouldRun ? 'true' : 'false');
  core.setOutput('pull_number', pullNumber);
  core.setOutput('head_sha', headSha);
};
