import { Orchestrator } from "@argus/orchestrator";
import { InvestigatorAgent } from "@argus/agent-investigator";
import { AnalyzerAgent } from "@argus/agent-analyzer";
import { ConfigurationAgent } from "@argus/agent-configuration";
import { HistorianAgent } from "@argus/agent-historian";
import { PatchAgent } from "@argus/agent-patch";
import { VerifierAgent } from "@argus/agent-verifier";
import { CreateReviewTool } from "@argus/github";
import type { ToolExecutionContext } from "@argus/mcp-server";

export async function runAction(): Promise<void> {
  const repoSlug = process.env["GITHUB_REPOSITORY"] ?? "unknown/repo";
  const workspacePath = process.env["GITHUB_WORKSPACE"] ?? process.cwd();
  const prNumber = process.env["GITHUB_REF"]
    ? parseInt(process.env["GITHUB_REF"].split("/")[2] ?? "0", 10)
    : undefined;

  console.log(
    `[ARGUS-Action] Starting automated analysis for ${repoSlug} in ${workspacePath} (PR #${prNumber ?? "N/A"})`,
  );

  const orchestrator = new Orchestrator();
  orchestrator.registerAgent(new InvestigatorAgent());
  orchestrator.registerAgent(new AnalyzerAgent());
  orchestrator.registerAgent(new ConfigurationAgent());
  orchestrator.registerAgent(new HistorianAgent());
  orchestrator.registerAgent(new PatchAgent());
  orchestrator.registerAgent(new VerifierAgent());

  const runState = await orchestrator.executeRun({
    repository: workspacePath,
    pullRequest: prNumber && !isNaN(prNumber) ? prNumber : undefined,
    objective: "Automated GitHub Action PR analysis and configuration verification",
  });

  console.log(`[ARGUS-Action] Analysis complete with status: ${runState.status}`);

  // Post GitHub review if running in PR context and GITHUB_TOKEN is present (§5, §13)
  if (prNumber && !isNaN(prNumber) && process.env["GITHUB_TOKEN"] && repoSlug.includes("/")) {
    const [owner, repo] = repoSlug.split("/");
    if (owner && repo) {
      try {
        console.log(`[ARGUS-Action] Submitting automated review to PR #${prNumber}...`);
        const reviewLines: string[] = [
          `## ARGUS Autonomous Analysis Report`,
          `**Status**: ${runState.status.toUpperCase()}`,
          `**Run ID**: \`${runState.runId}\``,
          `**Findings**: ${runState.findings.length}`,
          `**Hypotheses**: ${runState.hypotheses.length}`,
          `**Patches Tried**: ${runState.proposedChanges.length}`,
        ];

        if (runState.findings.length > 0) {
          reviewLines.push(`\n### Findings:`);
          for (const f of runState.findings) {
            reviewLines.push(`- **[${f.epistemic}]** ${f.title} (${f.severity}): ${f.description}`);
          }
        }

        if (runState.proposedChanges.length > 0) {
          reviewLines.push(`\n### Proposed Changes:`);
          for (const p of runState.proposedChanges) {
            reviewLines.push(`- \`${p.filePath}\`: ${p.explanation}`);
          }
        }

        const ctx: ToolExecutionContext = {
          runId: runState.runId,
          agentId: "action_orchestrator",
          workspacePath,
        };

        await CreateReviewTool.execute(
          {
            owner,
            repo,
            pullNumber: prNumber,
            body: reviewLines.join("\n"),
            event: runState.status === "failed" ? "REQUEST_CHANGES" : "COMMENT",
          },
          ctx,
        );
        console.log(`[ARGUS-Action] Review posted successfully.`);
      } catch (err: any) {
        console.warn(`[ARGUS-Action] Could not post review: ${err?.message || String(err)}`);
      }
    }
  }
}

if (process.env["GITHUB_ACTIONS"]) {
  runAction().catch((err) => {
    console.error("[ARGUS-Action] Fatal action error:", err);
    process.exit(1);
  });
}
