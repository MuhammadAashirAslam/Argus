import { describe, it, expect } from "vitest";
import { ConfigDebtEngine } from "../src/engine.js";
import { CD001_UnpinnedAction, CD003_HardcodedSecrets } from "../../../rules/github-actions/index.js";
import { CD101_FloatingBaseImage, CD105_RootExecution } from "../../../rules/docker/index.js";

describe("ConfigDebtEngine with deterministic rules", () => {
  it("detects unpinned GitHub action (CD001)", () => {
    const engine = new ConfigDebtEngine();
    engine.registerRule(CD001_UnpinnedAction);

    const yaml = `
name: Build
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
`;
    const findings = engine.analyzeFile(".github/workflows/build.yml", yaml);
    expect(findings.length).toBe(1);
    expect(findings[0]?.ruleId).toBe("CD001");
    expect(findings[0]?.severity).toBe("high");
  });

  it("passes pinned GitHub action (CD001)", () => {
    const engine = new ConfigDebtEngine();
    engine.registerRule(CD001_UnpinnedAction);

    const yaml = `
steps:
  - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11
`;
    const findings = engine.analyzeFile(".github/workflows/build.yml", yaml);
    expect(findings.length).toBe(0);
  });

  it("detects floating base image in Dockerfile (CD101)", () => {
    const engine = new ConfigDebtEngine();
    engine.registerRule(CD101_FloatingBaseImage);

    const dockerfile = `
FROM node:latest
WORKDIR /app
COPY . .
`;
    const findings = engine.analyzeFile("Dockerfile", dockerfile);
    expect(findings.length).toBe(1);
    expect(findings[0]?.ruleId).toBe("CD101");
  });

  it("detects root execution in Dockerfile (CD105)", () => {
    const engine = new ConfigDebtEngine();
    engine.registerRule(CD105_RootExecution);

    const dockerfile = `
FROM node:20.10.0
WORKDIR /app
CMD ["node", "server.js"]
`;
    const findings = engine.analyzeFile("Dockerfile", dockerfile);
    expect(findings.length).toBe(1);
    expect(findings[0]?.ruleId).toBe("CD105");
  });
});
