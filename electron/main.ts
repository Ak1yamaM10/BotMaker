import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import fs from "fs";
import path from "path";
import { stopChat } from "./llm";
import { exportPack, getExperience, importPack, setExperience } from "./pack";
import { getSettings, saveSettings } from "./settings";
import {
  botRoot,
  botsCreate,
  botsList,
  botsUpdate,
  chatMark,
  chatSend,
  knowledgeChangelog,
  knowledgeList,
  knowledgeSave,
  knowledgeSetStatus,
  materialsImport,
  materialsList,
  recordsExportCsv,
  recordsGet,
  recordsList,
  recordsSubmit,
  recordsUpdate,
  testsList,
  testsRun,
  testsSave,
} from "./store";

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 740,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: "#F7F8FA",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(path.join(__dirname, "../dist/index.html"));
  return win;
}

app.whenReady().then(() => {
  const win = createWindow();
  ipcMain.handle("models:list", async (_e, baseUrl: string, apiKey: string) => {
    const root = String(baseUrl || "").replace(/\/$/, "");
    const urls = root.endsWith("/v1") ? [`${root}/models`] : [`${root}/models`, `${root}/v1/models`];
    let error = "拉不到模型列表";
    for (const url of urls) {
      try {
        const res = await fetch(url, { headers: { authorization: `Bearer ${apiKey}` } });
        const text = await res.text();
        if (!res.ok) {
          error = `拉取失败：${res.status}`;
          continue;
        }
        const data = JSON.parse(text) as { data?: Array<{ id?: string }> };
        const models = (data.data ?? []).map((item) => item.id).filter((id): id is string => Boolean(id));
        return { ok: true, models };
      } catch {
        error = "拉取失败：网络不通";
      }
    }
    return { ok: false, models: [], error };
  });
  ipcMain.handle("settings:get", () => getSettings());
  ipcMain.handle("settings:save", (_event, patch) => saveSettings(patch));
  ipcMain.handle("settings:chooseDir", async () => {
    const picked = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
    if (picked.canceled || !picked.filePaths[0]) return null;
    return saveSettings({ dataDir: picked.filePaths[0] });
  });
  ipcMain.handle("bots:list", () => botsList());
  ipcMain.handle("bots:create", (_e, name: string, purpose: string) => botsCreate(name, purpose));
  ipcMain.handle("bots:update", (_e, patch) => botsUpdate(patch));
  ipcMain.handle("chat:send", (_e, botId: string, payload) => chatSend(win, botId, payload));
  ipcMain.handle("chat:stop", (_e, botId: string) => {
    stopChat(botId);
    return { ok: true };
  });
  ipcMain.handle("chat:mark", (_e, botId: string, payload) => chatMark(botId, payload ?? {}));
  ipcMain.handle("knowledge:list", (_e, botId: string) => knowledgeList(botId));
  ipcMain.handle("knowledge:save", (_e, botId: string, entry) => knowledgeSave(botId, entry));
  ipcMain.handle("knowledge:status", (_e, botId: string, id: string, status: string) =>
    knowledgeSetStatus(botId, id, status),
  );
  ipcMain.handle("knowledge:changelog", (_e, botId: string) => knowledgeChangelog(botId));
  ipcMain.handle("materials:list", (_e, botId: string) => materialsList(botId));
  ipcMain.handle("materials:import", async (_e, botId: string, filePaths: string[]) => {
    let paths = Array.isArray(filePaths) ? filePaths.filter(Boolean) : [];
    if (!paths.length) {
      const picked = await dialog.showOpenDialog({
        properties: ["openFile", "multiSelections"],
        filters: [{ name: "文本", extensions: ["txt", "md"] }],
      });
      if (picked.canceled) return materialsList(botId);
      paths = picked.filePaths;
    }
    return materialsImport(botId, paths);
  });
  ipcMain.handle("tests:list", (_e, botId: string) => testsList(botId));
  ipcMain.handle("tests:save", (_e, botId: string, cases) => testsSave(botId, cases));
  ipcMain.handle("tests:run", (_e, botId: string) => testsRun(win, botId));
  ipcMain.handle("records:list", (_e, botId: string) => recordsList(botId));
  ipcMain.handle("records:get", (_e, botId: string, id: string) => recordsGet(botId, id));
  ipcMain.handle("records:update", (_e, botId: string, id: string, patch) => recordsUpdate(botId, id, patch));
  ipcMain.handle("records:submit", (_e, botId: string, payload) => recordsSubmit(botId, payload));
  ipcMain.handle("records:export", (_e, botId: string) => recordsExportCsv(botId));
  ipcMain.handle("records:reveal", (_e, botId: string) => {
    void shell.openPath(botRoot(botId));
    return { ok: true };
  });
});

  ipcMain.handle("experience:get", () => getExperience());
  ipcMain.handle("experience:exit", () => setExperience(null));
  ipcMain.handle("pack:export", async (_e, botId?: string) => {
    const id = botId || "default";
    const dir = path.join(botRoot(id), "exports");
    fs.mkdirSync(dir, { recursive: true });
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const botFile = path.join(botRoot(id), "bot.json");
    const botName = fs.existsSync(botFile)
      ? String((JSON.parse(fs.readFileSync(botFile, "utf8")) as { name?: string }).name || id)
      : id;
    const safe = botName.replace(/[<>:"/\\|?*]/g, "-").slice(0, 40);
    const picked = await dialog.showSaveDialog({
      defaultPath: path.join(dir, `${safe}-${day}.botpack`),
      filters: [{ name: "Bot 体验包", extensions: ["botpack"] }],
    });
    if (picked.canceled || !picked.filePath) return null;
    return exportPack(botId || "default", picked.filePath);
  });
  ipcMain.handle("pack:import", async (_e, zipPath?: string) => {
    if (zipPath) {
      const done = await importPack(zipPath);
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send("experience:changed", done);
      return done;
    }
    const picked = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Bot 体验包", extensions: ["botpack", "zip"] }],
    });
    if (picked.canceled || !picked.filePaths[0]) return null;
    const done = await importPack(picked.filePaths[0]);
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send("experience:changed", done);
    return done;
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
