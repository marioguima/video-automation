import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const productName = process.env.FLOWSHOPY_DESKTOP_PRODUCT_NAME?.trim() || "FlowShopy Desktop";
const explicitUserDataDir = process.env.FLOWSHOPY_USERDATA_DIR?.trim();
const localAppDataDir =
  process.env.LOCALAPPDATA?.trim() ||
  path.join(os.homedir(), "AppData", "Local");

const userDataDir = explicitUserDataDir || path.join(localAppDataDir, productName);
const targets = [
  path.join(userDataDir, "data"),
  path.join(userDataDir, "vendor"),
  path.join(localAppDataDir, "FlowShopy", "electron-session")
];

for (const target of targets) {
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`Removed ${target}`);
}
