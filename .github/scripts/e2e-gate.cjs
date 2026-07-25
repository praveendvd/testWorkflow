module.exports = async ({ core, context, github }) => {
  try {
    console.error("[e2e-gate] Script initialization started.");
    
    const internalResult = process.env.E2E_INTERNAL_RESULT ?? '';
    const prodResult = process.env.E2E_PROD_RESULT ?? '';
    const enableE2ECommentValidation = process.env.ENABLE_E2E_COMMENT_VALIDATION === 'true';
    const checkRunId = process.env.CHECK_RUN_ID;

    console.error(`[e2e-gate] Raw environment inputs - internal: ${internalResult}, prod: ${prodResult}, checkRunId: ${checkRunId}`);

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

    if (!checkRunId) {
      throw new Error("CHECK_RUN_ID environment variable is completely empty or undefined.");
    }

    const { owner, repo } = context.repo;
    const targetCheckId = parseInt(checkRunId, 10);
    
    if (isNaN(targetCheckId)) {
      throw new Error(`Parsed Check Run ID is not a valid number. Raw value: version: ${checkRunId}`);
    }

    console.error(`[e2e-gate] Attempting API call to update check: ${targetCheckId} to ${conclusion}`);

    await github.rest.checks.update({
      owner,
      repo,
      check_run_id: targetCheckId,
      status: 'completed',
      conclusion,
      output: {
        title,
        summary,
      },
    });

    console.error(`[e2e-gate] API call complete. Updated check run ${targetCheckId} to ${conclusion}`);

  } catch (error) {
    console.error("[e2e-gate] CRITICAL CRASH ENCOUNTERED:");
    console.error(error.stack || error.message || error);
    core.setFailed(`e2e-gate script failed: ${error.message}`);
  }
};
