#!/usr/bin/env node
import { runConfigScan } from "./commands/config_scan.js";
import { runVerifyPatch } from "./commands/verify.js";
import { runAnalyze } from "./commands/analyze.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    console.log(`
ARGUS CLI - MCP-Native Agentic Software Engineering Platform

Usage:
  argus config scan <path>           Scan GitHub Actions and Dockerfiles for configuration debt
  argus verify <patch.diff>          Run deterministic multi-stage verification sandbox on a diff
  argus analyze --repo <owner/repo>  Run multi-agent investigation and diagnosis on a repository
`);
    return;
  }

  if (command === "config" && args[1] === "scan") {
    const targetPath = args[2] ?? ".";
    console.log(`[ARGUS] Scanning configuration files in '${targetPath}'...`);
    const findings = await runConfigScan(targetPath);
    console.log(`\nScan complete. Found ${findings.length} configuration debt items:`);
    for (const f of findings) {
      console.log(`  - [${f.ruleId}] (${f.severity.toUpperCase()}) ${f.title} in ${f.file}:${f.line ?? "N/A"}`);
      console.log(`    Recommendation: ${f.recommendation}`);
    }
    return;
  }

  if (command === "verify") {
    const patchPath = args[1];
    if (!patchPath) {
      console.error("Error: Please provide a patch diff file to verify.");
      process.exit(1);
    }
    console.log(`[ARGUS] Verifying patch '${patchPath}' in sandbox...`);
    const result = await runVerifyPatch(patchPath);
    console.log(`\nVerification Result: ${result.overall.toUpperCase()}`);
    for (const stage of result.stages) {
      console.log(`  - Stage [${stage.stage}]: ${stage.passed ? "PASSED" : "FAILED"} (${stage.durationMs}ms)`);
    }
    return;
  }

  if (command === "analyze") {
    const repoIndex = args.indexOf("--repo");
    const repo = repoIndex !== -1 ? args[repoIndex + 1] : "local";
    console.log(`[ARGUS] Running multi-agent investigation on ${repo}...`);
    const state = await runAnalyze(repo ?? "local");
    console.log(`\nAnalysis status: ${state.status}`);
    console.log(`Discovered files: ${state.relevantFiles.join(", ")}`);
    return;
  }

  console.error(`Unknown command: ${command}. Use 'argus --help' for available commands.`);
  process.exit(1);
}

main().catch((err) => {
  console.error("CLI error:", err);
  process.exit(1);
});
