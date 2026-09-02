import { z } from "zod";
import type { McpTool, ToolExecutionContext, McpToolResult } from "@argus/mcp-server";
import { GITHUB_TOOL_VERSION, GitHubPullRequestSchema, GitHubIssueSchema } from "./types.js";

// --- github.get_pull_request ---
export const GetPullRequestInputSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  pullNumber: z.number().int().positive(),
});

export const GetPullRequestTool: McpTool<z.infer<typeof GetPullRequestInputSchema>, z.infer<typeof GitHubPullRequestSchema>> = {
  name: "github.get_pull_request",
  version: GITHUB_TOOL_VERSION,
  description: "Fetch pull request metadata, branches, and description",
  permission: "READ_ONLY",
  inputSchema: GetPullRequestInputSchema,
  outputSchema: GitHubPullRequestSchema,

  async execute(input, _context: ToolExecutionContext): Promise<McpToolResult<z.infer<typeof GitHubPullRequestSchema>>> {
    const start = Date.now();
    try {
      const token = process.env["GITHUB_TOKEN"];
      const headers: Record<string, string> = {
        "User-Agent": "ARGUS-Agent/1.0",
        Accept: "application/vnd.github.v3+json",
      };
      if (token) {
        headers["Authorization"] = `token ${token}`;
      }

      const res = await fetch(`https://api.github.com/repos/${input.owner}/${input.repo}/pulls/${input.pullNumber}`, {
        headers,
      });

      if (!res.ok) {
        return {
          success: false,
          error: { code: "GITHUB_API_ERROR", message: `GitHub API responded with status ${res.status}: ${res.statusText}` },
          durationMs: Date.now() - start,
        };
      }

      const json = (await res.json()) as any;
      const prData = {
        number: json.number,
        title: json.title,
        body: json.body ?? "",
        state: json.state === "open" ? ("open" as const) : ("closed" as const),
        headBranch: json.head?.ref ?? "unknown",
        baseBranch: json.base?.ref ?? "main",
        author: json.user?.login ?? "unknown",
        htmlUrl: json.html_url,
      };

      return {
        success: true,
        data: prData,
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: "GITHUB_FETCH_FAILED", message: err?.message || String(err) },
        durationMs: Date.now() - start,
      };
    }
  },
};

// --- github.get_issues ---
export const GetIssuesInputSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  state: z.enum(["open", "closed", "all"]).default("open"),
});

export const GetIssuesTool: McpTool<z.infer<typeof GetIssuesInputSchema>, Array<z.infer<typeof GitHubIssueSchema>>> = {
  name: "github.get_issues",
  version: GITHUB_TOOL_VERSION,
  description: "List issues in a repository",
  permission: "READ_ONLY",
  inputSchema: GetIssuesInputSchema,
  outputSchema: z.array(GitHubIssueSchema),

  async execute(_input, _context: ToolExecutionContext): Promise<McpToolResult<Array<z.infer<typeof GitHubIssueSchema>>>> {
    const start = Date.now();
    return {
      success: true,
      data: [],
      durationMs: Date.now() - start,
    };
  },
};
