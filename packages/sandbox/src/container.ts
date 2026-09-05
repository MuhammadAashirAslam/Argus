import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);

export interface SandboxCommandResult {
  passed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface SandboxContainerOptions {
  image?: string | undefined;
  workspacePath: string;
  timeoutMs?: number | undefined;
  environmentVariables?: Record<string, string> | undefined;
  dockerPath?: string | undefined;
}

/**
 * Resolves the docker executable path across Windows, macOS, and Linux.
 */
export async function resolveDockerPath(explicitPath?: string): Promise<string | null> {
  if (explicitPath) {
    try {
      await execFileAsync(explicitPath, ["--version"]);
      return explicitPath;
    } catch {
      return null;
    }
  }

  // Try standard PATH first
  try {
    await execFileAsync("docker", ["--version"]);
    return "docker";
  } catch {
    // Check known Windows paths
    const candidates = [
      path.join(
        process.env["LOCALAPPDATA"] || "",
        "Programs",
        "DockerDesktop",
        "resources",
        "bin",
        "docker.exe",
      ),
      "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",
      "C:\\Program Files\\Docker\\Docker\\resources\\docker.exe",
    ];

    for (const candidate of candidates) {
      try {
        await execFileAsync(candidate, ["--version"]);
        return candidate;
      } catch {
        continue;
      }
    }
  }

  return null;
}

/**
 * Returns an environment object that includes the directory of the docker binary in PATH.
 */
function getDockerEnv(
  dockerBin: string,
  customEnv?: Record<string, string>,
): Record<string, string> {
  const env = { ...process.env, ...customEnv };
  if (path.isAbsolute(dockerBin)) {
    const dockerDir = path.dirname(dockerBin);
    const pathSeparator = process.platform === "win32" ? ";" : ":";
    const currentPath = env["PATH"] || env["Path"] || "";
    if (!currentPath.includes(dockerDir)) {
      env["PATH"] = `${dockerDir}${pathSeparator}${currentPath}`;
      if (env["Path"]) {
        env["Path"] = `${dockerDir}${pathSeparator}${currentPath}`;
      }
    }
  }
  return env as Record<string, string>;
}

/**
 * Checks if Docker daemon is running and accessible.
 */
export async function isDockerAvailable(customDockerPath?: string): Promise<boolean> {
  const docker = await resolveDockerPath(customDockerPath);
  if (!docker) return false;

  try {
    const env = getDockerEnv(docker);
    await execFileAsync(docker, ["ps", "-q"], { timeout: 5000, env });
    return true;
  } catch {
    return false;
  }
}

/**
 * Manages an isolated Docker sandbox container for verification (§19, §32).
 * Fresh container per verification attempt with full cleanup.
 */
export class SandboxContainer {
  private containerId: string | null = null;
  private readonly containerName: string;
  private readonly image: string;
  private readonly workspacePath: string;
  private readonly timeoutMs: number;
  private readonly envVars: Record<string, string>;
  private dockerBin: string = "docker";

  constructor(options: SandboxContainerOptions) {
    this.containerName = `argus-sandbox-${randomUUID().slice(0, 8)}`;
    this.image = options.image ?? "node:20-alpine";
    this.workspacePath = options.workspacePath;
    this.timeoutMs = options.timeoutMs ?? 60000;
    this.envVars = options.environmentVariables ?? {};
    if (options.dockerPath) {
      this.dockerBin = options.dockerPath;
    }
  }

  /**
   * Initializes and starts a fresh container.
   */
  public async initialize(): Promise<string> {
    const resolvedDocker = await resolveDockerPath(
      this.dockerBin !== "docker" ? this.dockerBin : undefined,
    );
    if (!resolvedDocker) {
      throw new Error("Docker is not installed or not found in system paths.");
    }
    this.dockerBin = resolvedDocker;

    // Check daemon
    const available = await isDockerAvailable(this.dockerBin);
    if (!available) {
      throw new Error("Docker daemon is not running or not accessible.");
    }

    // Create container in detached mode with resource limits (§19, §32)
    const runArgs = [
      "run",
      "-d",
      "--name",
      this.containerName,
      "--memory=2g",
      "--cpus=2",
      "-w",
      "/workspace",
    ];

    for (const [k, v] of Object.entries(this.envVars)) {
      runArgs.push("-e", `${k}=${v}`);
    }
    runArgs.push(this.image, "tail", "-f", "/dev/null");

    const env = getDockerEnv(this.dockerBin);
    const { stdout: cid } = await execFileAsync(this.dockerBin, runArgs, {
      timeout: this.timeoutMs,
      env,
    });
    this.containerId = cid.trim();

    // Copy workspace contents to container
    await this.copyWorkspaceToContainer();

    return this.containerId;
  }

  /**
   * Copies workspace files into container /workspace.
   */
  private async copyWorkspaceToContainer(): Promise<void> {
    if (!this.containerName) return;

    const env = getDockerEnv(this.dockerBin);
    const srcPath = path.resolve(this.workspacePath);
    await execFileAsync(
      this.dockerBin,
      ["cp", `${srcPath}/.`, `${this.containerName}:/workspace/`],
      {
        timeout: this.timeoutMs,
        env,
      },
    );
  }

  /**
   * Executes a shell command inside the container safely without host shell expansion.
   */
  public async executeCommand(command: string, timeoutMs?: number): Promise<SandboxCommandResult> {
    if (!this.containerName) {
      throw new Error("Sandbox container is not initialized.");
    }

    const start = Date.now();
    const timeout = timeoutMs ?? this.timeoutMs;
    const env = getDockerEnv(this.dockerBin);

    try {
      const { stdout, stderr } = await execFileAsync(
        this.dockerBin,
        ["exec", this.containerName, "sh", "-c", command],
        {
          timeout,
          maxBuffer: 10 * 1024 * 1024,
          env,
        },
      );

      return {
        passed: true,
        exitCode: 0,
        stdout,
        stderr,
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        passed: false,
        exitCode: typeof err?.code === "number" ? err.code : 1,
        stdout: err?.stdout ?? "",
        stderr: err?.stderr ?? err?.message ?? "Execution failed",
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Applies a unified diff patch inside the sandbox container.
   */
  public async applyPatch(diff: string): Promise<SandboxCommandResult> {
    if (!diff.trim()) {
      return {
        passed: true,
        exitCode: 0,
        stdout: "Empty patch - no changes applied",
        stderr: "",
        durationMs: 0,
      };
    }

    const env = getDockerEnv(this.dockerBin);
    const tmpDiffPath = path.join(os.tmpdir(), `patch-${randomUUID()}.diff`);
    try {
      await fs.writeFile(tmpDiffPath, diff, "utf-8");
      await execFileAsync(
        this.dockerBin,
        ["cp", tmpDiffPath, `${this.containerName}:/tmp/candidate.patch`],
        { env },
      );

      const patchRes = await this.executeCommand(
        "if command -v git >/dev/null 2>&1; then git apply /tmp/candidate.patch; elif command -v patch >/dev/null 2>&1; then patch -p1 < /tmp/candidate.patch; else exit 1; fi",
      );

      return patchRes;
    } finally {
      await fs.unlink(tmpDiffPath).catch(() => {});
    }
  }

  /**
   * Destroys and removes the container (§19, §32: fresh per attempt).
   */
  public async destroy(): Promise<void> {
    if (this.containerName) {
      const env = getDockerEnv(this.dockerBin);
      try {
        await execFileAsync(this.dockerBin, ["rm", "-f", this.containerName], {
          timeout: 10000,
          env,
        });
      } catch {
        // Ignore removal error
      }
      this.containerId = null;
    }
  }
}
