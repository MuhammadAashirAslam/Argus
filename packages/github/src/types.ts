import { z } from "zod";

export const GITHUB_TOOL_VERSION = "1.0.0";

export interface GitHubClientConfig {
  token?: string;
  baseUrl?: string;
}

export const GitHubPullRequestSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string().default(""),
  state: z.enum(["open", "closed"]),
  headBranch: z.string(),
  baseBranch: z.string(),
  author: z.string(),
  htmlUrl: z.string().url().optional(),
});

export const GitHubIssueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string().default(""),
  state: z.enum(["open", "closed"]),
  author: z.string(),
  labels: z.array(z.string()).default([]),
});

export type GitHubPullRequest = z.infer<typeof GitHubPullRequestSchema>;
export type GitHubIssue = z.infer<typeof GitHubIssueSchema>;
