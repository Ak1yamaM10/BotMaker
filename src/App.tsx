import { useEffect, useState } from "react";
import type { ModelProfile, Settings } from "./types";
import { Knowledge } from "./pages/Knowledge";
import { Records } from "./pages/Records";
import { Test } from "./pages/Test";
import { ExperienceBanner } from "./pages/ExperienceBanner";
import { ExportPanel } from "./pages/ExportPanel";
import { Workbench } from "./pages/Workbench";
import "./pages/pages.css";

const pages = ["对话调优", "知识库", "测试", "记录", "设置"] as const;

const emptyModel = (): ModelProfile => ({
  id: `m-${Date.now()}`,
  name: "新配置",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  temperature: 0.2,
});

export function App() {
  const [page, setPage] = useState<(typeof pages)[number]>("设置");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<ModelProfile>(emptyModel());
  const [note, setNote] = useState("");
  const [experienceId, setExperienceId] = useState<string | null>(null);
  const [experienceName, setExperienceName] = useState<string | null>(null);
  const [workBotId, setWorkBotId] = useState("default");
  const [bots, setBots] = useState<Array<{ id: string; name?: string }>>([]);
  const [modelOptions, setModelOptions] = useState<string[]>([]);

  useEffect(() => {
    window.botmaker.settingsGet().then((s) => {
      setSettings(s);
      const active = s.models.find((m) => m.id === s.activeModelId) ?? s.models[0];
      if (active) setDraft(active);
    });
    void window.botmaker.botsList().then((rows) => setBots(rows ?? []));
    void window.botmaker.experienceGet().then((row) => {
      setExperienceId(row.botId);
      setExperienceName(row.name ?? null);
      if (row.botId) setPage("测试");
    });
    return window.botmaker.onExperience((row) => {
      setExperienceId(row.botId);
      setExperienceName(row.name);
      if (row.botId) setPage("测试");
    });
  }, []);

  async function save(models: ModelProfile[], activeId: string) {
    const next = await window.botmaker.settingsSave({
      models,
      activeModelId: activeId,
    });
    setSettings(next);
    setNote("已保存到数据目录。Key 只在本机。");
  }

  async function pickDir() {
    const next = await window.botmaker.chooseDir();
    if (!next) return;
    setSettings(next);
    setNote("已换目录。原来的数据还在旧文件夹里，不会自动搬走。");
  }

  const models = settings?.models ?? [];
  const activeName = models.find((m) => m.id === settings?.activeModelId)?.model ?? "未配置";
  const botId = experienceId ?? workBotId;
  const visible = experienceId ? (["测试", "设置"] as const) : pages;

  return (
    <div className="app">
      <header className="top">
        <span>BotMaker</span>
        {experienceId ? null : (
          <>
            <select value={workBotId} onChange={(e) => setWorkBotId(e.target.value)}>
              {bots.map((b) => (
                <option key={b.id} value={b.id}>{b.name || b.id}</option>
              ))}
            </select>
            <button
              onClick={() => {
                void window.botmaker.botsCreate(`Bot ${bots.length + 1}`, "客服").then(async (created) => {
                  setBots(await window.botmaker.botsList());
                  if (created?.id) setWorkBotId(created.id);
                });
              }}
            >
              新建
            </button>
          </>
        )}
      </header>
      <div className="body">
        <nav className="nav">
          {visible.map((name) => (
            <button key={name} className={page === name ? "on" : ""} onClick={() => setPage(name)}>
              {name}
            </button>
          ))}
        </nav>
        <main className="page">
          {experienceId ? <ExperienceBanner botName={experienceName || "Bot"} /> : null}
          {page === "对话调优" ? <Workbench botId={botId} /> : null}
          {page === "知识库" ? <Knowledge botId={botId} /> : null}
          {page === "测试" ? <Test botId={botId} experience={Boolean(experienceId)} /> : null}
          {page === "记录" ? <Records botId={botId} /> : null}
          {page === "设置" ? (
            <>
              <h1>设置</h1>
              {experienceId ? null : <ExportPanel botId={botId} botName={bots.find((b) => b.id === botId)?.name || "Bot"} />}
              <div className="row">
                {experienceId ? null : (
                <button
                  className="ghost"
                  onClick={() => {
                    void window.botmaker.packImport().then((row) => {
                      if (!row?.botId) return;
                      setExperienceId(row.botId);
                      setExperienceName(row.name ?? null);
                      setPage("测试");
                      setNote("已导入。现在只剩测试页和设置。");
                    });
                  }}
                >
                  导入体验包
                </button>
                )}
                {experienceId ? (
                  <button
                    className="ghost"
                    onClick={() => {
                      void window.botmaker.experienceExit().then(() => {
                        setExperienceId(null);
                        setPage("设置");
                      });
                    }}
                  >
                    退出体验
                  </button>
                ) : null}
              </div>
              <p className="hint">只存本机，导出包不会带走。</p>
              <label>数据目录</label>
              <input value={settings?.dataDir ?? ""} readOnly />
              <label>已有配置</label>
              <select
                value={draft.id}
                onChange={(e) => {
                  const found = models.find((m) => m.id === e.target.value);
                  if (found) setDraft(found);
                }}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.model}
                  </option>
                ))}
              </select>
              <label>名称</label>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <label>接口地址（到 /v1，不含 /chat/completions）</label>
              <input value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} />
              <label>API Key</label>
              <input
                type="password"
                value={draft.apiKey}
                onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
              />
              <label>模型</label>
              <div className="row" style={{ marginTop: 0 }}>
                <select
                  value={draft.model}
                  onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                >
                  {[draft.model, ...modelOptions.filter((id) => id !== draft.model)].filter(Boolean).map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
                <button
                  className="ghost"
                  onClick={() => {
                    if (!draft.baseUrl || !draft.apiKey) {
                      setNote("先填接口地址和 Key，再拉取模型。");
                      return;
                    }
                    setNote("正在拉取模型…");
                    void window.botmaker.modelsList(draft.baseUrl, draft.apiKey).then((result) => {
                      if (!result.ok || result.models.length === 0) {
                        setNote(result.error || "没拉到模型");
                        return;
                      }
                      setModelOptions(result.models);
                      if (!result.models.includes(draft.model)) setDraft({ ...draft, model: result.models[0] });
                      setNote(`拉到 ${result.models.length} 个模型`);
                    });
                  }}
                >
                  拉取列表
                </button>
              </div>
              <div className="row">
                <button className="ghost" onClick={pickDir}>
                  选择文件夹
                </button>
                <button
                  className="ghost"
                  onClick={() => {
                    const created = emptyModel();
                    setDraft(created);
                    setNote("这是一套新配置，点保存才会写入。");
                  }}
                >
                  新增一套
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    const exists = models.some((m) => m.id === draft.id);
                    const nextModels = exists ? models.map((m) => (m.id === draft.id ? draft : m)) : [...models, draft];
                    void save(nextModels, draft.id);
                  }}
                >
                  保存并使用这套
                </button>
                {note ? <span className="ok">{note}</span> : null}
              </div>
            </>
          ) : null}
        </main>
      </div>
      <footer className="status">
        <span>模型 {activeName}</span>
        <span>数据目录 {settings?.dataDir ?? "…"}</span>
      </footer>
    </div>
  );
}
