# Jira MCP Example (stdio)

## What this is

This is a Part 4 tutorial MCP server that demonstrates all three MCP pillars against Jira REST API v2: tools, resources, and prompts.

## Prerequisites

- Node.js 20+
- Jira API token

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy env template and set real Jira credentials:
   ```bash
   cp .env.example .env
   ```
3. Build:
   ```bash
   npm run build
   ```

## Cursor

1. Open this repository as the workspace root in Cursor.
2. Edit `.cursor/mcp.json` env values (or use Cursor secrets).
3. In Cursor, go to **Settings → MCP → Reload**.

## Inventory

Server: `jira-mcp`

- Tools:
  - `jira_get_issue`
  - `jira_create_issue`
- Resources:
  - `jira://issue/{issue_key}` (`jira-issue`)
  - `jira://config/team` (`jira-team-config`)
- Prompts:
  - `release-triage`
  - `draft-bug-from-build`

## Try it

- Resource read:
  - `Read resource jira://config/team`
- Tool use:
  - `Get issue YOUR-KEY`
- Prompt:
  - Run MCP prompt `release-triage`

## stdio rule

This server uses stdio transport. Do not write logs to stdout (`console.log`) because stdout is reserved for MCP wire messages. Use stderr (`console.error`) for debugging.

## Hardening checklist

Documentation-only future improvements (not implemented here):

- Add structured error envelopes
- Add rate limiting/backoff handling
- Graduate to a lower-level tool registry only when advanced routing is needed
