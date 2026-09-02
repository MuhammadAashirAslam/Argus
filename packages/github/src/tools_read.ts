import { z } from "zod";
import type { McpTool, ToolExecutionContext, McpToolResult } from "@argus/mcp-server";
import { 
  GITHUB_TOOL_VERSION, 
  GitHubPullRequestSchema, 
  GitHubIssueSchema,
  GitHubCommentSchema,
  GitHubFileSchema
} from "./types.js";

async function githubFetch(path: string): Promise<any> {
  const token = process.env["GITHUB_TOKEN"];
  const headers: Record<string, string> = {
    "User-Agent": "ARGUS-Agent/1.0",
    Accept: "application/vnd.github.v3+json",
  };
  if (token) headers["Authorization"] = `token ${token}`;

  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API responded with status ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

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
      const json = await githubFetch(`/repos/${input.owner}/${input.repo}/pulls/${input.pullNumber}`);
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

      return { success: true, data: prData, durationMs: Date.now() - start };
    } catch (err: any) {
      return { success: false, error: { code: "GITHUB_FETCH_FAILED", message: err?.message || String(err) }, durationMs: Date.now() - start };
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

  async execute(input, _context: ToolExecutionContext): Promise<McpToolResult<Array<z.infer<typeof GitHubIssueSchema>>>> {
    const start = Date.now();
    try {
      const json = await githubFetch(`/repos/${input.owner}/${input.repo}/issues?state=${input.state}`);
      const issues = json.map((issue: any) => ({
        number: issue.number,
        title: issue.title,
        body: issue.body ?? "",
        state: issue.state === "open" ? ("open" as const) : ("closed" as const),
        author: issue.user?.login ?? "unknown",
        labels: issue.labels?.map((l: any) => l.name) ?? [],
      }));

      return { success: true, data: issues, durationMs: Date.now() - start };
    } catch (err: any) {
      return { success: false, error: { code: "GITHUB_FETCH_FAILED", message: err?.message || String(err) }, durationMs: Date.now() - start };
    }
  },
};

// --- github.get_pull_request_files ---
export const GetPullRequestFilesInputSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  pullNumber: z.number().int().positive(),
});

export const GetPullRequestFilesTool: McpTool<z.infer<typeof GetPullRequestFilesInputSchema>, Array<z.infer<typeof GitHubFileSchema>>> = {
  name: "github.get_pull_request_files",
  version: GITHUB_TOOL_VERSION,
  description: "Get the files changed in a pull request",
  permission: "READ_ONLY",
  inputSchema: GetPullRequestFilesInputSchema,
  outputSchema: z.array(GitHubFileSchema),

  async execute(input, _context: ToolExecutionContext): Promise<McpToolResult<Array<z.infer<typeof GitHubFileSchema>>>> {
    const start = Date.now();
    try {
      const json = await githubFetch(`/repos/${input.owner}/${input.repo}/pulls/${input.pullNumber}/files`);
      const files = json.map((f: any) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
      }));

      return { success: true, data: files, durationMs: Date.now() - start };
    } catch (err: any) {
      return { success: false, error: { code: "GITHUB_FETCH_FAILED", message: err?.message || String(err) }, durationMs: Date.now() - start };
    }
  },
};

// --- github.get_comments ---
export const GetCommentsInputSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  issueNumber: z.number().int().positive(),
});

export const GetCommentsTool: McpTool<z.infer<typeof GetCommentsInputSchema>, Array<z.infer<typeof GitHubCommentSchema>>> = {
  name: "github.get_comments",
  version: GITHUB_TOOL_VERSION,
  description: "Get comments on an issue or pull request",
  permission: "READ_ONLY",
  inputSchema: GetCommentsInputSchema,
  outputSchema: z.array(GitHubCommentSchema),

  async execute(input, _context: ToolExecutionContext): Promise<McpToolResult<Array<z.infer<typeof GitHubCommentSchema>>>> {
    const start = Date.now();
    try {
      const json = await githubFetch(`/repos/${input.owner}/${input.repo}/issues/${input.issueNumber}/comments`);
      const comments = json.map((c: any) => ({
        id: c.id,
        user: c.user?.login ?? "unknown",
        body: c.body ?? "",
        createdAt: c.created_at,
      }));

      return { success: true, data: comments, durationMs: Date.now() - start };
    } catch (err: any) {
      return { success: false, error: { code: "GITHUB_FETCH_FAILED", message: err?.message || String(err) }, durationMs: Date.now() - start };
    }
  },
};
