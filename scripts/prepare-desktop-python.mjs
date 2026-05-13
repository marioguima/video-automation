import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
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
const targetDir = path.join(vendorRoot, "python");
const vendorModelsDir = path.join(vendorRoot, "models", "faster-whisper");
const metadataPath = path.join(targetDir, "runtime.json");
const requirementsPath =
  process.env.FLOWSHOPY_PYTHON_REQUIREMENTS_PATH?.trim() ||
  path.join(repoRoot, "apps", "worker", "python-requirements.txt");
const defaultPythonVersion = DESKTOP_RUNTIME_DEFAULTS.pythonVersion;
const defaultPythonUrl = DESKTOP_RUNTIME_DEFAULTS.pythonUrl;
const defaultGetPipUrl = DESKTOP_RUNTIME_DEFAULTS.getPipUrl;
const defaultWhisperModel = DESKTOP_RUNTIME_DEFAULTS.fasterWhisperModel;

function ensureWindows() {
  if (process.platform !== "win32") {
    throw new Error("prepare-desktop-python currently supports Windows packaging only.");
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
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

function cleanDirectory(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  ensureDir(dirPath);
}

function removeDirectoryQuietly(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function hashFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function isPreparedRuntimeCurrent() {
  const metadata = readJsonIfExists(metadataPath);
  if (!metadata) return false;
  if (!fs.existsSync(requirementsPath)) return false;

  const pythonExe = path.join(targetDir, process.platform === "win32" ? "python.exe" : "python");
  const requirementsHash = hashFile(requirementsPath);
  const modelDirExists =
    fs.existsSync(vendorModelsDir) &&
    fs.statSync(vendorModelsDir).isDirectory() &&
    fs.readdirSync(vendorModelsDir).length > 0;

  return (
    fs.existsSync(pythonExe) &&
    modelDirExists &&
    metadata.pythonVersion === defaultPythonVersion &&
    metadata.sourceUrl === defaultPythonUrl &&
    metadata.getPipUrl === defaultGetPipUrl &&
    metadata.requirementsHash === requirementsHash &&
    metadata.fasterWhisperModel === defaultWhisperModel &&
    metadata.platform === process.platform &&
    metadata.arch === process.arch
  );
}

function findFileRecursive(rootDir, matcher) {
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
      if (entry.isFile() && matcher(entry.name)) {
        return fullPath;
      }
    }
  }
  return null;
}

function patchEmbeddedPythonPathFile(pythonDir) {
  const pthPath = findFileRecursive(pythonDir, (name) => /^python\d+._pth$/i.test(name));
  if (!pthPath) {
    throw new Error("Unable to locate pythonXY._pth in embedded Python runtime.");
  }

  const lines = fs.readFileSync(pthPath, "utf8").split(/\r?\n/);
  const nextLines = [];
  let hasImportSite = false;
  let hasSitePackages = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "#import site" || trimmed === "import site") {
      nextLines.push("import site");
      hasImportSite = true;
      continue;
    }
    if (trimmed.toLowerCase() === "lib/site-packages" || trimmed.toLowerCase() === "lib\\site-packages") {
      nextLines.push("Lib\\site-packages");
      hasSitePackages = true;
      continue;
    }
    nextLines.push(line);
  }

  if (!hasImportSite) {
    nextLines.push("import site");
  }
  if (!hasSitePackages) {
    nextLines.push("Lib\\site-packages");
  }

  fs.writeFileSync(pthPath, `${nextLines.join("\r\n").replace(/\r?\n+$/, "")}\r\n`, "utf8");
  ensureDir(path.join(pythonDir, "Lib", "site-packages"));
}

function resolveEmbeddedPythonExecutable(pythonDir) {
  const executableName = process.platform === "win32" ? "python.exe" : "python";
  const executablePath = path.join(pythonDir, executableName);
  if (!fs.existsSync(executablePath)) {
    throw new Error(`Embedded Python executable not found: ${executablePath}`);
  }
  return executablePath;
}

function runPython(pythonExe, args, options = {}) {
  const result = spawnSync(pythonExe, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      PYTHONUTF8: "1",
      HF_HUB_DISABLE_SYMLINKS_WARNING: "1",
      ...options.env
    }
  });
  if (result.status !== 0) {
    throw new Error(`Python command failed: ${args.join(" ")}`);
  }
}

function installPip(pythonExe, getPipPath) {
  runPython(pythonExe, [getPipPath, "--no-warn-script-location"]);
}

function installRequirements(pythonExe) {
  if (!fs.existsSync(requirementsPath)) {
    throw new Error(`Missing Python requirements file: ${requirementsPath}`);
  }
  runPython(pythonExe, [
    "-m",
    "pip",
    "install",
    "--upgrade",
    "--no-warn-script-location",
    "pip",
    "setuptools",
    "wheel"
  ]);
  runPython(pythonExe, [
    "-m",
    "pip",
    "install",
    "--no-warn-script-location",
    "-r",
    requirementsPath
  ]);
}

function predownloadWhisperModel(pythonExe, modelName, modelsDir) {
  ensureDir(modelsDir);
  const bootstrapScriptPath = path.join(os.tmpdir(), `flowshopy-whisper-bootstrap-${process.pid}.py`);
  fs.writeFileSync(
    bootstrapScriptPath,
    [
      "from faster_whisper import WhisperModel",
      "import os",
      "import sys",
      "",
      "model_name = sys.argv[1]",
      "download_root = sys.argv[2]",
      "model = WhisperModel(model_name, device='cpu', compute_type='int8', download_root=download_root)",
      "print(getattr(model, 'model_size_or_path', model_name))"
    ].join("\n"),
    "utf8"
  );
  try {
    runPython(pythonExe, [bootstrapScriptPath, modelName, modelsDir]);
  } finally {
    try {
      fs.rmSync(bootstrapScriptPath, { force: true });
    } catch {}
  }
}

async function main() {
  ensureWindows();
  if (isPreparedRuntimeCurrent()) {
    console.log(`Desktop python runtime already prepared: ${targetDir}`);
    return;
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "flowshopy-python-"));

  try {
    const archivePath =
      process.env.FLOWSHOPY_PYTHON_ARCHIVE_PATH?.trim() ||
      path.join(tempDir, `python-${defaultPythonVersion}-embed-amd64.zip`);
    const getPipPath = path.join(tempDir, "get-pip.py");

    if (!process.env.FLOWSHOPY_PYTHON_ARCHIVE_PATH?.trim() && !fs.existsSync(archivePath)) {
      console.log(`Downloading embedded Python runtime from ${defaultPythonUrl}`);
      await downloadFile(defaultPythonUrl, archivePath);
    }
    if (!fs.existsSync(archivePath)) {
      throw new Error(`Embedded Python archive not found: ${archivePath}`);
    }

    if (!fs.existsSync(getPipPath)) {
      console.log(`Downloading get-pip bootstrap from ${defaultGetPipUrl}`);
      await downloadFile(defaultGetPipUrl, getPipPath);
    }

    cleanDirectory(targetDir);
    extractZip(archivePath, targetDir);
    patchEmbeddedPythonPathFile(targetDir);

    const pythonExe = resolveEmbeddedPythonExecutable(targetDir);
    installPip(pythonExe, getPipPath);
    installRequirements(pythonExe);

    fs.rmSync(vendorModelsDir, { recursive: true, force: true });
    predownloadWhisperModel(pythonExe, defaultWhisperModel, vendorModelsDir);

    fs.writeFileSync(
      metadataPath,
      JSON.stringify(
        {
          pythonVersion: defaultPythonVersion,
          sourceUrl: defaultPythonUrl,
          getPipUrl: defaultGetPipUrl,
          pythonExecutable: pythonExe,
          requirementsPath,
          requirementsHash: hashFile(requirementsPath),
          fasterWhisperModel: defaultWhisperModel,
          fasterWhisperModelDir: vendorModelsDir,
          platform: process.platform,
          arch: process.arch,
          preparedAt: new Date().toISOString()
        },
        null,
        2
      )
    );

    console.log(`Prepared desktop python runtime: ${targetDir}`);
  } finally {
    removeDirectoryQuietly(tempDir);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
