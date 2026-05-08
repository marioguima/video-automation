import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const sourceExecutable =
  process.env.npm_node_execpath?.trim() ||
  process.execPath;

const executableName = process.platform === "win32" ? "node.exe" : "node";
const targetDir = path.join(repoRoot, "apps", "desktop", "vendor", "node");
const targetExecutable = path.join(targetDir, executableName);
const metadataPath = path.join(targetDir, "runtime.json");

fs.mkdirSync(targetDir, { recursive: true });
try {
  fs.copyFileSync(sourceExecutable, targetExecutable);
} catch (error) {
  if (!(error && typeof error === "object" && "code" in error && error.code === "EBUSY" && fs.existsSync(targetExecutable))) {
    throw error;
  }
}
fs.writeFileSync(
  metadataPath,
  JSON.stringify(
    {
      sourceExecutable,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      preparedAt: new Date().toISOString()
    },
    null,
    2
  )
);

console.log(`Prepared desktop Node runtime: ${targetExecutable}`);
