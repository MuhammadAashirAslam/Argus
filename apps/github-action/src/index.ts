import { Orchestrator } from "@argus/orchestrator";

export async function runAction(): Promise<void> {
  const repository = process.env["GITHUB_REPOSITORY"] ?? "unknown/repo";
  const prNumber = process.env["GITHUB_REF"] ? parseInt(process.env["GITHUB_REF"].split("/")[2] ?? "0", 10) : undefined;

  console.log(`[ARGUS-Action] Starting automated analysis for ${repository} (PR #${prNumber ?? "N/A"})`);

  const orchestrator = new Orchestrator();
  const runState = await orchestrator.executeRun({
    repository,
    pullRequest: prNumber && !isNaN(prNumber) ? prNumber : undefined,
    objective: "Automated GitHub Action PR analysis and configuration verification",
  });

  console.log(`[ARGUS-Action] Analysis complete with status: ${runState.status}`);
}

if (process.env["GITHUB_ACTIONS"]) {
  runAction().catch((err) => {
    console.error("[ARGUS-Action] Fatal action error:", err);
    process.exit(1);
  });
}
