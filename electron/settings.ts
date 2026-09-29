import fs from "fs";
import path from "path";
import { getDataDir, setDataDir } from "./paths";

export type ModelProfile = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
};

export type Settings = {
  dataDir: string;
  models: ModelProfile[];
  activeModelId: string;
};

function settingsFile(dataDir: string) {
  return path.join(dataDir, "settings.json");
}

function blank(dataDir: string): Settings {
  return {
    dataDir,
    models: [
      {
        id: "default",
        name: "默认",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "",
        model: "gpt-4o-mini",
        temperature: 0.2,
      },
    ],
    activeModelId: "default",
  };
}

export function getSettings(): Settings {
  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  const file = settingsFile(dataDir);
  if (!fs.existsSync(file)) {
    const init = blank(dataDir);
    fs.writeFileSync(file, JSON.stringify(init, null, 2));
    return init;
  }
  const saved = JSON.parse(fs.readFileSync(file, "utf8")) as Settings;
  saved.dataDir = dataDir;
  return saved;
}

export function saveSettings(patch: Partial<Settings> & { model?: ModelProfile }): Settings {
  const current = getSettings();
  const dataDir = setDataDir(patch.dataDir || current.dataDir);
  const models =
    patch.models ??
    (patch.model ? [patch.model, ...current.models.filter((m) => m.id !== patch.model!.id)] : current.models);
  const next: Settings = {
    dataDir,
    models,
    activeModelId: patch.activeModelId || patch.model?.id || current.activeModelId,
  };
  fs.writeFileSync(settingsFile(dataDir), JSON.stringify(next, null, 2));
  return next;
}
