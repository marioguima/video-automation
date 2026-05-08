import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import http from "node:http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const webHost = process.env.WEB_HOST?.trim() || "127.0.0.1";
const webPort = Number(process.env.WEB_PORT ?? 4173);

function buildChildEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function runProcess(label, args) {
  const child =
    process.platform === "win32"
      ? spawn("cmd.exe", ["/d", "/s", "/c", `pnpm ${args.join(" ")}`], {
          cwd: repoRoot,
          stdio: "inherit",
          env: buildChildEnv()
        })
      : spawn("pnpm", args, {
          cwd: repoRoot,
          stdio: "inherit",
          env: buildChildEnv()
        });

  child.on("error", (error) => {
    console.error(`[${label}] failed to start: ${error.message}`);
  });

  return child;
}

async function canReuseExistingWebServer() {
  return await new Promise((resolve) => {
    const req = http.get(
      {
        host: webHost,
        port: webPort,
        path: "/",
        timeout: 1500
      },
      (res) => {
        res.resume();
        resolve(true);
      }
    );
    req.on("error", () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function killProcessTree(child) {
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore"
      });
      killer.on("error", () => resolve());
      killer.on("exit", () => resolve());
    });
    return;
  }

  try {
    child.kill("SIGTERM");
  } catch {
    return;
  }

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
      resolve();
    }, 4_000);

    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

const web = (await canReuseExistingWebServer())
  ? (console.log(`[web] reusing existing dev server at http://${webHost}:${webPort}/`), null)
  : runProcess("web", ["--filter", "@vizlec/web", "dev"]);
const desktop = runProcess("desktop", ["--filter", "@vizlec/desktop", "dev"]);

let shuttingDown = false;

async function shutdown({ source, code = 0, signal = null }) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  const otherProcesses = [web, desktop].filter((child) => child && child !== source);
  await Promise.all(otherProcesses.map((child) => killProcessTree(child)));

  if (signal) {
    process.exitCode = 0;
    return;
  }

  process.exit(code ?? 0);
}

desktop.once("exit", (code, signal) => {
  shutdown({ source: desktop, code: code ?? 0, signal });
});

if (web) {
  web.once("exit", (code, signal) => {
    const nextCode = typeof code === "number" && code !== 0 ? code : 0;
    shutdown({ source: web, code: nextCode, signal });
  });
}

["SIGINT", "SIGTERM"].forEach((signal) => {
  process.on(signal, () => {
    shutdown({ code: 0, signal });
  });
});
