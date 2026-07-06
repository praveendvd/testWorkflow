import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer) {
  server.prompt(
    "release-triage",
    "Walk through release readiness using Jira MCP tools",
    async () => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `You are triaging a release. Follow this order:
1. Read jira://config/team for default project and JQL.
2. Search open issues for the target fixVersion.
3. Flag blockers (status != Done, priority Highest).
4. Summarize risk in a table: Key | Summary | Status | Risk.
Do not create issues until I confirm.`,
        },
      }],
    })
  );

  server.prompt(
    "draft-bug-from-build",
    "Draft a Jira bug from a failed CI build",
    {
      build_number: z.string().describe("e.g. 482"),
      failed_stage: z.string().describe("e.g. Deploy-Staging"),
      log_excerpt: z.string().describe("Last 20 lines of failure log"),
    },
    async ({ build_number, failed_stage, log_excerpt }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Draft a Jira Bug issue for build #${build_number}.
Failed stage: ${failed_stage}
Log excerpt:
${log_excerpt}

Use jira_create_issue with project QA, type Bug.
Include repro steps, expected vs actual, and environment.`,
        },
      }],
    })
  );
}
