import type { DebtRule, ParsedConfigContext } from "@argus/agent-core";
import type { DebtFinding } from "@argus/agent-core";

const SECRET_PATTERNS = [
  /(?:api[_-]?key|secret|token|password|auth[_-]?token)\s*[:=]\s*["']?([a-zA-Z0-9_\-.~+]{16,})["']?/i,
  /ghp_[a-zA-Z0-9]{36}/,
  /gho_[a-zA-Z0-9]{36}/,
  /xox[baprs]-[a-zA-Z0-9]{10,}/,
];

export const CD003_HardcodedSecrets: DebtRule = {
  id: "CD003",
  title: "Hardcoded Sensitive Configuration",
  fileType: "GITHUB_ACTIONS",
  severity: "high",
  version: "1.0.0",

  evaluate(context: ParsedConfigContext): DebtFinding[] {
    const findings: DebtFinding[] = [];

    context.lines.forEach((line, index) => {
      // Ignore GitHub Secrets references e.g. ${{ secrets.TOKEN }}
      if (line.includes("${{") && line.includes("secrets.")) {
        return;
      }

      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(line)) {
          findings.push({
            ruleId: "CD003",
            title: "Hardcoded Sensitive Configuration",
            severity: "high",
            file: context.filePath,
            line: index + 1,
            evidence: line.replace(/[a-zA-Z0-9]{8,}/g, "[REDACTED]"),
            recommendation:
              "Move sensitive tokens and keys into GitHub Actions repository secrets (${{ secrets.SECRET_NAME }}).",
          });
          break;
        }
      }
    });

    return findings;
  },
};
