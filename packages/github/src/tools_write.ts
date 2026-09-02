import { z } from "zod";
import type { McpTool, ToolExecutionContext, McpToolResult } from "@argus/mcp-server";
import { GITHUB_TOOL_VERSION } from "./types.js";

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

export const CreateReviewTool: McpTool<z.infer<typeof CreateReviewInputSchema>, z.infer<typeof CreateReviewOutputSchema>> = {
  name: "github.create_review",
  version: GITHUB_TOOL_VERSION,
  description: "Create a review comment on an open GitHub pull request",
  permission: "WRITE_WORKSPACE",
  inputSchema: CreateReviewInputSchema,
  outputSchema: CreateReviewOutputSchema,

  async execute(input, _context: ToolExecutionContext): Promise<McpToolResult<z.infer<typeof CreateReviewOutputSchema>>> {
    const start = Date.now();
    try {
      const token = process.env["GITHUB_TOKEN"];
      if (!token) {
        return {
          success: false,
          error: { code: "AUTH_REQUIRED", message: "GITHUB_TOKEN environment variable is required to write PR reviews" },
          durationMs: Date.now() - start,
        };
      }

      const res = await fetch(`https://api.github.com/repos/${input.owner}/${input.repo}/pulls/${input.pullNumber}/reviews`, {
        method: "POST",
        headers: {
          Authorization: `token ${token}`,
          "User-Agent": "ARGUS-Agent/1.0",
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body: input.body, event: input.event }),
      });

      if (!res.ok) {
        return {
          success: false,
          error: { code: "CREATE_REVIEW_FAILED", message: `GitHub API error ${res.status}: ${res.statusText}` },
          durationMs: Date.now() - start,
        };
      }

      const json = (await res.json()) as any;
      return {
        success: true,
        data: { id: json.id, htmlUrl: json.html_url, state: json.state },
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: "NETWORK_ERROR", message: err?.message || String(err) },
        durationMs: Date.now() - start,
      };
    }
  },
};
