import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function listTsFiles(dirPath: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTsFiles(fullPath));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

test("hardening: control plane API does not call provider endpoints directly", async () => {
  const rootDir = path.resolve(import.meta.dirname, "../../../");
  const apiSrcDir = path.join(rootDir, "apps", "api", "src");
  const apiFiles = listTsFiles(apiSrcDir);

  const forbiddenProviderPaths = [
    "/speakers",
    "/speakers_list",
    "/api/tags",
    "/api/chat",
    "/system_stats",
    "/api/free"
  ];

  const violations: string[] = [];

  for (const filePath of apiFiles) {
    const content = fs.readFileSync(filePath, "utf8");
    for (const providerPath of forbiddenProviderPaths) {
      if (!content.includes(providerPath)) continue;
      const relPath = path.relative(rootDir, filePath).replace(/\\/g, "/");
      violations.push(`${relPath} -> ${providerPath}`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `API control plane nao pode acessar provider direto. Violacoes: ${violations.join(", ")}`
  );
});
