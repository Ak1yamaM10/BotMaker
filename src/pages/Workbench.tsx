import { useEffect, useMemo, useRef, useState } from "react";
import { api, has } from "../api";
import type { Entry } from "../api";
import "./pages.css";
import { Markdown } from "./md";

type Msg = { role: "user" | "assistant"; text: string };

/**
 * ① 对话调优
 *
 * 版式（按 Mio 的意见重排）：
 *   - **对话区是页面主体**，占满主区域；
 *   - **素材**收进按钮弹窗：平时不占地方，要投喂时再打开；
 *   - **结论**是右侧次要区，专管"把最新一条回复转成条目／测试问题"——这就是它的用途，
 *     不是装饰：两个按钮就放在这里，最新回复也在里面渲染成 Markdown 供确认。
 */
export function Workbench({ botId }: { botId: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pasted, setPasted] = useState("");
  /** 方案 §2①：默认勾上——让调优助手能看见现有知识库，才好指出重复与冲突 */
  const [withKb, setWithKb] = useState(true);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<Entry | null>(null);
  /** 「存为测试问题」的界面内表单：Electron 不支持 window.prompt，必须自己出输入框 */
  const [caseDraft, setCaseDraft] = useState<string | null>(null);
  /** 素材弹窗（Mio：素材不该常驻占屏幕） */
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const off = api.onChatDelta((chunk) => {
      setMsgs((m) => {
        const next = [...m];
        const last = next[next.length - 1];
        if (last && last.role === "assistant") last.text += chunk;
        else next.push({ role: "assistant", text: chunk });
        return next;
      });
    });
    return off;
  }, []);

  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight });
  }, [msgs]);

  /** 切换 Bot 时清空本轮对话与草稿：否则会把 A 的对话显示在 B 的名字下面 */
  useEffect(() => {
    setMsgs([]);
    setInput("");
    setPasted("");
    setEditing(null);
    setCaseDraft(null);
    setNote("");
    setMaterialsOpen(false);
  }, [botId]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const res = await api.chatSend(botId, {
        mode: "workbench",
        text: pasted ? `${text}\n\n【素材】\n${pasted}` : text,
        includeKnowledge: withKb,
      });
      // 主进程若走"一次性返回"而不是流式，这里兜底补上；已由 onChatDelta 填过就不重复
      if (res?.reply) {
        setMsgs((m) => {
          const last = m[m.length - 1];
          if (last && last.role === "assistant" && last.text) return m;
          return [...m, { role: "assistant", text: String(res.reply) }];
        });
      }
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: `调用失败：${String(e)}` }]);
    } finally {
      setBusy(false);
    }
  }

  /**
   * 调优助手的产出常常是一张 markdown 表格（标题/触发场景/条件/答案/答对/作废）。
   * 先把表格第一行数据读出来，拼进条目草稿——不然用户点「存为知识条目」只会得到空表单，
   * 还得自己从回复里抄一遍。
   */
  function fromTable(
    reply: string,
  ): { title?: string; when?: string; answer?: string; pass?: string; expires?: string; scene?: string } | null {
    const rows = reply
      .split("\n")
      .filter((l) => l.trim().startsWith("|"))
      .map((l) => l.split("|").map((c) => c.trim()).filter((c) => c !== ""));
    if (rows.length < 3) return null;
    const head = rows[0];
    const data = rows[2];
    const cell = (...names: string[]) => {
      const i = head.findIndex((h) => names.some((n) => h.includes(n)));
      return i >= 0 ? data[i] ?? "" : "";
    };
    const picked = {
      title: cell("标题") || cell("现象"),
      when: cell("触发", "场景"),
      answer: cell("答案", "要点", "步骤"),
      pass: cell("答对", "验证"),
      expires: cell("作废"),
      scene: cell("条件"),
    };
    return Object.values(picked).some((v) => v) ? picked : null;
  }

  /** 把助手回复粗解析成条目草稿，预填进编辑器；解析不出来就留空，人来补。 */
  function draftFrom(reply: string): Entry {
    const pick = (k: string) => {
      const m = reply.match(new RegExp(`${k}\\s*[:：]\\s*(.+)`));
      return m ? m[1].trim() : "";
    };
    const t = fromTable(reply) ?? {};
    return {
      id: "",
      title: t.title || pick("标题") || pick("触发现象") || "（待填写）",
      when: t.when || pick("触发场景") || pick("现象") || "",
      conditions: { model: "", version: "", scene: t.scene || "" },
      answer: t.answer || pick("答案") || pick("步骤") || "",
      pass: t.pass || pick("怎么算答对") || "",
      expires: t.expires || pick("何时作废") || "",
      source: "reference",
      ref: "来自对话调优（未核对原文）",
      status: "draft",
    };
  }

  async function saveEntry() {
    if (!editing) return;
    if (!has("knowledgeSave")) {
      setNote("主进程还没实现 knowledgeSave，先记着");
      return;
    }
    await api.knowledgeSave(botId, { ...editing, id: editing.id || `K-${Date.now()}` });
    setNote(`已存为知识条目：${editing.title}`);
    setEditing(null);
  }

  async function saveCase(text: string) {
    if (!has("testsList") || !has("testsSave")) {
      setNote("主进程还没实现 testsSave，先记着");
      return;
    }
    const cases = await api.testsList(botId);
    await api.testsSave(botId, [...cases, { id: `T-${Date.now()}`, question: text, expectHit: null }]);
    setNote("已加入测试集");
  }

  const lastReply = useMemo(() => [...msgs].reverse().find((m) => m.role === "assistant")?.text ?? "", [msgs]);
  const materialChars = pasted.trim().length;

  return (
    <div className="p-grid2">
      {/* ===== 主体：对话 ===== */}
      <div className="p-block p-main">
        <div className="p-row between">
          <h2 style={{ margin: 0 }}>对话调优</h2>
          <div className="p-row">
            <button className="ghost" onClick={() => setMaterialsOpen(true)}>
              素材{materialChars ? `（${materialChars} 字）` : ""}
            </button>
            <button className="ghost" onClick={() => setMsgs([])} disabled={msgs.length === 0}>
              清空对话
            </button>
          </div>
        </div>
        <p className="p-sub">
          把问题或资料丢给它，它帮你起草知识条目、指出冲突——它不会替 Bot 回答用户。
          {withKb ? "（当前会一并看到你启用的知识库）" : "（当前不看知识库）"}
        </p>

        <div className="p-stream p-stream-tall" ref={streamRef}>
          {msgs.length === 0 ? (
            <div className="p-empty">
              把产品资料拖进来，或直接把问题粘在这里。调优助手帮你起草知识条目、指出冲突——它不会替 Bot 回答用户。
            </div>
          ) : (
            msgs.map((m, i) => (
              <div key={i} className={`p-bubble ${m.role === "user" ? "me" : ""}`}>
                <Markdown text={m.text} />
                {m.role === "assistant" && i === msgs.length - 1 && !busy ? (
                  <div className="p-actions">
                    <button className="primary" onClick={() => setEditing(draftFrom(m.text))}>
                      存为知识条目
                    </button>
                    <button
                      className="ghost"
                      onClick={() => setCaseDraft([...msgs].reverse().find((x) => x.role === "user")?.text ?? "")}
                    >
                      存为测试问题
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>

        <div className="p-row p-mt">
          <input
            className="p-input"
            style={{ flex: 1, width: "auto", minWidth: 200 }}
            placeholder="问调优助手…（Enter 发送）"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button
            className="primary"
            onClick={() => {
              if (!busy) {
                void send();
                return;
              }
              void api.chatStop(botId);
              setBusy(false);
            }}
          >
            {busy ? "停止" : "发送"}
          </button>
        </div>
        {note ? <p className="p-ok p-mt">{note}</p> : null}
      </div>

      {/* ===== 次要区：结论 ===== */}
      <div className="p-block">
        <h2>结论</h2>
        <p className="p-sub">把最新一条回复转成条目或测试问题，就在这里，不用往回翻。</p>

        {editing ? (
          <>
            <label>标题</label>
            <input className="p-input" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            <label>触发现象</label>
            <textarea className="p-input" value={editing.when} onChange={(e) => setEditing({ ...editing, when: e.target.value })} />
            <label>适用条件（机型 / 版本 / 场景）</label>
            <input
              className="p-input"
              placeholder="机型"
              value={editing.conditions.model ?? ""}
              onChange={(e) => setEditing({ ...editing, conditions: { ...editing.conditions, model: e.target.value } })}
            />
            <input
              className="p-input p-mt"
              placeholder="版本"
              value={editing.conditions.version ?? ""}
              onChange={(e) => setEditing({ ...editing, conditions: { ...editing.conditions, version: e.target.value } })}
            />
            <input
              className="p-input p-mt"
              placeholder="场景"
              value={editing.conditions.scene ?? ""}
              onChange={(e) => setEditing({ ...editing, conditions: { ...editing.conditions, scene: e.target.value } })}
            />
            <label>答案（步骤或话术）</label>
            <textarea className="p-input" value={editing.answer} onChange={(e) => setEditing({ ...editing, answer: e.target.value })} />
            <label>怎么算答对</label>
            <input className="p-input" value={editing.pass} onChange={(e) => setEditing({ ...editing, pass: e.target.value })} />
            <label>何时作废</label>
            <input className="p-input" value={editing.expires} onChange={(e) => setEditing({ ...editing, expires: e.target.value })} />
            <label>出处 ref（可选）</label>
            <input className="p-input" value={editing.ref ?? ""} onChange={(e) => setEditing({ ...editing, ref: e.target.value })} />
            <div className="p-row p-mt">
              <button className="primary" onClick={saveEntry}>
                入库
              </button>
              <button className="ghost" onClick={() => setEditing(null)}>
                取消
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="p-row">
              <button className="primary" disabled={!lastReply} onClick={() => setEditing(draftFrom(lastReply))}>
                存为知识条目
              </button>
              <button
                className="ghost"
                disabled={!lastReply}
                onClick={() => setCaseDraft([...msgs].reverse().find((x) => x.role === "user")?.text ?? "")}
              >
                存为测试问题
              </button>
            </div>
            {caseDraft !== null ? (
              <div className="p-row p-mt">
                <input
                  className="p-input"
                  style={{ flex: 1, width: "auto", minWidth: 120 }}
                  placeholder="测试问题（用户会怎么问）"
                  value={caseDraft}
                  onChange={(e) => setCaseDraft(e.target.value)}
                />
                <button
                  className="primary"
                  onClick={async () => {
                    const t = (caseDraft || "").trim();
                    if (!t) return;
                    await saveCase(t);
                    setCaseDraft(null);
                  }}
                >
                  加入测试集
                </button>
                <button className="ghost" onClick={() => setCaseDraft(null)}>
                  取消
                </button>
              </div>
            ) : null}
            <label>最新一条回复</label>
            {lastReply ? (
              <div className="p-drawer">
                <Markdown text={lastReply} />
              </div>
            ) : (
              <p className="p-sub">还没有助手回复。先在上面问一句。</p>
            )}
          </>
        )}
      </div>

      {/* ===== 素材弹窗 ===== */}
      {materialsOpen ? (
        <div className="p-modal">
          <div className="p-modal-box p-modal-wide">
            <h2 style={{ marginTop: 0, fontSize: 15 }}>素材</h2>
            <p className="p-sub">产品说明、回复案例、FAQ 贴在这里，随下一条消息一起给调优助手看；也可以直接导入文件。</p>
            <label className="p-row" style={{ gap: 6 }}>
              <input
                type="checkbox"
                checked={withKb}
                onChange={(e) => setWithKb(e.target.checked)}
                style={{ width: 14, height: 14, maxWidth: 14 }}
              />
              <span>把当前知识库一并给它看</span>
            </label>
            <p className="p-sub" style={{ marginTop: 2 }}>
              勾上后它能发现条目之间的重复和冲突。
            </p>
            <textarea
              className="p-input"
              style={{ minHeight: 180 }}
              placeholder="在这里粘贴资料…"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
            />
            <div className="p-row p-mt">
              <button className="ghost" disabled={!has("materialsImport")} onClick={() => api.materialsImport(botId, [])}>
                导入素材文件
              </button>
              <button className="ghost" onClick={() => setPasted("")} disabled={!pasted}>
                清空
              </button>
              <button className="primary" onClick={() => setMaterialsOpen(false)}>
                完成
              </button>
            </div>
            <p className="p-sub p-mt">已粘贴 {materialChars} 字；支持 txt / md 文件（PDF、docx 后加）。</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
