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

export const GitHubCommentSchema = z.object({
  id: z.number(),
  user: z.string(),
  body: z.string(),
  createdAt: z.string(),
});

export const GitHubFileSchema = z.object({
  filename: z.string(),
  status: z.string(),
  additions: z.number(),
  deletions: z.number(),
  patch: z.string().optional(),
});

export type GitHubPullRequest = z.infer<typeof GitHubPullRequestSchema>;
export type GitHubIssue = z.infer<typeof GitHubIssueSchema>;
export type GitHubComment = z.infer<typeof GitHubCommentSchema>;
export type GitHubFile = z.infer<typeof GitHubFileSchema>;
