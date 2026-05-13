import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const vendorRoot = process.env.FLOWSHOPY_DESKTOP_VENDOR_DIR?.trim()
  ? path.resolve(process.env.FLOWSHOPY_DESKTOP_VENDOR_DIR)
  : path.join(repoRoot, "apps", "desktop", "vendor");
const vendorDbDir = path.join(vendorRoot, "db");
const seedDbPath = path.join(vendorDbDir, "seed.db");
const metadataPath = path.join(vendorDbDir, "runtime.json");
const prismaSchemaPath = path.join(repoRoot, "packages", "db", "prisma", "schema.prisma");
const prismaConfigPath = path.join(repoRoot, "packages", "db", "prisma.config.ts");
const prismaCliEntry = path.join(repoRoot, "packages", "db", "node_modules", "prisma", "build", "index.js");

function resolveBetterSqlite3() {
  const modulePath = require.resolve("better-sqlite3", {
    paths: [path.join(repoRoot, "packages", "db"), repoRoot]
  });
  return require(modulePath);
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function runNodeCommand(command, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (options.echoStdout) {
        process.stdout.write(text);
      }
    });

    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (options.echoStderr !== false) {
        process.stderr.write(text);
      }
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

async function generateSchemaSql() {
  const env = {
    ...process.env,
    FLOWSHOPY_DB_URL: "file:./desktop-seed-placeholder.db"
  };

  const { stdout } = await runNodeCommand(process.execPath, [
    prismaCliEntry,
    "migrate",
    "diff",
    "--from-empty",
    "--to-schema",
    "prisma/schema.prisma",
    "--script"
  ], {
    cwd: path.join(repoRoot, "packages", "db"),
    env,
    echoStdout: false
  });

  return stdout.trim();
}

function computeSchemaHash(schemaSql) {
  return crypto.createHash("sha256").update(schemaSql).digest("hex");
}

function isPreparedSeedCurrent(schemaHash) {
  const metadata = readJsonIfExists(metadataPath);
  if (!metadata) return false;
  return (
    fs.existsSync(seedDbPath) &&
    metadata.schemaHash === schemaHash &&
    metadata.prismaSchemaPath === prismaSchemaPath &&
    metadata.prismaConfigPath === prismaConfigPath
  );
}

function buildSeedDb(schemaSql) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "flowshopy-desktop-seed-"));
  const tempDbPath = path.join(tempRoot, "seed.db");
  const BetterSqlite3 = resolveBetterSqlite3();

  try {
    const db = new BetterSqlite3(tempDbPath);
    try {
      db.pragma("journal_mode = WAL");
      db.pragma("foreign_keys = ON");
      db.exec(schemaSql);
    } finally {
      db.close();
    }

    fs.mkdirSync(vendorDbDir, { recursive: true });
    fs.copyFileSync(tempDbPath, seedDbPath);

    const schemaHash = computeSchemaHash(schemaSql);
    fs.writeFileSync(
      metadataPath,
      JSON.stringify(
        {
          preparedAt: new Date().toISOString(),
          schemaHash,
          prismaSchemaPath,
          prismaConfigPath
        },
        null,
        2
      )
    );

    console.log(`Prepared desktop DB seed: ${seedDbPath}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function main() {
  const existingMetadata = readJsonIfExists(metadataPath);
  if (existingMetadata && fs.existsSync(seedDbPath)) {
    console.log(`Desktop DB seed already prepared: ${seedDbPath}`);
    return;
  }

  const schemaSql = await generateSchemaSql();
  if (!schemaSql) {
    throw new Error("Failed to generate desktop DB seed SQL.");
  }
  if (isPreparedSeedCurrent(computeSchemaHash(schemaSql))) {
    console.log(`Desktop DB seed already prepared: ${seedDbPath}`);
    return;
  }
  buildSeedDb(schemaSql);
}

await main();
