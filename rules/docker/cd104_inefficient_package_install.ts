import type { DebtRule, ParsedConfigContext } from "@argus/agent-core";
import type { DebtFinding } from "@argus/agent-core";

export const CD104_InefficientPackageInstallation: DebtRule = {
  id: "CD104",
  title: "Inefficient Package Installation",
  fileType: "DOCKERFILE",
  severity: "medium",
  version: "1.0.0",

  evaluate(context: ParsedConfigContext): DebtFinding[] {
    const findings: DebtFinding[] = [];

    context.lines.forEach((line, index) => {
      const trimmed = line.trim();

      // apt-get without cache cleanup
      if (/apt-get\s+install/i.test(trimmed) && !trimmed.includes("/var/lib/apt/lists")) {
        findings.push({
          ruleId: "CD104",
          title: "Inefficient Package Installation",
          severity: "medium",
          file: context.filePath,
          line: index + 1,
          evidence: trimmed,
          recommendation:
            "Clean up apt cache in the same RUN layer: 'apt-get install -y <packages> && rm -rf /var/lib/apt/lists/*'.",
        });
      }

      // apk add without --no-cache
      if (
        /apk\s+add/i.test(trimmed) &&
        !trimmed.includes("--no-cache") &&
        !trimmed.includes("/var/cache/apk")
      ) {
        findings.push({
          ruleId: "CD104",
          title: "Inefficient Package Installation",
          severity: "medium",
          file: context.filePath,
          line: index + 1,
          evidence: trimmed,
          recommendation:
            "Use '--no-cache' with apk add to prevent storing index cache in the container layer.",
        });
      }
    });

    return findings;
  },
};
