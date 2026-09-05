import type { DebtRule, ParsedConfigContext } from "@argus/agent-core";
import type { DebtFinding } from "@argus/agent-core";

export const CD004_DuplicatedWorkflowLogic: DebtRule = {
  id: "CD004",
  title: "Duplicated Workflow Logic",
  fileType: "GITHUB_ACTIONS",
  severity: "low",
  version: "1.0.0",

  evaluate(context: ParsedConfigContext): DebtFinding[] {
    const findings: DebtFinding[] = [];
    const runBlocks = new Map<string, number>();

    context.lines.forEach((line, index) => {
      const match = line.match(/^\s*(?:-\s*)?run:\s*(.+)$/);
      if (match) {
        const cmd = (match[1] ?? "").trim();
        if (cmd.length > 20) {
          const firstSeen = runBlocks.get(cmd);
          if (firstSeen !== undefined) {
            findings.push({
              ruleId: "CD004",
              title: "Duplicated Workflow Logic",
              severity: "low",
              file: context.filePath,
              line: index + 1,
              evidence: `Duplicate of step at line ${firstSeen}: ${cmd}`,
              recommendation:
                "Extract repeated workflow command sequences into a reusable composite action or shared script.",
            });
          } else {
            runBlocks.set(cmd, index + 1);
          }
        }
      }
    });

    return findings;
  },
};
