import { BrowserWindow } from "electron";
import fs from "fs";
import path from "path";
import { streamChat } from "./llm";
import { getDataDir } from "./paths";
import { botSystem, WORKBENCH_SYSTEM } from "./prompts";
import { getSettings } from "./settings";

type Entry = Record<string, unknown> & { id: string; status?: string; title?: string; ref?: string };
type TestCase = { id: string; question: string; expectHit?: string | null };

function ensure(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown) {
  ensure(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

export function botRoot(botId: string) {
  const dir = path.join(getDataDir(), "bots", botId);
  ensure(dir);
  const botFile = path.join(dir, "bot.json");
  if (!fs.existsSync(botFile)) {
    writeJson(botFile, { id: botId, name: botId === "default" ? "默认 Bot" : botId, purpose: "客服" });
  }
  return dir;
}

export function botsList() {
  const root = path.join(getDataDir(), "bots");
  ensure(root);
  if (!fs.existsSync(path.join(root, "default"))) botRoot("default");
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => readJson(path.join(root, d.name, "bot.json"), { id: d.name, name: d.name }));
}

export function botsCreate(name: string, purpose: string) {
  const id = `bot-${Date.now()}`;
  const dir = botRoot(id);
  writeJson(path.join(dir, "bot.json"), { id, name, purpose });
  return { id, name, purpose };
}

export function botsUpdate(patch: { id: string; name?: string; purpose?: string }) {
  const file = path.join(botRoot(patch.id), "bot.json");
  const current = readJson<Record<string, unknown>>(file, { id: patch.id });
  const next = { ...current, ...patch };
  writeJson(file, next);
  return next;
}

function entriesFile(botId: string) {
  return path.join(botRoot(botId), "knowledge", "entries.json");
}

export function knowledgeList(botId: string): Entry[] {
  return readJson<Entry[]>(entriesFile(botId), []);
}

export function knowledgeSave(botId: string, entry: Entry) {
  const list = knowledgeList(botId);
  const idx = list.findIndex((e) => e.id === entry.id);
  const prev = idx >= 0 ? { ...list[idx] } : null;
  const next = { ...entry, updatedAt: new Date().toISOString() };
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  writeJson(entriesFile(botId), list);
  const log = path.join(botRoot(botId), "knowledge", "changelog.jsonl");
  ensure(path.dirname(log));
  fs.appendFileSync(
    log,
    JSON.stringify({
      ts: next.updatedAt,
      id: entry.id,
      action: prev ? "修改" : "新增",
      what: prev
        ? `${String(prev["title"] ?? prev.id)} → ${String(next["title"] ?? next.id)}`
        : `新增 ${String(next["title"] ?? next.id)}`,
      why: typeof next["ref"] === "string" ? next["ref"] : "",
      status: entry.status,
    }) + "\n",
  );
  return next;
}

export function knowledgeSetStatus(botId: string, id: string, status: string) {
  const list = knowledgeList(botId);
  const hit = list.find((e) => e.id === id);
  if (!hit) return null;
  hit.status = status;
  return knowledgeSave(botId, hit);
}

export function knowledgeChangelog(botId: string) {
  const file = path.join(botRoot(botId), "knowledge", "changelog.jsonl");
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function casesFile(botId: string) {
  return path.join(botRoot(botId), "tests", "cases.json");
}

export function testsList(botId: string): TestCase[] {
  return readJson<TestCase[]>(casesFile(botId), []);
}

export function testsSave(botId: string, cases: TestCase[]) {
  writeJson(casesFile(botId), cases);
  return cases;
}

export async function testsRun(win: BrowserWindow, botId: string) {
  const cases = testsList(botId);
  const failed: string[] = [];
  const items: Array<Record<string, unknown>> = [];
  let pass = 0;
  for (let i = 0; i < cases.length; i++) {
    const item = cases[i];
    const result = await chatSend(win, botId, { mode: "test", text: item.question, silent: true });
    const reply = result.reply ?? "";
    const missed = reply.includes("命中：无");
    const ok = !missed && (item.expectHit
      ? reply.includes(item.expectHit) || result.hitIds.includes(item.expectHit)
      : result.hitIds.length > 0);
    const reason = missed
      ? "未通过：回复是「命中：无」"
      : ok
        ? item.expectHit
          ? `通过：回复包含期望 ${item.expectHit}`
          : "通过：命中了知识条目"
        : item.expectHit
          ? `未通过：未命中期望 ${item.expectHit}`
          : "未通过：没有命中任何条目";
    if (ok) pass += 1;
    else failed.push(item.id);
    items.push({
      id: item.id,
      question: item.question,
      expectHit: item.expectHit ?? null,
      hitIds: result.hitIds,
      ok,
      reason,
      reply: reply.slice(0, 200),
    });
    win.webContents.send("tests:progress", { done: i + 1, total: cases.length, failed: [...failed] });
  }
  const summary = { pass, total: cases.length, failed, items };
  const dir = path.join(botRoot(botId), "tests", "runs");
  ensure(dir);
  writeJson(path.join(dir, `${Date.now()}.json`), summary);
  return summary;
}

function recordsDir(botId: string) {
  const dir = path.join(botRoot(botId), "records");
  ensure(dir);
  return dir;
}

export function recordsList(botId: string) {
  return fs
    .readdirSync(recordsDir(botId))
    .filter((name) => name.endsWith(".json"))
    .map((name) => readJson<Record<string, unknown> | null>(path.join(recordsDir(botId), name), null))
    .filter((row): row is Record<string, unknown> => row != null);
}

export function recordsGet(botId: string, id: string) {
  return readJson(path.join(recordsDir(botId), `${id}.json`), null);
}

export function recordsSubmit(botId: string, payload: Record<string, unknown>) {
  const id = `R-${Date.now()}`;
  const row = { ...payload, id, createdAt: new Date().toISOString(), status: payload.status ?? "pending" };
  writeJson(path.join(recordsDir(botId), `${id}.json`), row);
  return { id };
}

function csvCell(value: unknown) {
  const text = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function recordsExportCsv(botId: string) {
  const rows = recordsList(botId);
  const header = ["id", "createdAt", "status", "question", "expectation", "note"];
  const lines = [header.join(",")];
  for (const row of rows) lines.push(header.map((key) => csvCell(row[key])).join(","));
  const file = path.join(recordsDir(botId), "index.csv");
  fs.writeFileSync(file, `\uFEFF${lines.join("\n")}`, "utf8");
  return { ok: true, path: file };
}

export function recordsUpdate(botId: string, id: string, patch: Record<string, unknown>) {
  const current = recordsGet(botId, id) as Record<string, unknown> | null;
  if (!current) return null;
  const next = { ...current, ...patch, id };
  writeJson(path.join(recordsDir(botId), `${id}.json`), next);
  return next;
}

function materialsIndex(botId: string) {
  return path.join(botRoot(botId), "materials", "index.json");
}

export function materialsList(botId: string) {
  return readJson<Array<Record<string, unknown>>>(materialsIndex(botId), []);
}

export function materialsImport(botId: string, filePaths: string[]) {
  const dir = path.join(botRoot(botId), "materials");
  ensure(dir);
  const index = materialsList(botId);
  for (const src of filePaths) {
    const ext = path.extname(src).toLowerCase();
    const name = path.basename(src);
    if (ext !== ".txt" && ext !== ".md") {
      index.push({ id: `M-${Date.now()}`, name, ok: false, note: "目前只支持 txt / md" });
      continue;
    }
    fs.copyFileSync(src, path.join(dir, name));
    const text = fs.readFileSync(path.join(dir, name), "utf8");
    const segments = text
      .split(/\n\s*\n/)
      .map((body) => body.trim())
      .filter(Boolean);
    index.push({
      id: `M-${Date.now()}-${index.length}`,
      name,
      path: name,
      note: `${segments.length} 段`,
      segments,
    });
  }
  writeJson(materialsIndex(botId), index);
  return index;
}

function dayFile(botId: string) {
  const day = new Date().toISOString().slice(0, 10);
  return path.join(botRoot(botId), "chats", `${day}.jsonl`);
}

export function chatMark(botId: string, payload: { verdict?: string; hitIds?: string[]; text?: string }) {
  const file = dayFile(botId);
  ensure(path.dirname(file));
  const line = {
    ts: new Date().toISOString(),
    mode: "test",
    verdict: payload.verdict ?? "helpful",
    hitIds: payload.hitIds ?? [],
    text: payload.text ?? "",
  };
  fs.appendFileSync(file, JSON.stringify(line) + "\n");
  return line;
}

export async function chatSend(
  win: BrowserWindow,
  botId: string,
  payload: {
    mode: "workbench" | "test";
    text: string;
    includeKnowledge?: boolean;
    env?: Record<string, string>;
    silent?: boolean;
  },
) {
  const started = Date.now();
  const settings = getSettings();
  const profile = settings.models.find((m) => m.id === settings.activeModelId) ?? settings.models[0];
  if (!profile?.apiKey) {
    const msg = "还没填 API Key。到设置里保存一套模型配置后再试。";
    win.webContents.send("chat:delta", msg);
    return { ok: false, reply: msg, hitIds: [], ms: 0, tokens: 0 };
  }
  const bot = readJson<{ name?: string; purpose?: string }>(path.join(botRoot(botId), "bot.json"), {
    name: "Bot",
    purpose: "客服",
  });
  const entries = knowledgeList(botId);
  const picked =
    payload.mode === "test"
      ? entries.filter((e) => e.status === "active")
      : payload.includeKnowledge === false
        ? []
        : entries;
  const knowledgeText = picked.length
    ? `\n\n【知识条目】\n${JSON.stringify(picked, null, 2)}`
    : "\n\n【知识条目】\n（空）";
  const envText = payload.env ? `\n\n【环境】\n${JSON.stringify(payload.env)}` : "";
  const system =
    payload.mode === "test" ? botSystem(bot.name || "Bot", bot.purpose || "客服") : WORKBENCH_SYSTEM;
  const result = await streamChat({
    win,
    botId,
    url: profile.baseUrl.replace(/\/$/, "") + "/chat/completions",
    apiKey: profile.apiKey,
    model: profile.model,
    temperature: profile.temperature,
    silent: payload.silent,
    messages: [
      { role: "system", content: system + (payload.mode === "test" || payload.includeKnowledge !== false ? knowledgeText : "") },
      { role: "user", content: payload.text + envText },
    ],
  });
  const hitIds = picked
    .map((e) => String(e.id))
    .filter((id) => id && result.text.includes(String(entries.find((e) => e.id === id)?.title ?? "\u0000")));
  const line = {
    ts: new Date().toISOString(),
    mode: payload.mode,
    text: payload.text,
    reply: result.text,
    hitIds,
    modelProfile: profile.name,
    ms: Date.now() - started,
    tokens: result.tokens,
  };
  const file = dayFile(botId);
  ensure(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify(line) + "\n");
  return { ok: !result.aborted, reply: result.text, hitIds, ms: line.ms, tokens: result.tokens };
}
