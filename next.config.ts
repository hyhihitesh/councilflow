import type { NextConfig } from "next";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function parseDotEnvFile(filepath: string) {
  if (!existsSync(filepath)) return;
  const content = readFileSync(filepath, "utf8");
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function loadMonorepoEnv() {
  const appRoot = __dirname;
  const repoRoot = path.resolve(appRoot, "..", "..");

  // Load root env first, then app-local env to allow app-specific overrides.
  parseDotEnvFile(path.join(repoRoot, ".env.local"));
  parseDotEnvFile(path.join(appRoot, ".env.local"));
}

loadMonorepoEnv();

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
