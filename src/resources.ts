import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jiraFetch } from "./jira-client.js";

export function registerResources(server: McpServer) {
  server.resource(
    "jira-issue",
    new ResourceTemplate("jira://issue/{issue_key}", { list: undefined }),
    { description: "Read a Jira issue by key" },
    async (uri, { issue_key }) => {
      const data = (await jiraFetch(`/rest/api/2/issue/${issue_key}`)) as {
        key: string;
        fields: {
          summary: string;
          status?: { name: string };
          assignee?: { displayName: string };
        };
      };
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({
            key: data.key,
            summary: data.fields.summary,
            status: data.fields.status?.name,
            assignee: data.fields.assignee?.displayName,
          }),
        }],
      };
    }
  );

  server.resource(
    "jira-team-config",
    "jira://config/team",
    { description: "Team defaults and sample JQL for triage workflows" },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify({
          default_project: "QA",
          default_issue_type: "Task",
          jql_recent: "project=QA AND updated >= -7d ORDER BY updated DESC",
        }),
      }],
    })
  );
}
