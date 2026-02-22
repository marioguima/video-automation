import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

type Route = {
  method: string;
  endpoint: string;
};

function extractRoutesFromApiIndex(indexFileContent: string): Route[] {
  const routeRegex = /fastify\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g;
  const routes: Route[] = [];
  for (const match of indexFileContent.matchAll(routeRegex)) {
    routes.push({
      method: match[1].toUpperCase(),
      endpoint: match[2]
    });
  }
  return routes;
}

function extractRoutesFromInventoryMarkdown(mdContent: string): Route[] {
  const lines = mdContent.split(/\r?\n/);
  const routes: Route[] = [];

  for (const line of lines) {
    // Aceita os dois formatos de tabela:
    // 1) sem coluna de numeração: | GET | `/path` | ...
    // 2) com coluna "#":         | 1 | GET | `/path` | ...
    const match =
      line.match(/^\| (GET|POST|PATCH|PUT|DELETE) \| `([^`]+)` \|/) ??
      line.match(/^\| \d+ \| (GET|POST|PATCH|PUT|DELETE) \| `([^`]+)` \|/) ??
      line.match(/^\| (GET|POST|PATCH|PUT|DELETE) \| ([^|]+) \|/) ??
      line.match(/^\| \d+ \| (GET|POST|PATCH|PUT|DELETE) \| ([^|]+) \|/);
    if (!match) continue;
    const endpoint = match[2].trim();
    if (!endpoint.startsWith("/")) {
      continue;
    }
    routes.push({
      method: match[1],
      endpoint
    });
  }
  return routes;
}

function asKey(route: Route): string {
  return `${route.method} ${route.endpoint}`;
}

test("inventory table covers 100% of API endpoints and has no stale entries", async () => {
  const rootDir = path.resolve(import.meta.dirname, "../../../");
  const apiIndexPath = path.join(rootDir, "apps/api/src/index.ts");
  const inventoryPath = path.join(
    rootDir,
    "docs/arquitetura-seguranca-distribuicao/12-inventario-endpoints-execucao.md"
  );

  const apiRoutes = extractRoutesFromApiIndex(fs.readFileSync(apiIndexPath, "utf8"));
  const inventoryRoutes = extractRoutesFromInventoryMarkdown(
    fs.readFileSync(inventoryPath, "utf8")
  );

  const apiKeys = new Set(apiRoutes.map(asKey));
  const inventoryKeys = new Set(inventoryRoutes.map(asKey));

  const missingInInventory = [...apiKeys].filter((key) => !inventoryKeys.has(key));
  const staleInInventory = [...inventoryKeys].filter((key) => !apiKeys.has(key));

  assert.deepEqual(
    missingInInventory,
    [],
    `Endpoints da API sem inventário: ${missingInInventory.join(", ")}`
  );
  assert.deepEqual(
    staleInInventory,
    [],
    `Entradas obsoletas no inventário: ${staleInInventory.join(", ")}`
  );
});
