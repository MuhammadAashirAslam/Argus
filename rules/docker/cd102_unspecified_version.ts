import type { DebtRule, ParsedConfigContext } from "@argus/config-engine";
import type { DebtFinding } from "@argus/agent-core";

export const CD102_UnspecifiedBaseImageVersion: DebtRule = {
  id: "CD102",
  title: "Unspecified Base Image Version",
  fileType: "DOCKERFILE",
  severity: "high",
  version: "1.0.0",

  evaluate(context: ParsedConfigContext): DebtFinding[] {
    const findings: DebtFinding[] = [];

    context.lines.forEach((line, index) => {
      const match = line.match(/^FROM\s+(?:--platform=\S+\s+)?([^\s:]+)\s*$/i);
      if (match) {
        const image = match[1] ?? "";
        if (image.toLowerCase() !== "scratch") {
          findings.push({
            ruleId: "CD102",
            title: "Unspecified Base Image Version",
            severity: "high",
            file: context.filePath,
            line: index + 1,
            evidence: line.trim(),
            recommendation: `Specify an explicit version tag or hash for base image '${image}' (e.g. ${image}:20-alpine) instead of omitting the tag.`,
          });
        }
      }
    });

    return findings;
  },
};
