import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const vendorRoot =
  process.env.FLOWSHOPY_DESKTOP_VENDOR_DIR?.trim() ||
  path.join(repoRoot, "apps", "desktop", "vendor");
const targetDir = path.join(vendorRoot, "esbuild");
const targetBinaryPath = path.join(targetDir, process.platform === "win32" ? "esbuild.exe" : "esbuild");
const metadataPath = path.join(targetDir, "runtime.json");

function ensureWindows() {
  if (process.platform !== "win32") {
    throw new Error("prepare-desktop-esbuild currently supports Windows packaging only.");
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

function runCommand(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function canReadFile(filePath) {
  try {
    const handle = fs.openSync(filePath, "r");
    fs.closeSync(handle);
    return true;
  } catch {
    return false;
  }
}

function copyFileByBytes(sourcePath, destinationPath) {
  const bytes = fs.readFileSync(sourcePath);
  ensureDir(path.dirname(destinationPath));
  fs.writeFileSync(destinationPath, bytes);
}

function resolveInstalledEsbuildVersion() {
  const tsxPackageJsonPath = path.join(repoRoot, "apps", "desktop", "node_modules", "tsx", "package.json");
  const tsxPackageJson = JSON.parse(fs.readFileSync(tsxPackageJsonPath, "utf8"));
  const dependencyRange = String(tsxPackageJson.dependencies?.esbuild || "");
  const majorMinorMatch = dependencyRange.match(/(\d+\.\d+)/);
  if (!majorMinorMatch) {
    throw new Error(`Unable to resolve esbuild version range from ${tsxPackageJsonPath}`);
  }
  const majorMinorPrefix = `${majorMinorMatch[1]}.`;
  const pnpmDir = path.join(repoRoot, "node_modules", ".pnpm");
  const candidates = fs
    .readdirSync(pnpmDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(`esbuild@${majorMinorPrefix}`))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const version = candidates[0]?.match(/^esbuild@([^_]+)/)?.[1];
  if (!version) {
    throw new Error(`Unable to resolve installed esbuild version for range ${dependencyRange}`);
  }
  return version;
}

function findReadableLocalBinary(version) {
  const candidates = [
    path.join(repoRoot, "node_modules", ".pnpm", `esbuild@${version}`, "node_modules", "@esbuild", "win32-x64", "esbuild.exe"),
    path.join(repoRoot, "node_modules", ".pnpm", `@esbuild+win32-x64@${version}`, "node_modules", "@esbuild", "win32-x64", "esbuild.exe")
  ];
  return candidates.find((candidate) => fs.existsSync(candidate) && canReadFile(candidate)) || "";
}

function findReadableFallbackBinary(version) {
  const roots = [
    process.env.LOCALAPPDATA?.trim() ? path.join(process.env.LOCALAPPDATA.trim(), "Programs") : "",
    process.env.LOCALAPPDATA?.trim() ? path.join(process.env.LOCALAPPDATA.trim(), "npm-cache", "_npx") : ""
  ].filter(Boolean);

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const stack = [root];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }
        if (entry.name !== "esbuild.exe") continue;
        if (!fullPath.replace(/\\/g, "/").includes("/node_modules/@esbuild/win32-x64/esbuild.exe")) {
          continue;
        }
        const esbuildPackageJsonPath = path.join(path.dirname(path.dirname(path.dirname(fullPath))), "esbuild", "package.json");
        if (!fs.existsSync(esbuildPackageJsonPath)) {
          continue;
        }
        try {
          const packageJson = JSON.parse(fs.readFileSync(esbuildPackageJsonPath, "utf8"));
          if (String(packageJson.version || "") === version && canReadFile(fullPath)) {
            return fullPath;
          }
        } catch {}
      }
    }
  }

  return "";
}

async function downloadBinaryFromRegistry(version, destinationPath, tempDir) {
  const tarballUrl = `https://registry.npmjs.org/@esbuild/win32-x64/-/win32-x64-${version}.tgz`;
  const archivePath = path.join(tempDir, `esbuild-win32-x64-${version}.tgz`);
  const extractDir = path.join(tempDir, "extract");
  console.log(`Downloading esbuild binary from ${tarballUrl}`);
  await downloadFile(tarballUrl, archivePath);
  ensureDir(extractDir);
  runCommand("tar", ["-xzf", archivePath, "-C", extractDir]);
  const extractedBinaryPath = path.join(extractDir, "package", "esbuild.exe");
  if (!fs.existsSync(extractedBinaryPath)) {
    throw new Error(`Downloaded esbuild archive did not produce ${extractedBinaryPath}`);
  }
  copyFileByBytes(extractedBinaryPath, destinationPath);
}

async function main() {
  ensureWindows();
  const version = resolveInstalledEsbuildVersion();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "flowshopy-esbuild-"));
  try {
    fs.rmSync(targetDir, { recursive: true, force: true });
    ensureDir(targetDir);

    const localBinaryPath = findReadableLocalBinary(version);
    const fallbackBinaryPath = localBinaryPath || findReadableFallbackBinary(version);
    if (fallbackBinaryPath) {
      copyFileByBytes(fallbackBinaryPath, targetBinaryPath);
    } else {
      await downloadBinaryFromRegistry(version, targetBinaryPath, tempDir);
    }

    fs.writeFileSync(
      metadataPath,
      JSON.stringify(
        {
          esbuildVersion: version,
          binaryPath: targetBinaryPath,
          platform: process.platform,
          arch: process.arch,
          preparedAt: new Date().toISOString()
        },
        null,
        2
      )
    );

    console.log(`Prepared desktop esbuild runtime: ${targetBinaryPath}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
