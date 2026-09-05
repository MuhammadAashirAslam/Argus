import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Orchestrator } from "@argus/orchestrator";
import type { RunState } from "@argus/agent-core";
import { InvestigatorAgent } from "@argus/agent-investigator";
import { AnalyzerAgent } from "@argus/agent-analyzer";
import { PatchAgent } from "@argus/agent-patch";
import { VerifierAgent } from "@argus/agent-verifier";
import { ConfigurationAgent } from "@argus/agent-configuration";
import { HistorianAgent } from "@argus/agent-historian";

const execFileAsync = promisify(execFile);

export async function runAnalyze(
  repo: string,
  prNumber?: number,
  objective?: string,
): Promise<RunState> {
  let targetDir = path.resolve(repo);

  // If repo is not a local directory, handle remote Git/GitHub repo (§4.2 #66)
  if (!fs.existsSync(repo)) {
    const isRemote =
      repo.includes("/") ||
      repo.startsWith("git@") ||
      repo.startsWith("http://") ||
      repo.startsWith("https://");
    if (isRemote) {
      const sanitizedName = repo.replace(/[^a-zA-Z0-9_-]/g, "_");
      const cloneDir = path.join(os.tmpdir(), "argus-repos", `${sanitizedName}_${Date.now()}`);
      await fs.promises.mkdir(path.dirname(cloneDir), { recursive: true });

      const token = process.env["GITHUB_TOKEN"];
      let cloneUrl = repo;
      if (!repo.startsWith("http://") && !repo.startsWith("https://") && !repo.startsWith("git@")) {
        cloneUrl = token
          ? `https://x-access-token:${token}@github.com/${repo}.git`
          : `https://github.com/${repo}.git`;
      }

      console.log(`[ARGUS] Cloning remote repository '${repo}' into '${cloneDir}'...`);
      await execFileAsync("git", ["clone", "--depth", "50", cloneUrl, cloneDir]);

      if (prNumber) {
        console.log(`[ARGUS] Fetching and checking out PR #${prNumber}...`);
        await execFileAsync("git", ["fetch", "origin", `pull/${prNumber}/head:pr-${prNumber}`], {
          cwd: cloneDir,
        });
        await execFileAsync("git", ["checkout", `pr-${prNumber}`], { cwd: cloneDir });
      }

      targetDir = cloneDir;
    }
  }

  const orchestrator = new Orchestrator();

  orchestrator.registerAgent(new InvestigatorAgent());
  orchestrator.registerAgent(new AnalyzerAgent());
  orchestrator.registerAgent(new ConfigurationAgent());
  orchestrator.registerAgent(new HistorianAgent());
  orchestrator.registerAgent(new PatchAgent());
  orchestrator.registerAgent(new VerifierAgent());

  const runState = await orchestrator.executeRun({
    repository: targetDir,
    pullRequest: prNumber,
    objective: objective ?? `Automated analysis for ${repo}${prNumber ? ` PR #${prNumber}` : ""}`,
  });

  return runState;
}
