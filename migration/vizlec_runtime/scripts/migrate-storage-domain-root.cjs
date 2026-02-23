#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const args = {
    apply: false,
    move: false,
    force: false,
    src: null,
    dst: null
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--apply") args.apply = true;
    else if (token === "--move") args.move = true;
    else if (token === "--force") args.force = true;
    else if (token === "--src") args.src = argv[++i] ?? null;
    else if (token === "--dst") args.dst = argv[++i] ?? null;
    else if (token === "--help" || token === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown arg: ${token}`);
    }
  }
  if (args.move) args.apply = true;
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/migrate-storage-domain-root.cjs [--apply] [--move] [--force] [--src <dir>] [--dst <dir>]

Defaults:
  src = <repo>/migration/vizlec_runtime/data/courses
  dst = <repo>/migration/vizlec_runtime/data/channels

Modes:
  (no flags)  Dry-run only (shows what would happen)
  --apply     Copy files from src to dst
  --move      Move files (copy + remove source)

Safety:
  Refuses to write if destination exists and is non-empty unless --force is used.
`);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function walkFiles(rootDir) {
  const out = [];
  if (!fs.existsSync(rootDir)) return out;
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
      } else if (entry.isFile()) {
        out.push(abs);
      }
    }
  }
  return out.sort();
}

function dirIsNonEmpty(dirPath) {
  return fs.existsSync(dirPath) && fs.readdirSync(dirPath).length > 0;
}

function bytesHuman(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
}

function copyFilePreserve(src, dst) {
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
  const stat = fs.statSync(src);
  fs.utimesSync(dst, stat.atime, stat.mtime);
}

function removeEmptyDirsUpward(startDir, stopDir) {
  let current = startDir;
  const stopResolved = path.resolve(stopDir);
  while (current && path.resolve(current).startsWith(stopResolved)) {
    if (path.resolve(current) === stopResolved) break;
    const entries = fs.existsSync(current) ? fs.readdirSync(current) : [];
    if (entries.length > 0) break;
    fs.rmdirSync(current);
    current = path.dirname(current);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const runtimeRoot = path.resolve(__dirname, "..");
  const srcRoot = path.resolve(args.src || path.join(runtimeRoot, "data", "courses"));
  const dstRoot = path.resolve(args.dst || path.join(runtimeRoot, "data", "channels"));

  if (!fs.existsSync(srcRoot)) {
    console.log(`[storage-migrate] Source not found: ${srcRoot}`);
    process.exit(0);
  }
  if (srcRoot === dstRoot) {
    throw new Error("Source and destination are the same path.");
  }
  if (!args.force && dirIsNonEmpty(dstRoot)) {
    throw new Error(`Destination already exists and is non-empty: ${dstRoot} (use --force)`);
  }

  const files = walkFiles(srcRoot);
  let totalBytes = 0;
  const plan = files.map((src) => {
    const rel = path.relative(srcRoot, src);
    const dst = path.join(dstRoot, rel);
    const stat = fs.statSync(src);
    totalBytes += stat.size;
    return { src, dst, size: stat.size };
  });

  console.log(`[storage-migrate] Mode: ${args.move ? "MOVE" : args.apply ? "COPY" : "DRY-RUN"}`);
  console.log(`[storage-migrate] Source: ${srcRoot}`);
  console.log(`[storage-migrate] Dest:   ${dstRoot}`);
  console.log(`[storage-migrate] Files:  ${plan.length}`);
  console.log(`[storage-migrate] Bytes:  ${bytesHuman(totalBytes)} (${totalBytes})`);

  if (plan.length > 0) {
    console.log("[storage-migrate] Sample:");
    for (const item of plan.slice(0, 5)) {
      console.log(`  ${path.relative(runtimeRoot, item.src)} -> ${path.relative(runtimeRoot, item.dst)}`);
    }
    if (plan.length > 5) console.log(`  ... +${plan.length - 5} more`);
  }

  if (!args.apply) {
    console.log("[storage-migrate] Dry-run complete. Use --apply (copy) or --move.");
    return;
  }

  for (const item of plan) {
    copyFilePreserve(item.src, item.dst);
  }

  if (args.move) {
    for (const item of plan) {
      if (fs.existsSync(item.src)) fs.unlinkSync(item.src);
      removeEmptyDirsUpward(path.dirname(item.src), srcRoot);
    }
  }

  console.log(`[storage-migrate] ${args.move ? "Move" : "Copy"} complete.`);
}

try {
  main();
} catch (err) {
  console.error(`[storage-migrate] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

