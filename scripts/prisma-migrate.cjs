const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const rootDir = path.resolve(__dirname, "..");
const envPath = path.join(rootDir, ".env");
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
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
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function normalizeFilePath(filePath) {
  if (process.platform === "win32") {
    return filePath.replace(/\\/g, "/");
  }
  return filePath;
}

let dataDir = process.env.DATA_DIR?.trim();
if (!dataDir) {
  console.error("Set DATA_DIR in .env before running migrations.");
  process.exit(1);
}

const dbPath = path.join(dataDir, "vizlec.db");
const databaseUrl = `file:${normalizeFilePath(dbPath)}`;
process.env.VIZLEC_DB_URL = databaseUrl;

fs.mkdirSync(dataDir, { recursive: true });
console.log(`Using SQLite at ${databaseUrl}`);

async function isApiRunning() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 800);
    const res = await fetch("http://127.0.0.1:4010/health", {
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));
    return res.ok;
  } catch {
    return false;
  }
}

async function isWorkerRunning() {
  const port = Number(process.env.WORKER_PORT ?? 4011);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 800);
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  if (await isApiRunning()) {
    console.error(
      "API appears to be running. Stop API and worker before db:migrate to avoid Prisma engine lock issues on Windows."
    );
    process.exit(1);
  }
  if (await isWorkerRunning()) {
    console.error(
      "Worker appears to be running. Stop API and worker before db:migrate to avoid Prisma engine lock issues on Windows."
    );
    process.exit(1);
  }

  const args = process.argv.slice(2);
  let name = "init";
  const nameIndex = args.indexOf("--name");
  if (nameIndex >= 0) {
    if (args[nameIndex + 1]) {
      name = args[nameIndex + 1];
    }
    args.splice(nameIndex, 2);
  }

  const dbDir = path.join(rootDir, "packages", "db");
  const prismaBin = path.join(
    dbDir,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "prisma.cmd" : "prisma"
  );
  const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

  function runPrisma(prismaArgs) {
    if (fs.existsSync(prismaBin)) {
      return spawnSync(prismaBin, prismaArgs, {
        stdio: "inherit",
        cwd: dbDir,
        env: process.env,
        shell: process.platform === "win32"
      });
    }
    return spawnSync(
      pnpmCmd,
      ["--dir", dbDir, "exec", "prisma", ...prismaArgs],
      {
        stdio: "inherit",
        cwd: rootDir,
        env: process.env,
        shell: process.platform === "win32"
      }
    );
  }

  let result;
  result = runPrisma(["migrate", "dev", "--name", name, ...args]);

  if (result.error) {
    console.error("Failed to run pnpm for Prisma migration.", result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`Prisma migration failed with exit code ${result.status}.`);
    process.exit(result.status ?? 1);
  }

  console.log("Running Prisma client generate...");
  const generateResult = runPrisma(["generate"]);
  if (generateResult.error) {
    console.error("Failed to run Prisma generate.", generateResult.error);
    process.exit(1);
  }
  if (generateResult.status !== 0) {
    console.error(`Prisma generate failed with exit code ${generateResult.status}.`);
    process.exit(generateResult.status ?? 1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("db:migrate failed", err);
  process.exit(1);
});
