import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const stagingRoot = path.join(repoRoot, "apps", "desktop", "vendor", "workspace-node-modules");
const metadataPath = path.join(stagingRoot, "runtime.json");
const desktopVendorRoot = path.join(repoRoot, "apps", "desktop", "vendor").replace(/\\/g, "/");
const rootRuntimeNodeModulesTarget = path.join(stagingRoot, "node_modules");

const workspaceTargets = [
  { from: path.join(repoRoot, "apps", "desktop", "node_modules"), to: path.join(stagingRoot, "apps", "desktop", "node_modules") },
  { from: path.join(repoRoot, "apps", "api", "node_modules"), to: path.join(stagingRoot, "apps", "api", "node_modules") },
  { from: path.join(repoRoot, "apps", "worker", "node_modules"), to: path.join(stagingRoot, "apps", "worker", "node_modules") },
  { from: path.join(repoRoot, "packages", "db", "node_modules"), to: path.join(stagingRoot, "packages", "db", "node_modules") }
];

function isExcludedRuntimePackage(packageName) {
  return (
    packageName === ".bin" ||
    packageName.startsWith("@esbuild/") ||
    packageName.startsWith("@flowshopy/") ||
    packageName.startsWith("@vizlec/") ||
    packageName.startsWith("@types/")
  );
}

function copyWorkspaceNodeModules(fromDir, toDir) {
  if (!fs.existsSync(fromDir)) {
    throw new Error(`Workspace node_modules directory not found at ${fromDir}`);
  }
  fs.mkdirSync(path.dirname(toDir), { recursive: true });
  fs.cpSync(fromDir, toDir, {
    recursive: true,
    force: true,
    dereference: true,
    filter(source) {
      const normalized = source.replace(/\\/g, "/");
      if (normalized.includes("/.cache/")) return false;
      if (normalized.startsWith(desktopVendorRoot)) return false;
      if (normalized.includes("/node_modules/.pnpm/node_modules/@flowshopy")) return false;
      if (normalized.includes("/node_modules/.pnpm/node_modules/@vizlec")) return false;
      return true;
    }
  });
}

function listTopLevelPackageNames(nodeModulesDir) {
  if (!fs.existsSync(nodeModulesDir)) {
    return [];
  }
  const packageNames = [];
  for (const entry of fs.readdirSync(nodeModulesDir, { withFileTypes: true })) {
    if (entry.name === ".bin") continue;
    if (entry.name.startsWith("@")) {
      const scopeDir = path.join(nodeModulesDir, entry.name);
      if (!fs.existsSync(scopeDir)) continue;
      for (const scopedEntry of fs.readdirSync(scopeDir, { withFileTypes: true })) {
        const scopedPackageDir = path.join(scopeDir, scopedEntry.name);
        if (fs.existsSync(scopedPackageDir) && fs.statSync(scopedPackageDir).isDirectory()) {
          packageNames.push(`${entry.name}/${scopedEntry.name}`);
        }
      }
      continue;
    }
    const packageDir = path.join(nodeModulesDir, entry.name);
    if (fs.existsSync(packageDir) && fs.statSync(packageDir).isDirectory()) {
      packageNames.push(entry.name);
    }
  }
  return packageNames.filter((packageName) => !isExcludedRuntimePackage(packageName));
}

function isExactVersionSpecifier(versionSpec) {
  return Boolean(versionSpec) && !/[~^*><|]/.test(versionSpec);
}

function resolvePackageSourceDir(packageName, versionSpec = "") {
  const packageParts = packageName.split("/");
  if (packageName === "@prisma/client" && isExactVersionSpecifier(versionSpec)) {
    const prismaCandidates = fs
      .readdirSync(path.join(repoRoot, "node_modules", ".pnpm"), { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          entry.name.startsWith(`@prisma+client@${versionSpec}_`)
      )
      .map((entry) => path.join(repoRoot, "node_modules", ".pnpm", entry.name, "node_modules", ...packageParts));
    const prismaMatch = prismaCandidates.find((candidate) => fs.existsSync(candidate));
    if (prismaMatch) {
      return prismaMatch;
    }
  }
  const exactPnpmCandidate = isExactVersionSpecifier(versionSpec)
    ? path.join(
        repoRoot,
        "node_modules",
        ".pnpm",
        `${packageParts[0]}${packageParts.length > 1 ? `+${packageParts[1]}` : ""}@${versionSpec}`,
        "node_modules",
        ...packageParts
      )
    : "";
  const candidates = [
    exactPnpmCandidate,
    path.join(repoRoot, "node_modules", ...packageParts),
    path.join(repoRoot, "node_modules", ".pnpm", "node_modules", ...packageParts)
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function copyResolvedPathSync(sourcePath, targetPath) {
  const stat = fs.lstatSync(sourcePath);
  if (stat.isSymbolicLink()) {
    const realPath = fs.realpathSync(sourcePath);
    copyResolvedPathSync(realPath, targetPath);
    return;
  }
  if (stat.isDirectory()) {
    fs.mkdirSync(targetPath, { recursive: true });
    for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
      copyResolvedPathSync(path.join(sourcePath, entry.name), path.join(targetPath, entry.name));
    }
    return;
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function copyRuntimePackageToRoot(packageName, sourceDir) {
  const targetDir = path.join(rootRuntimeNodeModulesTarget, ...packageName.split("/"));
  if (fs.existsSync(targetDir)) {
    return targetDir;
  }
  const realSourceDir = fs.realpathSync(sourceDir);
  fs.rmSync(targetDir, { recursive: true, force: true });
  copyResolvedPathSync(realSourceDir, targetDir);
  return targetDir;
}

function collectRuntimeDependencySpecifiers(packageJson) {
  return {
    ...(packageJson.dependencies || {}),
    ...(packageJson.optionalDependencies || {}),
    ...(packageJson.peerDependencies || {})
  };
}

function populateRootRuntimeDependencies() {
  fs.mkdirSync(rootRuntimeNodeModulesTarget, { recursive: true });
  const queue = [];
  const seen = new Set();

  for (const target of workspaceTargets) {
    for (const packageName of listTopLevelPackageNames(target.from)) {
      queue.push({ packageName, versionSpec: "" });
    }
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const { packageName, versionSpec } = current;
    if (seen.has(packageName) || isExcludedRuntimePackage(packageName)) {
      continue;
    }
    const sourceDir = resolvePackageSourceDir(packageName, versionSpec);
    if (!sourceDir) {
      continue;
    }
    seen.add(packageName);
    const copiedDir = copyRuntimePackageToRoot(packageName, sourceDir);
    const packageJsonPath = path.join(copiedDir, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      continue;
    }
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    const dependencySpecifiers = collectRuntimeDependencySpecifiers(packageJson);
    for (const [dependencyName, dependencyVersionSpec] of Object.entries(dependencySpecifiers)) {
      if (isExcludedRuntimePackage(dependencyName)) {
        continue;
      }
      queue.push({
        packageName: dependencyName,
        versionSpec: String(dependencyVersionSpec || "")
      });
    }
  }

  return Array.from(seen).sort();
}

function findPrismaClientPackageDirs(rootDir) {
  const results = [];
  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return;
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(currentDir, entry.name);
      const normalized = fullPath.replace(/\\/g, "/");
      if (normalized.endsWith("/@prisma/client")) {
        results.push(fullPath);
        continue;
      }
      walk(fullPath);
    }
  }
  walk(rootDir);
  return results;
}

function materializePrismaGeneratedClients(rootDir) {
  for (const prismaClientDir of findPrismaClientPackageDirs(rootDir)) {
    const packageJsonPath = path.join(prismaClientDir, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      continue;
    }
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    const sourceClientDir = resolvePackageSourceDir("@prisma/client", String(packageJson.version || ""));
    if (!sourceClientDir) {
      continue;
    }
    const realSourceClientDir = fs.realpathSync(sourceClientDir);
    const sourceGeneratedDir = path.join(path.dirname(path.dirname(realSourceClientDir)), ".prisma");
    if (!fs.existsSync(sourceGeneratedDir)) {
      continue;
    }
    const targetGeneratedDir = path.join(path.dirname(path.dirname(prismaClientDir)), ".prisma");
    fs.mkdirSync(path.dirname(targetGeneratedDir), { recursive: true });
    fs.cpSync(sourceGeneratedDir, targetGeneratedDir, {
      recursive: true,
      force: true,
      dereference: true
    });
  }
}

fs.rmSync(stagingRoot, { recursive: true, force: true });
for (const target of workspaceTargets) {
  copyWorkspaceNodeModules(target.from, target.to);
}
const populatedRuntimePackages = populateRootRuntimeDependencies();
materializePrismaGeneratedClients(stagingRoot);

fs.writeFileSync(
  metadataPath,
  JSON.stringify(
    {
      preparedAt: new Date().toISOString(),
      rootRuntimePackages: populatedRuntimePackages,
      workspaces: workspaceTargets.map((target) => ({
        from: target.from,
        to: target.to
      }))
    },
    null,
    2
  )
);

console.log(`Prepared desktop workspace node_modules runtime: ${stagingRoot}`);
