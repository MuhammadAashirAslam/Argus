import YAML from "yaml";
import type { DebtFinding } from "@argus/agent-core";
import type { DebtRule, ParsedConfigContext, ConfigFileType } from "./types.js";

export class ConfigDebtEngine {
  private readonly rules = new Map<string, DebtRule>();

  public registerRule(rule: DebtRule): void {
    if (this.rules.has(rule.id)) {
      throw new Error(`Rule with ID '${rule.id}' is already registered.`);
    }
    this.rules.set(rule.id, rule);
  }

  public getRules(): DebtRule[] {
    return Array.from(this.rules.values());
  }

  public detectFileType(filePath: string): ConfigFileType | null {
    const normalized = filePath.replace(/\\/g, "/").toLowerCase();
    if (normalized.includes(".github/workflows/") && (normalized.endsWith(".yml") || normalized.endsWith(".yaml"))) {
      return "GITHUB_ACTIONS";
    }
    if (normalized.endsWith("dockerfile") || normalized.includes("dockerfile.")) {
      return "DOCKERFILE";
    }
    return null;
  }

  /**
   * Evaluates content deterministically against registered rules (§16).
   */
  public analyzeFile(filePath: string, content: string): DebtFinding[] {
    const fileType = this.detectFileType(filePath);
    if (!fileType) {
      return [];
    }

    const lines = content.split("\n");
    let parsedAst: unknown = undefined;

    if (fileType === "GITHUB_ACTIONS") {
      try {
        parsedAst = YAML.parse(content);
      } catch {
        parsedAst = undefined;
      }
    }

    const context: ParsedConfigContext = {
      filePath,
      fileType,
      rawContent: content,
      parsedAst,
      lines,
    };

    const findings: DebtFinding[] = [];

    for (const rule of this.rules.values()) {
      if (rule.fileType === fileType) {
        const ruleFindings = rule.evaluate(context);
        findings.push(...ruleFindings);
      }
    }

    return findings;
  }
}
