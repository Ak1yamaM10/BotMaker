import { useEffect, useMemo, useState } from "react";
import { api, has } from "../api";
import type { Entry } from "../api";
import "./pages.css";

/** 时间显示：changelog 里是 ISO 串，截到分钟即可 */
const fmt = (v: unknown) => (v ? String(v).replace("T", " ").slice(0, 19) : "—");

const EMPTY: Entry = {
  id: "",
  title: "",
  when: "",
  conditions: { model: "", version: "", scene: "" },
  answer: "",
  pass: "",
  expires: "",
  source: "reference",
  ref: "",
  status: "draft",
};

/**
 * ② 知识库（投喂）
 * 两张表：知识条目（结构化，唯一真相源）与素材文档；条目支持新增/编辑/停用（不删除）/复制。
 * ref（出处）为 2026-09-29 新增的可选字段，与 source 并列，不填合法。
 */
export function Knowledge({ botId }: { botId: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [kw, setKw] = useState("");
  const [filter, setFilter] = useState<"all" | Entry["status"]>("all");
  const [editing, setEditing] = useState<Entry | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  /** 停用前的二次确认（文案取自产品奶蛙《文案与交互清单》§3） */
  const [confirmOff, setConfirmOff] = useState<Entry | null>(null);
  /** 方案 §2②：每次改动写一行 changelog——核对与追责时不用翻聊天记录 */
  const [changelog, setChangelog] = useState<any[]>([]);

  async function reload() {
    setLoading(true);
    setEntries(await api.knowledgeList(botId));
    setMaterials(await api.materialsList(botId));
    setChangelog(await api.knowledgeChangelog(botId));
    setLoading(false);
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId]);

  const shown = useMemo(
    () =>
      entries.filter((e) => {
        if (filter !== "all" && e.status !== filter) return false;
        if (!kw.trim()) return true;
        const hay = [e.title, e.when, e.answer, e.ref ?? ""].join(" ").toLowerCase();
        return hay.includes(kw.trim().toLowerCase());
      }),
    [entries, filter, kw],
  );

  async function save() {
    if (!editing) return;
    if (!editing.title.trim()) {
      setNote("标题不能为空");
      return;
    }
    if (!has("knowledgeSave")) {
      setNote("主进程还没实现 knowledgeSave");
      return;
    }
    const entry = { ...editing, id: editing.id || `K-${Date.now()}` };
    await api.knowledgeSave(botId, entry);
    setNote(`已保存：${entry.title}`);
    setEditing(null);
    await reload();
  }

  async function setStatus(e: Entry, status: Entry["status"]) {
    if (!has("knowledgeSetStatus")) {
      setNote("主进程还没实现 knowledgeSetStatus");
      return;
    }
    await api.knowledgeSetStatus(botId, e.id, status);
    await reload();
  }

  return (
    <div className="p-grid2">
      <div>
        <div className="p-block">
          <div className="p-row between">
            <h2 style={{ margin: 0 }}>知识条目（{entries.length}）</h2>
            <div className="p-row">
              <select className="p-input" value={filter} onChange={(e) => setFilter(e.target.value as any)}>
                <option value="all">全部状态</option>
                <option value="active">启用</option>
                <option value="draft">草稿</option>
                <option value="off">停用</option>
              </select>
              <input
                className="p-input"
                style={{ width: 200 }}
                placeholder="搜索标题 / 现象 / 出处"
                value={kw}
                onChange={(e) => setKw(e.target.value)}
              />
              <button className="primary" onClick={() => setEditing({ ...EMPTY })}>新增条目</button>
            </div>
          </div>

          {loading ? (
            <div className="p-empty">读取中…</div>
          ) : shown.length === 0 ? (
            <div className="p-empty">知识条目是 Bot 唯一的依据。先建 3~5 条你最确定的，比一次倒 100 条更有效。</div>
          ) : (
            <table className="p-table">
              <thead>
                <tr>
                  <th style={{ width: 180 }}>标题</th>
                  <th>触发现象</th>
                  <th style={{ width: 150 }}>适用条件</th>
                  <th style={{ width: 90 }}>状态</th>
                  <th style={{ width: 120 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e.id} className={editing?.id === e.id ? "on" : ""}>
                    <td>{e.title}</td>
                    <td>{e.when}</td>
                    <td className="p-sub">
                      {[e.conditions.model, e.conditions.version, e.conditions.scene].filter(Boolean).join(" / ") || "—"}
                    </td>
                    <td>
                      <span className={`p-tag ${e.status === "active" ? "active" : e.status === "draft" ? "draft" : ""}`}>
                        {e.status === "active" ? "启用" : e.status === "draft" ? "草稿" : "停用"}
                      </span>
                    </td>
                    <td>
                      <div className="p-row">
                        <button className="ghost" onClick={() => setEditing({ ...e })}>编辑</button>
                        <button
                          className="ghost"
                          onClick={() => (e.status === "active" ? setConfirmOff(e) : setStatus(e, "active"))}
                        >
                          {e.status === "active" ? "停用" : "启用"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="p-sub p-mt">停用不删除：作废条目保留在文件里，便于追溯「当时为什么这么答」。</p>
        </div>

        <div className="p-block">
          <h2>最近改动（changelog）</h2>
          {changelog.length === 0 ? (
            <div className="p-empty">还没有改动记录。保存一条条目后，这里会出现一行。</div>
          ) : (
            <table className="p-table">
              <thead>
                <tr><th style={{ width: 150 }}>时间</th><th style={{ width: 110 }}>动作</th><th>条目</th><th>说明</th></tr>
              </thead>
              <tbody>
                {changelog.slice(-10).reverse().map((c, i) => (
                  <tr key={i}>
                    <td className="p-sub">{fmt(c?.ts ?? c?.at ?? c?.time ?? c?.updatedAt)}</td>
                    <td className="p-sub">{String(c?.action ?? c?.op ?? "—")}</td>
                    <td>{String(c?.what ?? c?.title ?? c?.id ?? "—")}</td>
                    <td className="p-sub">{String(c?.why ?? c?.reason ?? c?.note ?? "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="p-sub p-mt">只显示最近 10 条；完整记录在 `knowledge/changelog.jsonl`。</p>
        </div>

        <div className="p-block">
          <h2>素材文档（{materials.length}）</h2>
          {materials.length === 0 ? (
            <div className="p-empty">还没有素材。产品说明、回复案例、FAQ 放这里，检索按段取用、不按字数硬切。</div>
          ) : (
            <table className="p-table">
              <thead>
                <tr><th>文件</th><th>你写的说明</th><th style={{ width: 90 }}>操作</th></tr>
              </thead>
              <tbody>
                {materials.map((m, i) => (
                  <tr key={i}>
                    <td>{m.name ?? m.path ?? "（未命名）"}</td>
                    <td className="p-sub">{m.note ?? "—"}</td>
                    <td><button className="ghost" disabled>打开</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="p-row p-mt">
            <button
              className="ghost"
              disabled={!has("materialsImport")}
              onClick={() => {
                void api.materialsImport(botId, []).then(() => reload());
              }}
            >
              导入素材文件
            </button>
            <span className="p-sub">
              {has("materialsImport") ? "支持 txt / md（PDF、docx 后加）" : "主进程未实现 materialsImport"}
            </span>
          </div>
        </div>
      </div>

      <div className="p-block">
        <h2>{editing ? (editing.id ? "编辑条目" : "新增条目") : "条目编辑器"}</h2>
        {!editing ? (
          <p className="p-sub">左侧选一条点「编辑」，或点「新增条目」。字段与方案 §2② 一致。</p>
        ) : (
          <>
            <label>标题</label>
            <input className="p-input" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            <label>触发现象 / 场景</label>
            <textarea className="p-input" value={editing.when} onChange={(e) => setEditing({ ...editing, when: e.target.value })} />
            <label>适用条件（三个都可留空）</label>
            <input className="p-input" placeholder="机型" value={editing.conditions.model ?? ""} onChange={(e) => setEditing({ ...editing, conditions: { ...editing.conditions, model: e.target.value } })} />
            <input className="p-input p-mt" placeholder="版本" value={editing.conditions.version ?? ""} onChange={(e) => setEditing({ ...editing, conditions: { ...editing.conditions, version: e.target.value } })} />
            <input className="p-input p-mt" placeholder="场景" value={editing.conditions.scene ?? ""} onChange={(e) => setEditing({ ...editing, conditions: { ...editing.conditions, scene: e.target.value } })} />
            <label>答案（步骤或话术）</label>
            <textarea className="p-input" value={editing.answer} onChange={(e) => setEditing({ ...editing, answer: e.target.value })} />
            <label>怎么算答对</label>
            <input className="p-input" value={editing.pass} onChange={(e) => setEditing({ ...editing, pass: e.target.value })} />
            <label>何时作废</label>
            <input className="p-input" value={editing.expires} onChange={(e) => setEditing({ ...editing, expires: e.target.value })} />
            <label>来源</label>
            <select className="p-input" value={editing.source} onChange={(e) => setEditing({ ...editing, source: e.target.value as Entry["source"] })}>
              <option value="official">官方</option>
              <option value="reference">参考</option>
            </select>
            <label>出处 ref（可选：哪份文档 / 哪条反馈 / 哪个版本公告）</label>
            <input className="p-input" value={editing.ref ?? ""} onChange={(e) => setEditing({ ...editing, ref: e.target.value })} />
            <label>状态</label>
            <select className="p-input" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as Entry["status"] })}>
              <option value="draft">草稿</option>
              <option value="active">启用</option>
              <option value="off">停用</option>
            </select>
            <div className="p-row p-mt">
              <button className="primary" onClick={save}>保存</button>
              <button className="ghost" onClick={() => setEditing(null)}>取消</button>
            </div>
            {note ? <p className="p-ok p-mt">{note}</p> : null}
          </>
        )}
      </div>

      {confirmOff ? (
        <div className="p-modal">
          <div className="p-modal-box">
            <h2 style={{ marginTop: 0, fontSize: 15 }}>停用后测试页不再命中这条</h2>
            <p className="p-sub">历史记录和 changelog 保留。</p>
            <div className="p-row p-mt">
              <button className="ghost" onClick={() => setConfirmOff(null)}>取消</button>
              <button
                className="ghost p-danger"
                onClick={async () => {
                  const target = confirmOff;
                  setConfirmOff(null);
                  if (target) await setStatus(target, "off");
                }}
              >
                停用
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
