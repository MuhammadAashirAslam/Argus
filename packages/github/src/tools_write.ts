import { z } from "zod";
import type { McpTool, ToolExecutionContext, McpToolResult } from "@argus/mcp-server";
import { GITHUB_TOOL_VERSION } from "./types.js";

async function githubPost(path: string, body: any): Promise<any> {
  const token = process.env["GITHUB_TOKEN"];
  if (!token) throw new Error("GITHUB_TOKEN environment variable is required");

  const headers: Record<string, string> = {
    Authorization: `token ${token}`,
    "User-Agent": "ARGUS-Agent/1.0",
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };

  const res = await fetch(`https://api.github.com${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${res.statusText} - ${text}`);
  }
  return res.json();
}

// --- github.create_review ---
export const CreateReviewInputSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  pullNumber: z.number().int().positive(),
  body: z.string().min(1),
  event: z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]).default("COMMENT"),
});

export const CreateReviewOutputSchema = z.object({
  id: z.number().int().positive(),
  htmlUrl: z.string().url().optional(),
  state: z.string(),
});

export const CreateReviewTool: McpTool<
  z.infer<typeof CreateReviewInputSchema>,
  z.infer<typeof CreateReviewOutputSchema>
> = {
  name: "github.create_review",
  version: GITHUB_TOOL_VERSION,
  description: "Create a review comment on an open GitHub pull request",
  permission: "WRITE_WORKSPACE",
  inputSchema: CreateReviewInputSchema,
  outputSchema: CreateReviewOutputSchema,

  async execute(
    input,
    _context: ToolExecutionContext,
  ): Promise<McpToolResult<z.infer<typeof CreateReviewOutputSchema>>> {
    const start = Date.now();
    try {
      const token = process.env["GITHUB_TOKEN"];
      if (!token) {
        return {
          success: false,
          error: {
            code: "AUTH_REQUIRED",
            message: "GITHUB_TOKEN environment variable is required to write PR reviews",
          },
          durationMs: Date.now() - start,
        };
      }
      const json = await githubPost(
        `/repos/${input.owner}/${input.repo}/pulls/${input.pullNumber}/reviews`,
        {
          body: input.body,
          event: input.event,
        },
      );
      return {
        success: true,
        data: { id: json.id, htmlUrl: json.html_url, state: json.state },
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: "CREATE_REVIEW_FAILED", message: err?.message || String(err) },
        durationMs: Date.now() - start,
      };
    }
  },
};

// --- github.create_branch ---
export const CreateBranchInputSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  branchName: z.string().min(1),
  sha: z.string().min(1), // Base SHA
});

export const CreateBranchOutputSchema = z.object({
  ref: z.string(),
  url: z.string(),
});

export const CreateBranchTool: McpTool<
  z.infer<typeof CreateBranchInputSchema>,
  z.infer<typeof CreateBranchOutputSchema>
> = {
  name: "github.create_branch",
  version: GITHUB_TOOL_VERSION,
  description: "Create a new git branch/reference",
  permission: "WRITE_WORKSPACE",
  inputSchema: CreateBranchInputSchema,
  outputSchema: CreateBranchOutputSchema,

  async execute(
    input,
    _context: ToolExecutionContext,
  ): Promise<McpToolResult<z.infer<typeof CreateBranchOutputSchema>>> {
    const start = Date.now();
    try {
      const json = await githubPost(`/repos/${input.owner}/${input.repo}/git/refs`, {
        ref: `refs/heads/${input.branchName}`,
        sha: input.sha,
      });
      return {
        success: true,
        data: { ref: json.ref, url: json.url },
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: "CREATE_BRANCH_FAILED", message: err?.message || String(err) },
        durationMs: Date.now() - start,
      };
    }
  },
};

// --- github.create_pull_request ---
export const CreatePullRequestInputSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  title: z.string().min(1),
  head: z.string().min(1),
  base: z.string().min(1),
  body: z.string().default(""),
});

export const CreatePullRequestOutputSchema = z.object({
  number: z.number().int().positive(),
  htmlUrl: z.string().url(),
});

export const CreatePullRequestTool: McpTool<
  z.infer<typeof CreatePullRequestInputSchema>,
  z.infer<typeof CreatePullRequestOutputSchema>
> = {
  name: "github.create_pull_request",
  version: GITHUB_TOOL_VERSION,
  description: "Create a new pull request",
  permission: "WRITE_WORKSPACE",
  inputSchema: CreatePullRequestInputSchema,
  outputSchema: CreatePullRequestOutputSchema,

  async execute(
    input,
    _context: ToolExecutionContext,
  ): Promise<McpToolResult<z.infer<typeof CreatePullRequestOutputSchema>>> {
    const start = Date.now();
    try {
      const json = await githubPost(`/repos/${input.owner}/${input.repo}/pulls`, {
        title: input.title,
        head: input.head,
        base: input.base,
        body: input.body,
      });
      return {
        success: true,
        data: { number: json.number, htmlUrl: json.html_url },
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: "CREATE_PR_FAILED", message: err?.message || String(err) },
        durationMs: Date.now() - start,
      };
    }
  },
};
