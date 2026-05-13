import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const targets = [
  path.join(repoRoot, "apps", "desktop", "vendor", "node"),
  path.join(repoRoot, "apps", "desktop", "vendor", "esbuild"),
  path.join(repoRoot, "apps", "desktop", "vendor", "app-node-modules"),
  path.join(repoRoot, "apps", "desktop", "vendor", "workspace-node-modules"),
  path.join(repoRoot, "apps", "desktop", "vendor", "ffmpeg"),
  path.join(repoRoot, "apps", "desktop", "vendor", "python"),
  path.join(repoRoot, "apps", "desktop", "vendor", "db"),
  path.join(repoRoot, "apps", "desktop", "vendor", "models")
];

for (const target of targets) {
  try {
    fs.rmSync(target, { recursive: true, force: true });
    console.log(`Removed ${target}`);
  } catch (error) {
    if (process.platform === "win32") {
      const fallback = spawnSync("cmd.exe", ["/d", "/s", "/c", `rmdir /s /q "${target}"`], {
        stdio: "ignore"
      });
      if (fallback.status === 0 || !fs.existsSync(target)) {
        console.log(`Removed ${target}`);
        continue;
      }
    }
    throw error;
  }
}
