module.exports = async ({ core, context }) => {
  const enable = process.env.ENABLE_E2E_COMMENT_VALIDATION === 'true';
  const eventName = context.eventName;
  let shouldRun = false;

  if (eventName === 'pull_request') {
    shouldRun = !enable;
  } else if (
    enable &&
    issue?.pull_request &&
    isE2ECommand &&
    allowedAssociations.has(association) &&
    eventName === 'issue_comment'
  ) {
    shouldRun = enable;
  }
  core.setOutput('should_run', shouldRun ? 'true' : 'false');
};
