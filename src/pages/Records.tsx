import { useEffect, useMemo, useState } from "react";
import { api, has } from "../api";
import type { FeedbackRecord } from "../api";
import "./pages.css";

const STATUS: Record<FeedbackRecord["status"], string> = {
  pending: "待处理",
  replied: "已回复",
  closed: "已关闭",
};

/** ④ 记录（数据回流）：列表 / 详情 / 状态 / 导出 CSV / 打开数据文件夹 */
export function Records({ botId }: { botId: string }) {
  const [rows, setRows] = useState<FeedbackRecord[]>([]);
  const [cur, setCur] = useState<FeedbackRecord | null>(null);
  const [kw, setKw] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    const list = await api.recordsList(botId);
    setRows(list);
    setCur((c) => (c ? list.find((r) => r.id === c.id) ?? null : null));
    setLoading(false);
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId]);

  const shown = useMemo(
    () =>
      rows.filter((r) => {
        if (!kw.trim()) return true;
        const hay = [r.id, r.question, r.expectation, (r.hit ?? []).join(" ")].join(" ").toLowerCase();
        return hay.includes(kw.trim().toLowerCase());
      }),
    [rows, kw],
  );

  async function setStatus(r: FeedbackRecord, status: FeedbackRecord["status"]) {
    if (!has("recordsUpdate")) {
      setNote("主进程还没实现 recordsUpdate");
      return;
    }
    await api.recordsUpdate(botId, r.id, { status });
    await reload();
  }

  return (
    <div className="p-grid2">
      <div className="p-block">
        <div className="p-row between">
          <h2 style={{ margin: 0 }}>记录（{rows.length}）</h2>
          <div className="p-row">
            <input className="p-input" style={{ width: 200 }} placeholder="搜索编号 / 问题 / 命中" value={kw} onChange={(e) => setKw(e.target.value)} />
            <button className="ghost" disabled={!has("recordsExportCsv")} onClick={() => api.recordsExportCsv(botId)}>导出 CSV</button>
            <button className="ghost" disabled={!has("recordsRevealInFolder")} onClick={() => api.recordsRevealInFolder(botId)}>打开数据文件夹</button>
          </div>
        </div>

        {loading ? (
          <div className="p-empty">读取中…</div>
        ) : shown.length === 0 ? (
          <div className="p-empty">还没有「没解决」的记录。这通常是好事。</div>
        ) : (
          <table className="p-table">
            <thead>
              <tr>
                <th style={{ width: 150 }}>编号</th>
                <th style={{ width: 130 }}>时间</th>
                <th>问题</th>
                <th style={{ width: 140 }}>命中条目</th>
                <th style={{ width: 90 }}>状态</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className={cur?.id === r.id ? "on" : ""} onClick={() => setCur(r)} style={{ cursor: "pointer" }}>
                  <td>{r.id}</td>
                  <td className="p-sub">{r.createdAt}</td>
                  <td>{r.question ?? "—"}</td>
                  <td className="p-sub">{(r.hit ?? []).join("、") || "—"}</td>
                  <td>{STATUS[r.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {note ? <p className="p-warn p-mt">{note}</p> : null}
      </div>

      <div className="p-block">
        <h2>详情</h2>
        {!cur ? (
          <p className="p-sub">左侧点一条看详情：对话原文 + 结构化字段 + 附件路径。</p>
        ) : (
          <>
            <p className="p-sub">编号 {cur.id}　{cur.createdAt}</p>
            <label>环境</label>
            <div className="p-sub">
              {cur.env && Object.keys(cur.env).length
                ? Object.entries(cur.env).map(([k, v]) => `${k}=${v}`).join("；")
                : "—"}
            </div>
            <label>本轮对话</label>
            <div className="p-drawer">
              {(cur.transcript ?? []).length === 0
                ? "（无对话原文）"
                : (cur.transcript ?? []).map((t, i) => (
                    <div key={i}>
                      {t.role === "user" ? "用户：" : "Bot："}
                      {t.text}
                    </div>
                  ))}
            </div>
            <label>试过的条目</label>
            <div className="p-sub">{(cur.tried ?? []).join("、") || "—"}</div>
            <label>期望结果</label>
            <div className="p-sub">{cur.expectation || "—"}</div>
            <label>附件（相对路径，已复制进 attachments/）</label>
            <div className="p-sub">{(cur.attachments ?? []).join("、") || "—"}</div>
            <label>状态</label>
            <select className="p-input" value={cur.status} onChange={(e) => setStatus(cur, e.target.value as FeedbackRecord["status"])}>
              <option value="pending">待处理</option>
              <option value="replied">已回复</option>
              <option value="closed">已关闭</option>
            </select>
            <p className="p-sub p-mt">记录只在本机。要交给别人处理，用左侧「导出 CSV」或「打开数据文件夹」。</p>
          </>
        )}
      </div>
    </div>
  );
}
