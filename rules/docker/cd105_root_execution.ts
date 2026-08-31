import type { DebtRule, ParsedConfigContext } from "@argus/config-engine";
import type { DebtFinding } from "@argus/agent-core";

export const CD105_RootExecution: DebtRule = {
  id: "CD105",
  title: "Unnecessary Root Execution",
  fileType: "DOCKERFILE",
  severity: "medium",
  version: "1.0.0",

  evaluate(context: ParsedConfigContext): DebtFinding[] {
    const findings: DebtFinding[] = [];
    let hasUserInstruction = false;

    for (const line of context.lines) {
      if (/^USER\s+(?!root\b)\S+/i.test(line.trim())) {
        hasUserInstruction = true;
        break;
      }
    }

    if (!hasUserInstruction && context.lines.some((l) => /^CMD\s+|^ENTRYPOINT\s+/i.test(l.trim()))) {
      findings.push({
        ruleId: "CD105",
        title: "Unnecessary Root Execution",
        severity: "medium",
        file: context.filePath,
        evidence: "Missing non-root USER instruction before ENTRYPOINT/CMD",
        recommendation: "Create and switch to a non-privileged user (USER appuser or node) to avoid running containers with root privileges.",
      });
    }

    return findings;
  },
};
