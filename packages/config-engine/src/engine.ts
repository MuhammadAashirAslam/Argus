import fs from "node:fs/promises";
import path from "node:path";
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
    if (
      normalized.includes(".github/workflows/") &&
      (normalized.endsWith(".yml") || normalized.endsWith(".yaml"))
    ) {
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

  /**
   * Scans a target path (file or directory) recursively for configuration files and evaluates all rules.
   */
  public async scanDirectory(targetPath: string): Promise<DebtFinding[]> {
    const stat = await fs.stat(targetPath);
    const files: string[] = [];

    if (stat.isDirectory()) {
      const walk = async (dir: string): Promise<void> => {
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (
              entry.isDirectory() &&
              entry.name !== "node_modules" &&
              entry.name !== ".git" &&
              entry.name !== "dist"
            ) {
              await walk(fullPath);
            } else if (entry.isFile()) {
              if (this.detectFileType(fullPath)) {
                files.push(fullPath);
              }
            }
          }
        } catch {
          // ignore directory access errors
        }
      };
      await walk(targetPath);
    } else if (stat.isFile()) {
      files.push(targetPath);
    }

    const allFindings: DebtFinding[] = [];
    for (const file of files) {
      try {
        const content = await fs.readFile(file, "utf-8");
        allFindings.push(...this.analyzeFile(file, content));
      } catch {
        // ignore file read error
      }
    }

    return allFindings;
  }
}
