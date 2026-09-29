import { useEffect, useRef, useState } from "react";
import { api, has } from "../api";
import "./pages.css";
import { Markdown } from "./md";

type Msg = { role: "user" | "assistant"; text: string; hit?: string[]; ms?: number; tokens?: number };

/**
 * ③ 测试（把 Bot 当产品用）
 * 用户视角的对话页 + 可折叠抽屉（命中/耗时/token）+ 「有用 / 没解决」+ 跑一遍测试集（仅工作台模式）。
 * 「没解决」表单自动带上本轮对话与命中条目，用户只需补期望，且**绝不承诺有人回复**。
 */
export function Test({ botId, experience }: { botId: string; experience?: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [env, setEnv] = useState({ model: "", version: "", scene: "" });
  const [showEnv, setShowEnv] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<null | { expectation: string; contact: string; attachment: string }>(null);
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number; failed: string[] } | null>(null);
  const [result, setResult] = useState<{ pass: number; total: number; failed: string[] } | null>(null);
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const offDelta = api.onChatDelta((chunk) => {
      setMsgs((m) => {
        const next = [...m];
        const last = next[next.length - 1];
        if (last && last.role === "assistant") last.text += chunk;
        else next.push({ role: "assistant", text: chunk });
        return next;
      });
    });
    const offTests = api.onTestsProgress((p) => setProgress(p));
    return () => {
      offDelta();
      offTests();
    };
  }, []);

  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight });
  }, [msgs]);

  /** 切换 Bot 时清空对话、收单表单、跑批结果：否则会把 A 的问答显示在 B 下面 */
  useEffect(() => {
    setMsgs([]);
    setInput("");
    setForm(null);
    setNote("");
    setProgress(null);
    setResult(null);
    setShowDrawer(false);
  }, [botId]);

  const last = msgs[msgs.length - 1];
  const lastHit = last && last.role === "assistant" ? last.hit ?? [] : [];

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const envClean = Object.fromEntries(Object.entries(env).filter(([, v]) => v.trim()));
      const res = await api.chatSend(botId, { mode: "test", text, env: envClean });
      // 主进程若走"一次性返回"，这里兜底补上，并把命中/耗时/token 交给抽屉显示
      if (res && (res.reply || res.hitIds)) {
        setMsgs((m) => {
          const last = m[m.length - 1];
          if (last && last.role === "assistant" && last.text) {
            return m.map((x, i) =>
              i === m.length - 1 ? { ...x, hit: res.hitIds ?? x.hit, ms: res.ms ?? x.ms, tokens: res.tokens ?? x.tokens } : x,
            );
          }
          return [
            ...m,
            {
              role: "assistant" as const,
              text: String(res.reply ?? ""),
              hit: res.hitIds ?? [],
              ms: res.ms,
              tokens: res.tokens,
            },
          ];
        });
      }
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: `调用失败：${String(e)}` }]);
    } finally {
      setBusy(false);
    }
  }

  function openForm() {
    setForm({ expectation: "", contact: "", attachment: "" });
    setNote("");
  }

  async function submitForm() {
    if (!form) return;
    if (!has("recordsSubmit")) {
      setNote("主进程还没实现 recordsSubmit（见群里的接口申请）");
      return;
    }
    const res = await api.recordsSubmit(botId, {
      env,
      question: [...msgs].reverse().find((m) => m.role === "user")?.text ?? "",
      transcript: msgs.map((m) => ({ role: m.role, text: m.text })),
      hit: lastHit,
      expectation: form.expectation,
      note: `是否刚更新过：${form.contact || "未填"}`,
      attachments: form.attachment ? [form.attachment] : [],
    });
    const id = res?.id ?? "（未返回编号）";
    setForm(null);
    setMsgs((m) => [
      ...m,
      {
        role: "assistant",
        text: `已记下，编号 ${id}。\n这条只保存在你自己的电脑上，可在「记录」页查看状态；我不承诺有人回复。`,
      },
    ]);
  }

  async function runTests() {
    if (!has("testsRun")) {
      setNote("主进程还没实现 testsRun");
      return;
    }
    setProgress({ done: 0, total: 0, failed: [] });
    const r = await api.testsRun(botId);
    if (r) setResult(r);
    setNote("跑批结束：结果在「测试集」里（通过率与失败清单）");
  }

  return (
    <div className="p-grid2">
      <div>
        <div className="p-block">
          <div className="p-row between">
            <h2 style={{ margin: 0 }}>测试对话</h2>
            <div className="p-row">
              <button className="ghost" onClick={() => setShowEnv((v) => !v)}>
                {showEnv ? "收起环境信息" : "环境信息"}
              </button>
              <button className="ghost" onClick={() => setShowDrawer((v) => !v)}>
                {showDrawer ? "收起命中详情" : "命中详情"}
              </button>
            </div>
          </div>

          {showEnv ? (
            <div className="p-row p-mt">
              <input className="p-input" style={{ width: 160 }} placeholder="机型" value={env.model} onChange={(e) => setEnv({ ...env, model: e.target.value })} />
              <input className="p-input" style={{ width: 140 }} placeholder="版本" value={env.version} onChange={(e) => setEnv({ ...env, version: e.target.value })} />
              <input className="p-input" style={{ width: 140 }} placeholder="场景" value={env.scene} onChange={(e) => setEnv({ ...env, scene: e.target.value })} />
              <span className="p-sub">这三格模拟客户端自动带上的环境信息，填了条件判断更准。</span>
            </div>
          ) : null}

          <div className="p-stream" ref={streamRef} style={{ marginTop: 12 }}>
            {msgs.length === 0 ? (
              <div className="p-empty">就像用户一样问它。回答只会来自你启用的知识条目。</div>
            ) : (
              msgs.map((m, i) => (
                <div key={i} className={`p-bubble ${m.role === "user" ? "me" : ""}`}>
                  <Markdown text={m.text} />
                  {m.role === "assistant" && i === msgs.length - 1 && !busy ? (
                    <div className="p-actions">
                      <button
                        className="primary"
                        onClick={() => {
                          const question = [...msgs].reverse().find((x) => x.role === "user")?.text ?? "";
                          void api.chatMark(botId, { verdict: "helpful", hitIds: lastHit, text: question });
                          setMsgs((x) => [
                            ...x,
                            {
                              role: "assistant",
                              text: "已记进当天的会话记录（仅本机）。记录页仍只收「没解决」。",
                            },
                          ]);
                        }}
                      >
                        有用
                      </button>
                      <button className="ghost" onClick={openForm}>没解决</button>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <div className="p-row p-mt">
            <input
              className="p-input"
              style={{ flex: 1, width: "auto", minWidth: 220 }}
              placeholder="输入问题…（Enter 发送）"
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
          {note ? <p className="p-warn p-mt">{note}</p> : null}
        </div>

        {form ? (
          <div className="p-block">
            <h2>提交记录（表单已自动带上本轮对话与命中条目）</h2>
            <label>期望结果</label>
            <textarea className="p-input" value={form.expectation} onChange={(e) => setForm({ ...form, expectation: e.target.value })} />
            <label>是否刚更新过 App / 模拟器组件</label>
            <input className="p-input" placeholder="是 / 否 / 不清楚" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
            <label>截图路径（可选，提交时会复制进 attachments/）</label>
            <input className="p-input" value={form.attachment} onChange={(e) => setForm({ ...form, attachment: e.target.value })} />
            <div className="p-row p-mt">
              <button className="primary" onClick={submitForm}>提交</button>
              <button className="ghost" onClick={() => setForm(null)}>取消</button>
            </div>
            <p className="p-sub p-mt">
              这条只保存在你自己的电脑上，Mio 看不到。提交后只写在本机数据目录，我不承诺有人回复。
            </p>
          </div>
        ) : null}
      </div>

      <div>
        {experience ? null : (
        <div className="p-block">
          <h2>测试集</h2>
          <p className="p-sub">把测试问题挨个问一遍，出通过率与失败清单。仅工作台模式可见。</p>
          <div className="p-row p-mt">
            <button className="primary" onClick={runTests} disabled={!has("testsRun")}>跑一遍测试集</button>
          </div>
          {progress ? (
            <p className="p-ok p-mt">
              {progress.total > 0 && progress.done >= progress.total ? null : `跑批中 ${progress.done}/${progress.total || "…"}…`}
            </p>
          ) : null}
          {result ? (
            <p className="p-ok p-mt">
              通过 {result.pass} / {result.total}
              {result.failed.length ? `，失败 ${result.failed.length} 条` : ""}
            </p>
          ) : null}
        </div>
        )}

        <div className="p-block">
          <h2>命中详情（调试用）</h2>
          {!showDrawer ? (
            <p className="p-sub">默认收起。点上方「命中详情」展开。</p>
          ) : last && last.role === "assistant" ? (
            <>
              {lastHit.length ? (
                <p className="p-sub">命中条目：{lastHit.join("、")}</p>
              ) : (
                <>
                  <p className="p-sub">这轮没有命中任何条目。</p>
                  <p className="p-sub">按规则 Bot 会回答「命中：无」，不会编。</p>
                </>
              )}
              <p className="p-sub">耗时：{last.ms ? `${last.ms} ms` : "主进程未回传"}</p>
              <p className="p-sub">token：{last.tokens ?? "主进程未回传"}</p>
            </>
          ) : (
            <p className="p-sub">还没有助手回复。</p>
          )}
        </div>
      </div>
    </div>
  );
}
