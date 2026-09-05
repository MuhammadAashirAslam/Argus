#!/usr/bin/env node
import { runConfigScan } from "./commands/config_scan.js";
import { runVerifyPatch } from "./commands/verify.js";
import { runAnalyze } from "./commands/analyze.js";
import { formatTrajectoryTimeline, runTrace } from "./commands/trace.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    console.log(`
============================================================
ARGUS CLI - MCP-Native Agentic Software Engineering Platform
============================================================

Usage:
  argus config scan [path]                Scan GitHub Actions and Dockerfiles for configuration debt
  argus verify <patch.diff> [--sandbox]   Run deterministic multi-stage verification on a diff
  argus analyze --repo <owner/repo>       Run multi-agent investigation, diagnosis, and patch cycle
    [--pr <number>]                       Analyze a specific Pull Request
    [--objective <text>]                  Provide custom task or bug objective
  argus trace <runId> [path]              Format execution timeline for a persisted run

Options:
  --help, -h                              Show this help menu
  --sandbox                               Use isolated Docker container for verification
`);
    return;
  }

  // 1. Config Debt Scanning
  if (command === "config" && args[1] === "scan") {
    const targetPath = args[2] ?? ".";
    console.log(`[ARGUS] Scanning configuration files in '${targetPath}' for technical debt...`);
    const findings = await runConfigScan(targetPath);
    console.log(`\nScan complete. Found ${findings.length} configuration debt items:`);
    if (findings.length === 0) {
      console.log("  ✓ No configuration debt detected. All rules passed!");
    } else {
      for (const f of findings) {
        console.log(
          `  - [${f.ruleId}] (${f.severity.toUpperCase()}) ${f.title} in ${f.file}:${f.line ?? "N/A"}`,
        );
        console.log(`    Recommendation: ${f.recommendation}`);
      }
    }
    return;
  }

  // 2. Patch Verification
  if (command === "verify") {
    const patchPath = args[1];
    if (!patchPath || patchPath.startsWith("--")) {
      console.error(
        "Error: Please provide a patch diff file to verify (e.g. 'argus verify fix.diff').",
      );
      process.exit(1);
    }

    const useSandbox = args.includes("--sandbox");
    console.log(
      `[ARGUS] Verifying patch '${patchPath}' (${useSandbox ? "Docker Sandbox" : "Host Environment"})...`,
    );

    const result = await runVerifyPatch(patchPath, { useSandbox });
    console.log(`\n========================================`);
    console.log(`Verification Result: ${result.overall.toUpperCase()}`);
    console.log(`========================================`);
    for (const stage of result.stages) {
      const statusIcon = stage.passed ? "✓ PASSED" : "✗ FAILED";
      console.log(`  - Stage [${stage.stage}]: ${statusIcon} (${stage.durationMs}ms)`);
      if (!stage.passed && stage.errorDetails && stage.errorDetails.length > 0) {
        for (const err of stage.errorDetails) {
          console.log(`      Error: ${err}`);
        }
      }
    }
    if (result.overall === "failed") {
      process.exit(1);
    }
    return;
  }

  // 3. Multi-Agent Analysis
  if (command === "analyze") {
    const repoIndex = args.indexOf("--repo");
    const repo = repoIndex !== -1 ? args[repoIndex + 1] : process.cwd();

    const prIndex = args.indexOf("--pr");
    const prNumber =
      prIndex !== -1 && args[prIndex + 1] ? parseInt(args[prIndex + 1]!, 10) : undefined;

    const objIndex = args.indexOf("--objective");
    const objective = objIndex !== -1 && args[objIndex + 1] ? args[objIndex + 1] : undefined;

    console.log(`[ARGUS] Launching multi-agent orchestrator on '${repo}'...`);
    if (prNumber) console.log(`  Target Pull Request: #${prNumber}`);
    if (objective) console.log(`  Target Objective: "${objective}"`);

    const state = await runAnalyze(repo ?? process.cwd(), prNumber, objective);

    console.log(`\n========================================`);
    console.log(`Orchestrator Run Complete`);
    console.log(`========================================`);
    console.log(`Status:        ${state.status.toUpperCase()}`);
    console.log(`Run ID:        ${state.runId}`);
    console.log(`Steps Taken:   ${state.trajectory.length}`);
    console.log(
      `Files Analyzed:${state.relevantFiles.length > 0 ? " " + state.relevantFiles.join(", ") : " None"}`,
    );
    console.log(`Findings:      ${state.findings.length}`);
    console.log(`Hypotheses:    ${state.hypotheses.length}`);
    console.log(`Patches Tried: ${state.proposedChanges.length}`);

    if (state.findings.length > 0) {
      console.log(`\nCollected Findings:`);
      for (const f of state.findings) {
        console.log(`  - [${f.epistemic}] ${f.title}: ${f.description}`);
      }
    }

    if (state.hypotheses.length > 0) {
      console.log(`\nFormulated Hypotheses:`);
      for (const h of state.hypotheses) {
        console.log(`  - (${h.likelihood}) ${h.statement}`);
      }
    }

    if (state.proposedChanges.length > 0) {
      console.log(`\nGenerated Patches:`);
      for (const p of state.proposedChanges) {
        console.log(`  - ${p.filePath}: ${p.explanation}`);
      }
    }

    if (state.trajectory.length > 0) {
      console.log(`\n` + formatTrajectoryTimeline(state.trajectory));
    }

    return;
  }

  // 4. Trace Persisted Execution
  if (command === "trace") {
    const runId = args[1];
    if (!runId || runId.startsWith("--")) {
      console.error("Error: Please provide a run ID to trace (e.g. 'argus trace run_123').");
      process.exit(1);
    }
    const targetDir = args[2] ?? process.cwd();
    try {
      const output = await runTrace(runId, targetDir);
      console.log(`\n` + output);
    } catch (err: any) {
      console.error(`Error: ${err?.message || String(err)}`);
      process.exit(1);
    }
    return;
  }

  console.error(`Unknown command: ${command}. Run 'argus --help' for usage instructions.`);
  process.exit(1);
}

main().catch((err) => {
  console.error("CLI error:", err);
  process.exit(1);
});
