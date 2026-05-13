import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function resolveDataDir() {
  const explicit = process.env.DATA_DIR?.trim();
  if (explicit) {
    return path.resolve(explicit);
  }

  const runtimeConfigPath = process.env.FLOWSHOPY_DESKTOP_CONFIG_PATH?.trim();
  if (runtimeConfigPath) {
    return path.dirname(path.resolve(runtimeConfigPath));
  }

  return path.join(repoRoot, "data");
}

function resolveSeedDbPath() {
  const explicitVendorDir = process.env.FLOWSHOPY_DESKTOP_VENDOR_DIR?.trim();
  if (explicitVendorDir) {
    return path.join(path.resolve(explicitVendorDir), "db", "seed.db");
  }

  return path.join(repoRoot, "apps", "desktop", "vendor", "db", "seed.db");
}

function main() {
  const dataDir = resolveDataDir();
  const dbPath = path.join(dataDir, "data.db");
  const seedDbPath = resolveSeedDbPath();

  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(seedDbPath)) {
    throw new Error(`Desktop DB seed not found at ${seedDbPath}`);
  }

  const hasExistingDb = fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0;
  if (hasExistingDb) {
    console.log(`Desktop SQLite database already present at file:${dbPath.replace(/\\/g, "/")}`);
    return;
  }

  fs.copyFileSync(seedDbPath, dbPath);
  console.log(`Initialized desktop SQLite database at file:${dbPath.replace(/\\/g, "/")} from seed`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
}
