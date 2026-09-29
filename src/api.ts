/**
 * 渲染层对主进程接口的唯一入口（对应《BotMaker_技术方案.md》§5 清单）。
 *
 * 为什么放在这里：并行开发时，主进程按 §5 逐步补齐方法，页面先用这一层的类型与
 * 兜底逻辑写死名字，避免两边各写一套。方法名以 §5 为准，主进程实现完即可直接对上。
 */
export type Mode = "workbench" | "test";

/** 知识条目（§4 schema；ref 为 2026-09-29 新增的可选出处字段） */
export type Entry = {
  id: string;
  title: string;
  when: string;
  conditions: { model?: string; version?: string; scene?: string };
  answer: string;
  pass: string;
  expires: string;
  source: "official" | "reference";
  ref?: string;
  status: "draft" | "active" | "off";
  updatedAt?: string;
};

/** 未解决记录（§4 schema） */
export type FeedbackRecord = {
  id: string;
  createdAt: string;
  env?: Record<string, string>;
  question?: string;
  transcript?: { role: "user" | "assistant"; text: string }[];
  tried?: string[];
  hit?: string[];
  expectation?: string;
  attachments?: string[];
  status: "pending" | "replied" | "closed";
  note?: string;
};

export type TestCase = { id: string; question: string; expectHit?: string | null };

/** 会话行（§4：命中条目 + 模型配置名必须落盘） */
export type ChatLine = {
  ts: string;
  mode: Mode;
  text: string;
  reply: string;
  hitIds: string[];
  modelProfile: string;
  ms: number;
  tokens: number;
};

type Raw = Record<string, any>;

/**
 * 每次都从 window.botmaker 现取，而不是在模块加载时抓一次快照——
 * 这样即使 preload 比页面脚本晚挂上，页面也不会永远以为"接口不存在"。
 */
const raw: Raw = new Proxy({} as Raw, {
  get: (_t, prop: string) => {
    const bridge = (typeof window !== "undefined" ? (window as any).botmaker : undefined) ?? {};
    const value = (bridge as any)[prop];
    return typeof value === "function" ? value.bind(bridge) : value;
  },
});

/** 主进程是否已实现某个方法（未实现时页面给友好提示，而不是白屏） */
export function has(name: string): boolean {
  return typeof raw[name] === "function";
}

export function missing(names: string[]): string[] {
  return names.filter((n) => !has(n));
}

export const api = {
  // —— 设置 / 模型 ——
  settingsGet: (): Promise<any> => raw.settingsGet?.(),
  settingsSave: (patch: Raw): Promise<any> => raw.settingsSave?.(patch),
  chooseDir: (): Promise<any> => raw.chooseDir?.(),

  // —— Bot ——
  botsList: (): Promise<any[]> => raw.botsList?.() ?? Promise.resolve([]),
  botsCreate: (name: string, purpose: string): Promise<any> => raw.botsCreate?.(name, purpose),
  botsUpdate: (patch: Raw): Promise<any> => raw.botsUpdate?.(patch),
  /** 导出体验包（§5、§8）；返回包文件路径 */
  botsExport: (id: string, opts?: { includeMaterials?: boolean }): Promise<{ path: string }> =>
    raw.botsExport?.(id, opts),
  /** 导入体验包（§5、§8）：新建一份 Bot，不覆盖现有 */
  botsImport: (zipPath: string): Promise<any> => raw.botsImport?.(zipPath),

  // —— 对话（试跑 / 测试共用一个入口，用 mode 区分）——
  chatSend: (botId: string, payload: { mode: Mode; text: string; env?: Record<string, string>; includeKnowledge?: boolean }) =>
    raw.chatSend?.(botId, payload),
  chatStop: (botId: string) => raw.chatStop?.(botId),
  chatMark: (botId: string, payload: { verdict?: string; hitIds?: string[]; text?: string }) =>
    raw.chatMark?.(botId, payload),

  // —— 知识库 ——
  knowledgeList: (botId: string): Promise<Entry[]> => raw.knowledgeList?.(botId) ?? Promise.resolve([]),
  knowledgeSave: (botId: string, entry: Entry): Promise<any> => raw.knowledgeSave?.(botId, entry),
  knowledgeSetStatus: (botId: string, id: string, status: Entry["status"]) =>
    raw.knowledgeSetStatus?.(botId, id, status),
  knowledgeChangelog: (botId: string): Promise<any[]> => raw.knowledgeChangelog?.(botId) ?? Promise.resolve([]),

  // —— 素材 ——
  materialsList: (botId: string): Promise<any[]> => raw.materialsList?.(botId) ?? Promise.resolve([]),
  materialsImport: (botId: string, filePaths: string[]) => raw.materialsImport?.(botId, filePaths),

  // —— 测试集 ——
  testsList: (botId: string): Promise<TestCase[]> => raw.testsList?.(botId) ?? Promise.resolve([]),
  testsSave: (botId: string, cases: TestCase[]) => raw.testsSave?.(botId, cases),
  testsRun: (botId: string) => raw.testsRun?.(botId),

  // —— 记录 ——
  recordsList: (botId: string, filter?: Raw): Promise<FeedbackRecord[]> =>
    raw.recordsList?.(botId, filter) ?? Promise.resolve([]),
  recordsGet: (botId: string, id: string): Promise<FeedbackRecord> => raw.recordsGet?.(botId, id),
  recordsUpdate: (botId: string, id: string, patch: Partial<FeedbackRecord>) =>
    raw.recordsUpdate?.(botId, id, patch),
  /**
   * 「没解决」表单提交 → 在本机生成一条记录。
   * 注意：方案 §5 清单里没有这一条，是实现「测试页收单」必需的第 13 个方法，
   * 已在群里向主进程（留学生）提交补充申请，方法名以此为准。
   */
  recordsSubmit: (botId: string, payload: Raw): Promise<{ id: string }> => raw.recordsSubmit?.(botId, payload),
  recordsExportCsv: (botId: string) => raw.recordsExportCsv?.(botId),
  recordsRevealInFolder: (botId: string) => raw.recordsRevealInFolder?.(botId),

  // —— 事件流 ——
  /** 订阅流式回复；返回取消订阅函数 */
  onChatDelta(cb: (chunk: string) => void): () => void {
    if (!has("onChatDelta")) return () => {};
    return raw.onChatDelta(cb) ?? (() => {});
  },
  /** 订阅跑批进度 */
  onTestsProgress(cb: (p: { done: number; total: number; failed: string[] }) => void): () => void {
    if (!has("onTestsProgress")) return () => {};
    return raw.onTestsProgress(cb) ?? (() => {});
  },
};

export const PAGE_API_DEPS = [
  "settingsGet",
  "chatSend",
  "knowledgeList",
  "knowledgeSave",
  "materialsImport",
  "testsRun",
  "recordsList",
];
