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

export type BotMakerApi = {
  botsList: () => Promise<Array<{ id: string; name?: string; purpose?: string }>>;
  botsCreate: (name: string, purpose: string) => Promise<{ id: string; name: string; purpose: string }>;
  settingsGet: () => Promise<Settings>;
  modelsList: (baseUrl: string, apiKey: string) => Promise<{ ok: boolean; models: string[]; error?: string }>;
  settingsSave: (patch: Partial<Settings> & { model?: ModelProfile }) => Promise<Settings>;
  chooseDir: () => Promise<Settings | null>;
  experienceGet: () => Promise<{ botId: string | null; name?: string | null }>;
  onExperience: (cb: (row: { botId: string | null; name: string | null }) => void) => () => void;
  packExport: () => Promise<{ path: string; entries: number; excluded: string[] } | null>;
  packImport: () => Promise<{ botId: string | null; name?: string | null } | null>;
  experienceExit: () => Promise<{ botId: null }>;
};
