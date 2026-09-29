import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { getDataDir } from "./paths";
import { botSystem } from "./prompts";
import { botRoot, knowledgeList } from "./store";

const execFileAsync = promisify(execFile);

function psQuote(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function experienceFile() {
  return path.join(getDataDir(), "experience.json");
}

export function getExperience(): { botId: string | null; name: string | null } {
  try {
    const raw = JSON.parse(fs.readFileSync(experienceFile(), "utf8")) as { botId?: string | null; name?: string | null };
    return { botId: raw.botId ?? null, name: raw.name ?? null };
  } catch {
    return { botId: null, name: null };
  }
}

export function setExperience(botId: string | null, name?: string | null) {
  fs.mkdirSync(getDataDir(), { recursive: true });
  const row = { botId, name: name ?? null };
  fs.writeFileSync(experienceFile(), JSON.stringify(row, null, 2));
  return row;
}

async function zipDir(sourceDir: string, destZip: string) {
  if (fs.existsSync(destZip)) fs.unlinkSync(destZip);
  const script = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory(${psQuote(sourceDir)}, ${psQuote(destZip)})`;
  await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script]);
}

async function unzip(zipPath: string, destDir: string) {
  fs.mkdirSync(destDir, { recursive: true });
  const script = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory(${psQuote(zipPath)}, ${psQuote(destDir)})`;
  await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script]);
}

export async function exportPack(botId: string, destZip: string) {
  const bot = JSON.parse(fs.readFileSync(path.join(botRoot(botId), "bot.json"), "utf8")) as {
    id?: string;
    name?: string;
    purpose?: string;
  };
  const entries = knowledgeList(botId).filter((entry) => entry.status === "active");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "botpack-"));
  fs.writeFileSync(
    path.join(tmp, "bot.json"),
    JSON.stringify(
      {
        id: bot.id ?? botId,
        name: bot.name ?? "Bot",
        purpose: bot.purpose ?? "客服",
        system: botSystem(bot.name || "Bot", bot.purpose || "客服"),
      },
      null,
      2,
    ),
  );
  fs.mkdirSync(path.join(tmp, "knowledge"));
  fs.writeFileSync(path.join(tmp, "knowledge", "entries.json"), JSON.stringify(entries, null, 2));
  await zipDir(tmp, destZip);
  fs.rmSync(tmp, { recursive: true, force: true });
  return {
    path: destZip,
    entries: entries.length,
    excluded: ["API Key", "草稿与停用条目", "记录", "测试集", "调优提示词"],
  };
}

export async function importPack(zipPath: string) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "botpack-in-"));
  await unzip(zipPath, tmp);
  const bot = JSON.parse(fs.readFileSync(path.join(tmp, "bot.json"), "utf8")) as {
    name?: string;
    purpose?: string;
    system?: string;
  };
  const entries = JSON.parse(fs.readFileSync(path.join(tmp, "knowledge", "entries.json"), "utf8")) as unknown[];
  const id = `exp-${Date.now()}`;
  const dir = botRoot(id);
  fs.writeFileSync(
    path.join(dir, "bot.json"),
    JSON.stringify({ id, name: bot.name ?? "Bot", purpose: bot.purpose ?? "客服", system: bot.system }, null, 2),
  );
  fs.mkdirSync(path.join(dir, "knowledge"), { recursive: true });
  fs.writeFileSync(path.join(dir, "knowledge", "entries.json"), JSON.stringify(entries, null, 2));
  fs.rmSync(tmp, { recursive: true, force: true });
  return setExperience(id, bot.name ?? "Bot");
}
