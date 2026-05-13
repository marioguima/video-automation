import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const executableName = process.platform === "win32" ? "FlowShopy.exe" : "FlowShopy";
const executablePath = path.join(repoRoot, "dist", "desktop", "win-unpacked", executableName);

if (!fs.existsSync(executablePath)) {
  console.error(`Unpacked desktop executable not found at ${executablePath}`);
  console.error("Run `pnpm dist:desktop` first.");
  process.exit(1);
}

const env = {
  ...process.env
};

delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(executablePath, [], {
  cwd: path.dirname(executablePath),
  stdio: "inherit",
  env
});

child.on("error", (error) => {
  console.error(`Failed to launch unpacked desktop app: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exitCode = 0;
    return;
  }
  process.exit(code ?? 0);
});
