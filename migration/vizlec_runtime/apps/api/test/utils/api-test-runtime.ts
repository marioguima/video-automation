import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

export type ApiTestRuntime = {
  rootDir: string;
  tempDir: string;
  dataDir: string;
  dbPath: string;
  databaseUrl: string;
  resetDatabase: () => void;
  configureEnv: () => void;
  cleanup: () => void;
};

function normalizeFileUrl(filePath: string): string {
  return `file:${filePath.replace(/\\/g, "/")}`;
}

function hasColumn(db: Database.Database, tableName: string, columnName: string): boolean {
  const escapedTable = tableName.replace(/"/g, "\"\"");
  const escapedColumn = columnName.replace(/"/g, "\"\"");
  const rows = db
    .prepare(`PRAGMA table_info("${escapedTable}")`)
    .all() as Array<{ name: string }>;
  return rows.some((row) => row.name === escapedColumn);
}

function applyWorkspaceLayer1MigrationIfNeeded(rootDir: string, db: Database.Database): void {
  // Mantém os testes independentes do estado do banco local do operador.
  // Se o template ainda não recebeu a migration da camada 1, aplica no banco temporário.
  if (hasColumn(db, "Course", "workspaceId") && hasColumn(db, "Invitation", "workspaceId")) {
    return;
  }
  const migrationPath = path.join(
    rootDir,
    "packages",
    "db",
    "prisma",
    "migrations",
    "20260216223000_add_workspace_scope_layer1",
    "migration.sql"
  );
  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Layer1 migration file not found at ${migrationPath}`);
  }
  const migrationSql = fs.readFileSync(migrationPath, "utf8");
  db.exec(migrationSql);
}

function applyWorkspaceLayers234MigrationIfNeeded(rootDir: string, db: Database.Database): void {
  // Garante que os testes consigam validar isolamento por workspace nas entidades filhas
  // mesmo quando o template local ainda não recebeu a migration mais recente.
  if (
    hasColumn(db, "Module", "workspaceId") &&
    hasColumn(db, "Lesson", "workspaceId") &&
    hasColumn(db, "LessonVersion", "workspaceId") &&
    hasColumn(db, "Block", "workspaceId") &&
    hasColumn(db, "Asset", "workspaceId") &&
    hasColumn(db, "Job", "workspaceId") &&
    hasColumn(db, "Notification", "workspaceId")
  ) {
    return;
  }
  const migrationPath = path.join(
    rootDir,
    "packages",
    "db",
    "prisma",
    "migrations",
    "20260217113000_add_workspace_scope_layers_2_3_4",
    "migration.sql"
  );
  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Layer2/3/4 migration file not found at ${migrationPath}`);
  }
  const migrationSql = fs.readFileSync(migrationPath, "utf8");
  db.exec(migrationSql);
}

function cloneAndResetDatabase(rootDir: string, targetDbPath: string): void {
  const templateDbPath = path.join(rootDir, "data", "vizlec.db");
  if (!fs.existsSync(templateDbPath)) {
    throw new Error(`Database template not found at ${templateDbPath}`);
  }
  fs.copyFileSync(templateDbPath, targetDbPath);

  const db = new Database(targetDbPath);
  try {
    applyWorkspaceLayer1MigrationIfNeeded(rootDir, db);
    applyWorkspaceLayers234MigrationIfNeeded(rootDir, db);

    const rows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
      )
      .all() as Array<{ name: string }>;
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN");
    for (const { name } of rows) {
      if (name === "_prisma_migrations") continue;
      const escaped = name.replace(/"/g, "\"\"");
      db.exec(`DELETE FROM "${escaped}"`);
    }
    db.exec("COMMIT");
    db.exec("PRAGMA foreign_keys = ON");
  } finally {
    db.close();
  }
}

export function createApiTestRuntime(tempPrefix: string): ApiTestRuntime {
  const rootDir = path.resolve(import.meta.dirname, "../../../..");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), tempPrefix));
  const dataDir = path.join(tempDir, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "vizlec.db");
  const databaseUrl = normalizeFileUrl(dbPath);

  return {
    rootDir,
    tempDir,
    dataDir,
    dbPath,
    databaseUrl,
    resetDatabase: () => cloneAndResetDatabase(rootDir, dbPath),
    configureEnv: () => {
      process.env.DATA_DIR = dataDir;
      process.env.VIZLEC_DB_URL = databaseUrl;
      process.env.INTERNAL_JOBS_EVENT_TOKEN = "test-internal-token";
      process.env.AUTH_JWT_SECRET = "test-jwt-secret";
      process.env.AUTH_COOKIE_SECURE = "false";
      process.env.VIZLEC_SKIP_API_LISTEN = "true";
    },
    cleanup: () => {
      if (process.cwd().startsWith(tempDir)) {
        process.chdir(rootDir);
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };
}
