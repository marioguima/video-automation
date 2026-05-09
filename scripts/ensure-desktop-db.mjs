import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

function normalizeFilePath(filePath) {
  if (process.platform === "win32") {
    return filePath.replace(/\\/g, "/");
  }
  return filePath;
}

function resolvePrismaCliEntry(searchPaths) {
  const candidates = [
    "prisma/build/index.js",
    "prisma/build/index.cjs"
  ];
  for (const request of candidates) {
    try {
      return require.resolve(request, { paths: searchPaths });
    } catch {
      // Try next candidate.
    }
  }
  throw new Error("Unable to resolve Prisma CLI entry for desktop database bootstrap.");
}

async function runNodeCommand(command, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      stdio: options.stdio ?? "pipe"
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
      process.stdout.write(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`Command failed with exit code ${code}: ${command} ${args.join(" ")}`));
    });
  });
}

async function main() {
  const dataDir =
    process.env.DATA_DIR?.trim() ||
    (() => {
      const runtimeConfigPath = process.env.FLOWSHOPY_DESKTOP_CONFIG_PATH?.trim();
      if (runtimeConfigPath) {
        return path.dirname(path.resolve(runtimeConfigPath));
      }
      return path.join(repoRoot, "data");
    })();

  const runtimeNodeExecutable =
    process.env.DESKTOP_RUNTIME_NODE_PATH?.trim() ||
    process.env.npm_node_execpath?.trim() ||
    process.execPath;

  const dbPath = path.join(dataDir, "data.db");
  const databaseUrl = `file:${normalizeFilePath(dbPath)}`;
  fs.mkdirSync(dataDir, { recursive: true });

  const searchPaths = [
    path.join(repoRoot, "packages", "db"),
    repoRoot
  ];
  const dbDir = path.join(repoRoot, "packages", "db");
  const prismaCliEntry = resolvePrismaCliEntry(searchPaths);

  const env = {
    ...process.env,
    FLOWSHOPY_DB_URL: databaseUrl
  };

  console.log(`Ensuring desktop SQLite schema at ${databaseUrl}`);
  await runNodeCommand(
    runtimeNodeExecutable,
    [prismaCliEntry, "migrate", "deploy"],
    {
      cwd: dbDir,
      env
    }
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
