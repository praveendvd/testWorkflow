import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { jiraFetch } from "./jira-client.js";

export function registerTools(server: McpServer) {
  server.tool(
    "jira_get_issue",
    "Fetch a Jira issue by key",
    { issue_key: z.string().describe("e.g. QA-123") },
    async ({ issue_key }) => {
      const data = (await jiraFetch(`/rest/api/2/issue/${issue_key}`)) as {
        key: string;
        fields: { summary: string; description?: string; status?: { name: string } };
      };
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            key: data.key,
            summary: data.fields.summary,
            description: data.fields.description,
            status: data.fields.status?.name,
          }),
        }],
      };
    }
  );

  server.tool(
    "jira_create_issue",
    "Create a Jira issue",
    {
      project_key: z.string(),
      summary: z.string(),
      description: z.string().optional(),
      issue_type: z.string().default("Task"),
    },
    async (input) => {
      const data = (await jiraFetch("/rest/api/2/issue", {
        method: "POST",
        body: JSON.stringify({
          fields: {
            project: { key: input.project_key },
            summary: input.summary,
            description: input.description ?? "",
            issuetype: { name: input.issue_type },
          },
        }),
      })) as { key: string };
      return {
        content: [{ type: "text", text: JSON.stringify({ created: data.key }) }],
      };
    }
  );
}
