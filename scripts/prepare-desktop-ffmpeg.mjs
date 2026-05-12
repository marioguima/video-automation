import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { DESKTOP_RUNTIME_DEFAULTS } from "./desktop-runtime-versions.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const vendorRoot =
  process.env.FLOWSHOPY_DESKTOP_VENDOR_DIR?.trim() ||
  path.join(repoRoot, "apps", "desktop", "vendor");
const targetDir = path.join(vendorRoot, "ffmpeg");
const metadataPath = path.join(targetDir, "runtime.json");
const executableName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
const probeName = process.platform === "win32" ? "ffprobe.exe" : "ffprobe";
const defaultArchiveName = DESKTOP_RUNTIME_DEFAULTS.ffmpegArchiveName;
const defaultArchiveUrl = DESKTOP_RUNTIME_DEFAULTS.ffmpegUrl;

function ensureWindows() {
  if (process.platform !== "win32") {
    throw new Error("prepare-desktop-ffmpeg currently supports Windows packaging only.");
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function downloadFile(url, destinationPath) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  ensureDir(path.dirname(destinationPath));
  const handle = fs.createWriteStream(destinationPath);
  const stream = Readable.fromWeb(response.body);
  await new Promise((resolve, reject) => {
    stream.pipe(handle);
    stream.on("error", reject);
    handle.on("finish", resolve);
    handle.on("error", reject);
  });
}

function extractZip(zipPath, destinationPath) {
  ensureDir(destinationPath);
  const command = [
    "-NoProfile",
    "-Command",
    `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destinationPath.replace(/'/g, "''")}' -Force`
  ];
  const result = spawnSync("powershell", command, {
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error(`Failed to extract archive: ${zipPath}`);
  }
}

function findFileRecursive(rootDir, fileName) {
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
        return fullPath;
      }
    }
  }
  return null;
}

function cleanDirectory(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  ensureDir(dirPath);
}

function removeDirectoryQuietly(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

async function main() {
  ensureWindows();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "flowshopy-ffmpeg-"));

  try {
    const archivePath =
      process.env.FLOWSHOPY_FFMPEG_ARCHIVE_PATH?.trim() ||
      path.join(tempDir, defaultArchiveName);

    if (!process.env.FLOWSHOPY_FFMPEG_ARCHIVE_PATH?.trim() && !fs.existsSync(archivePath)) {
      console.log(`Downloading ffmpeg runtime from ${defaultArchiveUrl}`);
      await downloadFile(defaultArchiveUrl, archivePath);
    }

    if (!fs.existsSync(archivePath)) {
      throw new Error(`FFmpeg archive not found: ${archivePath}`);
    }

    const extractDir = path.join(tempDir, "extract");
    cleanDirectory(extractDir);
    extractZip(archivePath, extractDir);

    const ffmpegSource = findFileRecursive(extractDir, executableName);
    const ffprobeSource = findFileRecursive(extractDir, probeName);
    if (!ffmpegSource || !ffprobeSource) {
      throw new Error("Unable to locate ffmpeg.exe and ffprobe.exe inside the downloaded archive.");
    }

    cleanDirectory(targetDir);
    fs.copyFileSync(ffmpegSource, path.join(targetDir, executableName));
    fs.copyFileSync(ffprobeSource, path.join(targetDir, probeName));

    fs.writeFileSync(
      metadataPath,
      JSON.stringify(
        {
          sourceUrl: defaultArchiveUrl,
          archiveName: defaultArchiveName,
          platform: process.platform,
          arch: process.arch,
          preparedAt: new Date().toISOString()
        },
        null,
        2
      )
    );

    console.log(`Prepared desktop ffmpeg runtime: ${targetDir}`);
  } finally {
    removeDirectoryQuietly(tempDir);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
