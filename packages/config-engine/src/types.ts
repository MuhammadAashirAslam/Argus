import type { DebtFinding } from "@argus/agent-core";

export type ConfigFileType = "GITHUB_ACTIONS" | "DOCKERFILE";

export interface ParsedConfigContext {
  filePath: string;
  fileType: ConfigFileType;
  rawContent: string;
  parsedAst?: unknown;
  lines: string[];
}

/**
 * Deterministic Rule Interface (§15, §16).
 * Rules must be deterministic, independently testable, explainable, and versioned.
 */
export interface DebtRule {
  readonly id: string; // e.g. "CD001"
  readonly title: string;
  readonly fileType: ConfigFileType;
  readonly severity: "low" | "medium" | "high";
  readonly version: string; // e.g. "1.0.0"

  evaluate(context: ParsedConfigContext): DebtFinding[];
}
