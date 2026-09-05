import type { DebtRule, ParsedConfigContext } from "@argus/agent-core";
import type { DebtFinding } from "@argus/agent-core";

const UNPINNED_INSTALL_PATTERNS = [
  /npm\s+(?:install|i)\s+(?!.*(?:--save-exact|package\.json|package-lock\.json|npm-shrinkwrap))([a-zA-Z0-9@/_-]+)/i,
  /pip\s+install\s+(?!.*(?:-r\s+|requirements\.txt|setup\.py))([a-zA-Z0-9_-]+)(?!\s*==)/i,
  /gem\s+install\s+([a-zA-Z0-9_-]+)(?!\s*-v)/i,
];

export const CD002_FloatingDependency: DebtRule = {
  id: "CD002",
  title: "Floating Dependency",
  fileType: "GITHUB_ACTIONS",
  severity: "medium",
  version: "1.0.0",

  evaluate(context: ParsedConfigContext): DebtFinding[] {
    const findings: DebtFinding[] = [];

    context.lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (
        !trimmed.startsWith("run:") &&
        !trimmed.includes("npm ") &&
        !trimmed.includes("pip ") &&
        !trimmed.includes("gem ")
      ) {
        return;
      }

      for (const pattern of UNPINNED_INSTALL_PATTERNS) {
        const match = trimmed.match(pattern);
        if (match) {
          const pkg = match[1] ?? "package";
          // Ignore flags starting with -
          if (!pkg.startsWith("-")) {
            findings.push({
              ruleId: "CD002",
              title: "Floating Dependency",
              severity: "medium",
              file: context.filePath,
              line: index + 1,
              evidence: trimmed,
              recommendation: `Pin dependency '${pkg}' to an exact version or use a lockfile (npm ci, pip install -r requirements.txt) to ensure reproducible CI runs.`,
            });
            break;
          }
        }
      }
    });

    return findings;
  },
};
