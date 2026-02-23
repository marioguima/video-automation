#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");

const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const dbPkgRequire = createRequire(path.join(rootDir, "packages", "db", "package.json"));
const Database = dbPkgRequire("better-sqlite3");
const dbPath = process.env.VIZLEC_DB_FILE
  ? path.resolve(rootDir, process.env.VIZLEC_DB_FILE)
  : path.join(dataDir, "vizlec.db");

const apply = process.argv.includes("--apply");
const noBackup = process.argv.includes("--no-backup");

const SQL_STEPS = [
  { kind: "table", from: "Course", to: "Channel", sql: 'ALTER TABLE "Course" RENAME TO "Channel";' },
  { kind: "table", from: "Module", to: "Section", sql: 'ALTER TABLE "Module" RENAME TO "Section";' },
  { kind: "table", from: "Lesson", to: "Video", sql: 'ALTER TABLE "Lesson" RENAME TO "Video";' },
  {
    kind: "table",
    from: "LessonVersion",
    to: "VideoVersion",
    sql: 'ALTER TABLE "LessonVersion" RENAME TO "VideoVersion";'
  },
  {
    kind: "column",
    table: "Section",
    legacyTable: "Module",
    from: "courseId",
    to: "channelId",
    sql: 'ALTER TABLE "Section" RENAME COLUMN "courseId" TO "channelId";'
  },
  {
    kind: "column",
    table: "Video",
    legacyTable: "Lesson",
    from: "moduleId",
    to: "sectionId",
    sql: 'ALTER TABLE "Video" RENAME COLUMN "moduleId" TO "sectionId";'
  },
  {
    kind: "column",
    table: "VideoVersion",
    legacyTable: "LessonVersion",
    from: "lessonId",
    to: "videoId",
    sql: 'ALTER TABLE "VideoVersion" RENAME COLUMN "lessonId" TO "videoId";'
  },
  {
    kind: "column",
    table: "Block",
    from: "lessonVersionId",
    to: "videoVersionId",
    sql: 'ALTER TABLE "Block" RENAME COLUMN "lessonVersionId" TO "videoVersionId";'
  },
  {
    kind: "column",
    table: "Job",
    from: "lessonVersionId",
    to: "videoVersionId",
    sql: 'ALTER TABLE "Job" RENAME COLUMN "lessonVersionId" TO "videoVersionId";'
  },
  {
    kind: "column",
    table: "Notification",
    from: "lessonId",
    to: "videoId",
    sql: 'ALTER TABLE "Notification" RENAME COLUMN "lessonId" TO "videoId";'
  },
  {
    kind: "column",
    table: "Notification",
    from: "lessonVersionId",
    to: "videoVersionId",
    sql: 'ALTER TABLE "Notification" RENAME COLUMN "lessonVersionId" TO "videoVersionId";'
  }
];

function tableExists(db, name) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name);
  return Boolean(row);
}

function columnExists(db, table, column) {
  if (!tableExists(db, table)) return false;
  const rows = db.prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`).all();
  return rows.some((r) => r.name === column);
}

function classifyStep(db, step) {
  if (step.kind === "table") {
    const fromExists = tableExists(db, step.from);
    const toExists = tableExists(db, step.to);
    if (fromExists && !toExists) return "pending";
    if (!fromExists && toExists) return "already-applied";
    if (!fromExists && !toExists) return "missing";
    return "conflict";
  }
  const fromExists = columnExists(db, step.table, step.from);
  const toExists = columnExists(db, step.table, step.to);
  if (!tableExists(db, step.table) && step.legacyTable && tableExists(db, step.legacyTable)) {
    return "pending-after-table-rename";
  }
  if (fromExists && !toExists) return "pending";
  if (!fromExists && toExists) return "already-applied";
  if (!fromExists && !toExists) return "missing";
  return "conflict";
}

function makeBackup() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(dataDir, `vizlec.pre-domain-physical-rename.${stamp}.db`);
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
}

if (!fs.existsSync(dbPath)) {
  console.error(`[prisma-domain-rename] DB not found: ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath, { readonly: !apply });
try {
  const statuses = SQL_STEPS.map((s) => ({ ...s, status: classifyStep(db, s) }));
  const pending = statuses.filter(
    (s) => s.status === "pending" || s.status === "pending-after-table-rename"
  );
  const conflicts = statuses.filter((s) => s.status === "conflict");
  const missing = statuses.filter((s) => s.status === "missing");

  console.log(`[prisma-domain-rename] db=${dbPath}`);
  for (const s of statuses) {
    const target = s.kind === "table" ? `${s.from} -> ${s.to}` : `${s.table}.${s.from} -> ${s.to}`;
    console.log(` - [${s.status}] ${target}`);
  }

  if (!apply) {
    console.log(
      `[prisma-domain-rename] dry-run complete (${pending.length} pending, ${conflicts.length} conflict, ${missing.length} missing)`
    );
    process.exit(conflicts.length > 0 ? 2 : 0);
  }

  if (conflicts.length > 0) {
    console.error("[prisma-domain-rename] Conflict detected. Resolve manually before --apply.");
    process.exit(2);
  }

  if (pending.length === 0) {
    console.log("[prisma-domain-rename] Nothing to apply.");
    process.exit(0);
  }

  let backupPath = null;
  if (!noBackup) {
    backupPath = makeBackup();
    console.log(`[prisma-domain-rename] backup=${backupPath}`);
  }

  const txn = db.transaction(() => {
    for (const s of statuses) {
      if (!(s.status === "pending" || s.status === "pending-after-table-rename")) continue;
      db.exec(s.sql);
    }
  });

  txn();
  console.log(`[prisma-domain-rename] applied ${pending.length} steps successfully`);
} finally {
  db.close();
}
