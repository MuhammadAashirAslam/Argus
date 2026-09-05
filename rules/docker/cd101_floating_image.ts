import type { DebtRule, ParsedConfigContext } from "@argus/agent-core";
import type { DebtFinding } from "@argus/agent-core";

export const CD101_FloatingBaseImage: DebtRule = {
  id: "CD101",
  title: "Floating Base Image",
  fileType: "DOCKERFILE",
  severity: "high",
  version: "1.0.0",

  evaluate(context: ParsedConfigContext): DebtFinding[] {
    const findings: DebtFinding[] = [];

    context.lines.forEach((line, index) => {
      const match = line.match(
        /^FROM\s+(?:--platform=\S+\s+)?([^\s:]+)(?::([^\s@]+))?(?:@sha256:([a-f0-9]+))?/i,
      );
      if (match) {
        const image = match[1] ?? "";
        const tag = match[2];
        const sha = match[3];

        if (image.toLowerCase() === "scratch") {
          return;
        }

        if (!tag || tag.toLowerCase() === "latest" || (!sha && tag === "alpine")) {
          findings.push({
            ruleId: "CD101",
            title: "Floating Base Image",
            severity: "high",
            file: context.filePath,
            line: index + 1,
            evidence: line.trim(),
            recommendation: `Pin base image '${image}' to an exact immutable digest (@sha256:...) or specific semver tag rather than latest/floating tag.`,
          });
        }
      }
    });

    return findings;
  },
};
