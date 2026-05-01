import fs from "node:fs";
import path from "node:path";

function parseEnv(contents: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }
  return entries;
}

export function loadEnvFile(envPath: string): void {
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  const parsed = parseEnv(raw);
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function findRepoRoot(startDir: string): string {
  let current = path.resolve(startDir);
  while (true) {
    const workspacePath = path.join(current, "pnpm-workspace.yaml");
    const gitPath = path.join(current, ".git");
    if (fs.existsSync(workspacePath) || fs.existsSync(gitPath)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}

export function loadRootEnv(): void {
  const root = findRepoRoot(process.cwd());
  const envPath = path.join(root, ".env");
  loadEnvFile(envPath);
}
