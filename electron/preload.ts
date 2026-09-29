import { contextBridge, ipcRenderer } from "electron";

function on(channel: string, cb: (payload: unknown) => void) {
  const listener = (_event: unknown, payload: unknown) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("botmaker", {
  settingsGet: () => ipcRenderer.invoke("settings:get"),
  modelsList: (baseUrl: string, apiKey: string) => ipcRenderer.invoke("models:list", baseUrl, apiKey),
  settingsSave: (patch: unknown) => ipcRenderer.invoke("settings:save", patch),
  chooseDir: () => ipcRenderer.invoke("settings:chooseDir"),
  botsList: () => ipcRenderer.invoke("bots:list"),
  botsCreate: (name: string, purpose: string) => ipcRenderer.invoke("bots:create", name, purpose),
  botsUpdate: (patch: unknown) => ipcRenderer.invoke("bots:update", patch),
  chatSend: (botId: string, payload: unknown) => ipcRenderer.invoke("chat:send", botId, payload),
  chatStop: (botId: string) => ipcRenderer.invoke("chat:stop", botId),
  chatMark: (botId: string, payload: unknown) => ipcRenderer.invoke("chat:mark", botId, payload),
  knowledgeList: (botId: string) => ipcRenderer.invoke("knowledge:list", botId),
  knowledgeSave: (botId: string, entry: unknown) => ipcRenderer.invoke("knowledge:save", botId, entry),
  knowledgeSetStatus: (botId: string, id: string, status: string) =>
    ipcRenderer.invoke("knowledge:status", botId, id, status),
  knowledgeChangelog: (botId: string) => ipcRenderer.invoke("knowledge:changelog", botId),
  materialsList: (botId: string) => ipcRenderer.invoke("materials:list", botId),
  materialsImport: (botId: string, filePaths: string[]) => ipcRenderer.invoke("materials:import", botId, filePaths),
  testsList: (botId: string) => ipcRenderer.invoke("tests:list", botId),
  testsSave: (botId: string, cases: unknown) => ipcRenderer.invoke("tests:save", botId, cases),
  testsRun: (botId: string) => ipcRenderer.invoke("tests:run", botId),
  recordsList: (botId: string, filter?: unknown) => ipcRenderer.invoke("records:list", botId, filter),
  recordsGet: (botId: string, id: string) => ipcRenderer.invoke("records:get", botId, id),
  recordsUpdate: (botId: string, id: string, patch: unknown) => ipcRenderer.invoke("records:update", botId, id, patch),
  recordsSubmit: (botId: string, payload: unknown) => ipcRenderer.invoke("records:submit", botId, payload),
  recordsExportCsv: (botId: string) => ipcRenderer.invoke("records:export", botId),
  recordsRevealInFolder: (botId: string) => ipcRenderer.invoke("records:reveal", botId),
  botsExport: (id: string) => ipcRenderer.invoke("pack:export", id),
  botsImport: (zipPath?: string) => ipcRenderer.invoke("pack:import", zipPath),
  experienceGet: () => ipcRenderer.invoke("experience:get"),
  onExperience: (cb: (row: { botId: string | null; name: string | null }) => void) =>
    on("experience:changed", (payload) => cb(payload as { botId: string | null; name: string | null })),
  packExport: () => ipcRenderer.invoke("pack:export"),
  packImport: () => ipcRenderer.invoke("pack:import"),
  experienceExit: () => ipcRenderer.invoke("experience:exit"),
  onChatDelta: (cb: (chunk: string) => void) => on("chat:delta", (payload) => cb(String(payload))),
  onTestsProgress: (cb: (p: { done: number; total: number; failed: string[] }) => void) =>
    on("tests:progress", (payload) => cb(payload as { done: number; total: number; failed: string[] })),
});
