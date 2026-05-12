import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const targets = [
  path.join(repoRoot, "apps", "desktop", "vendor", "node"),
  path.join(repoRoot, "apps", "desktop", "vendor", "ffmpeg"),
  path.join(repoRoot, "apps", "desktop", "vendor", "python"),
  path.join(repoRoot, "apps", "desktop", "vendor", "models")
];

for (const target of targets) {
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`Removed ${target}`);
}
