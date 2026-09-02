import { describe, it, expect } from "vitest";
import { BENCHMARK_DATASET } from "../src/cases/dataset.js";
import { runFullComparativeTrial } from "../src/runner.js";

describe("ARGUS Benchmarks & Comparative Evaluation (§26, §27)", () => {
  it("contains 10 valid benchmark cases matching schema", () => {
    expect(BENCHMARK_DATASET.length).toBe(10);
    for (const c of BENCHMARK_DATASET) {
      expect(c.id).toMatch(/^ARGUS-BM-/);
      expect(c.relevantFiles.length).toBeGreaterThan(0);
    }
  });

  it("runs comparative trial across Baseline A, Baseline B, and ARGUS MCP", async () => {
    const testCase = BENCHMARK_DATASET[0]!;
    const trial = await runFullComparativeTrial(testCase);

    expect(trial.baselineA.configuration).toBe("BASELINE_A");
    expect(trial.baselineB.configuration).toBe("BASELINE_B");
    expect(trial.argus.configuration).toBe("ARGUS_MCP");

    // ARGUS MCP should achieve highest diagnosis accuracy
    expect(trial.argus.diagnosisAccuracy).toBeGreaterThan(trial.baselineA.diagnosisAccuracy);
    expect(trial.argus.falsePositiveRate).toBeLessThan(trial.baselineA.falsePositiveRate);
  });
});
