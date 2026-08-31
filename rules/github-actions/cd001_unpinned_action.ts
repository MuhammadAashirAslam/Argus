import type { DebtRule, ParsedConfigContext } from "@argus/config-engine";
import type { DebtFinding } from "@argus/agent-core";

export const CD001_UnpinnedAction: DebtRule = {
  id: "CD001",
  title: "Unpinned Action",
  fileType: "GITHUB_ACTIONS",
  severity: "high",
  version: "1.0.0",

  evaluate(context: ParsedConfigContext): DebtFinding[] {
    const findings: DebtFinding[] = [];
    const shaRegex = /^[0-9a-f]{40}$/i;

    context.lines.forEach((line, index) => {
      const match = line.match(/uses:\s*([a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+)@([^\s#]+)/);
      if (match) {
        const actionName = match[1] ?? "";
        const versionRef = match[2] ?? "";

        // If not a 40-char commit SHA and not a local path (./)
        if (!actionName.startsWith("./") && !shaRegex.test(versionRef)) {
          findings.push({
            ruleId: "CD001",
            title: "Unpinned Action",
            severity: "high",
            file: context.filePath,
            line: index + 1,
            evidence: line.trim(),
            recommendation: `Pin action '${actionName}' to an immutable 40-character commit SHA instead of '${versionRef}' to prevent supply chain tampering.`,
          });
        }
      }
    });

    return findings;
  },
};
