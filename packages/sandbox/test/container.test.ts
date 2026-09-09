import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isDockerAvailable, resolveDockerPath, SandboxContainer } from "../src/container.js";

describe("SandboxContainer", () => {
  it("resolves docker executable correctly", async () => {
    const dockerPath = await resolveDockerPath();
    // In environments with Docker installed, returns path string or 'docker'
    if (dockerPath) {
      expect(typeof dockerPath).toBe("string");
    } else {
      expect(dockerPath).toBeNull();
    }
  });

  it("checks docker daemon availability", async () => {
    const available = await isDockerAvailable();
    expect(typeof available).toBe("boolean");
  });

  it("initializes and tears down sandbox container when docker is available", async () => {
    const available = await isDockerAvailable();
    if (!available) {
      // If docker daemon is not accessible, skip container lifecycle test
      return;
    }

    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "argus-sandbox-test-"));
    const container = new SandboxContainer({
      workspacePath,
      timeoutMs: 30000,
    });

    try {
      const cid = await container.initialize();
      expect(typeof cid).toBe("string");
      expect(cid.length).toBeGreaterThan(0);

      const res = await container.executeCommand("echo 'argus-sandbox-ok'");
      expect(res.passed).toBe(true);
      expect(res.stdout).toContain("argus-sandbox-ok");
    } finally {
      await container.destroy();
      await fs.rm(workspacePath, { recursive: true, force: true });
    }
  }, 60000);
});
