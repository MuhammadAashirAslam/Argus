import fs from "node:fs";
import path from "node:path";

/**
 * Loads environment variables from a .env.local file.
 * Does NOT override existing process.env values.
 */
export function loadEnvFile(dir: string = process.cwd()): void {
  const envPath = path.join(dir, ".env.local");
  try {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local not found — that's fine, use process.env
  }
}
