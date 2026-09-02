import fs from "node:fs/promises";
import path from "node:path";
import { ConfigDebtEngine } from "@argus/config-engine";
import {
  CD001_UnpinnedAction,
  CD002_FloatingDependency,
  CD003_HardcodedSecrets,
  CD004_DuplicatedWorkflowLogic,
  CD005_ExcessiveWorkflowComplexity,
  CD101_FloatingBaseImage,
  CD102_UnspecifiedBaseImageVersion,
  CD103_ExcessiveImageLayers,
  CD104_InefficientPackageInstallation,
  CD105_RootExecution,
} from "@argus/rules";
import type { DebtFinding } from "@argus/agent-core";

export function createConfigEngine(): ConfigDebtEngine {
  const engine = new ConfigDebtEngine();
  [
    CD001_UnpinnedAction,
    CD002_FloatingDependency,
    CD003_HardcodedSecrets,
    CD004_DuplicatedWorkflowLogic,
    CD005_ExcessiveWorkflowComplexity,
    CD101_FloatingBaseImage,
    CD102_UnspecifiedBaseImageVersion,
    CD103_ExcessiveImageLayers,
    CD104_InefficientPackageInstallation,
    CD105_RootExecution,
  ].forEach((rule) => engine.registerRule(rule));
  return engine;
}

async function findConfigFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".git" && entry.name !== "dist") {
        results.push(...(await findConfigFiles(fullPath)));
      } else if (entry.isFile()) {
        const name = entry.name.toLowerCase();
        if (name.endsWith(".yml") || name.endsWith(".yaml") || name.includes("dockerfile")) {
          results.push(fullPath);
        }
      }
    }
  } catch {
    // Ignore read errors
  }
  return results;
}

export async function runConfigScan(targetPath: string): Promise<DebtFinding[]> {
  const engine = createConfigEngine();
  const stat = await fs.stat(targetPath);
  const files = stat.isDirectory() ? await findConfigFiles(targetPath) : [targetPath];

  const allFindings: DebtFinding[] = [];

  for (const file of files) {
    try {
      const content = await fs.readFile(file, "utf-8");
      const findings = engine.analyzeFile(file, content);
      allFindings.push(...findings);
    } catch {
      // Continue scanning
    }
  }

  return allFindings;
}
