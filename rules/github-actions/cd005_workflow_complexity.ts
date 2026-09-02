import type { DebtRule, ParsedConfigContext } from "@argus/config-engine";
import type { DebtFinding } from "@argus/agent-core";

const MAX_RECOMMENDED_STEPS = 25;

export const CD005_ExcessiveWorkflowComplexity: DebtRule = {
  id: "CD005",
  title: "Excessive Workflow Complexity",
  fileType: "GITHUB_ACTIONS",
  severity: "low",
  version: "1.0.0",

  evaluate(context: ParsedConfigContext): DebtFinding[] {
    const findings: DebtFinding[] = [];
    const ast = context.parsedAst as any;

    if (ast && typeof ast === "object" && ast.jobs) {
      let totalSteps = 0;
      const jobCount = Object.keys(ast.jobs).length;

      for (const [jobName, jobDef] of Object.entries<any>(ast.jobs)) {
        if (Array.isArray(jobDef?.steps)) {
          totalSteps += jobDef.steps.length;
          if (jobDef.steps.length > MAX_RECOMMENDED_STEPS) {
            findings.push({
              ruleId: "CD005",
              title: "Excessive Workflow Complexity",
              severity: "low",
              file: context.filePath,
              evidence: `Job '${jobName}' contains ${jobDef.steps.length} steps (threshold: ${MAX_RECOMMENDED_STEPS})`,
              recommendation: `Split job '${jobName}' into smaller, modular workflows or separate jobs to improve maintainability and parallelism.`,
            });
          }
        }
      }

      if (jobCount > 10) {
        findings.push({
          ruleId: "CD005",
          title: "Excessive Workflow Complexity",
          severity: "low",
          file: context.filePath,
          evidence: `Workflow contains ${jobCount} separate jobs in a single file`,
          recommendation: "Decompose monolithic workflow files containing more than 10 jobs into distinct workflow files.",
        });
      }
    }

    return findings;
  },
};
