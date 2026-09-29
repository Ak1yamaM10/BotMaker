import { app } from "electron";
import fs from "fs";
import path from "path";

const pointerFile = () => path.join(app.getPath("userData"), "workspace.json");

export function defaultDataDir() {
  return path.join(app.getPath("documents"), "BotMaker");
}

export function getDataDir() {
  try {
    const raw = JSON.parse(fs.readFileSync(pointerFile(), "utf8")) as { dataDir?: string };
    if (raw.dataDir) return raw.dataDir;
  } catch {
    /* first launch */
  }
  return defaultDataDir();
}

export function setDataDir(dataDir: string) {
  fs.mkdirSync(path.dirname(pointerFile()), { recursive: true });
  fs.writeFileSync(pointerFile(), JSON.stringify({ dataDir }, null, 2));
  fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}
