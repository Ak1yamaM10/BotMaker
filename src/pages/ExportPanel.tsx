import { useState } from "react";
import { api, has } from "../api";
import "./pages.css";

/**
 * 导出预览（方案 §2 导出与分享；文案取自《文案与交互清单》§1）
 *
 * 设计要点：导出前**先摊开清单**——"会带上 / 不会带走"两栏 + 一句对方视角的说明。
 * 这是把"包里没有 Key"变成用户看得见的事实，而不是口头承诺。
 *
 * 挂载方式（主做顶栏的人接）：把本组件放进顶栏「导出」按钮弹出的面板里，
 * 传当前 Bot 的 id 与名称即可，其余不用管。
 */
export function ExportPanel({ botId, botName }: { botId: string; botName: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [resultPath, setResultPath] = useState("");

  async function doExport() {
    if (!has("botsExport")) {
      setNote("主进程还没实现 botsExport");
      return;
    }
    setBusy(true);
    try {
      const r = await api.botsExport(botId, { includeMaterials: true });
      setResultPath(r?.path ?? "");
      setNote("已导出");
    } catch (e) {
      setNote(`导出失败：${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-block">
      <h2>这个包里有什么</h2>

      <div className="p-grid2" style={{ gap: 12 }}>
        <div>
          <p className="p-sub" style={{ marginBottom: 6 }}>
            <strong>会带上</strong>
          </p>
          <ul className="p-list">
            <li>启用的知识条目</li>
            <li>Bot 的名称、用途与客服提示词</li>
            <li>素材文档（如果勾选）</li>
          </ul>
        </div>
        <div>
          <p className="p-sub" style={{ marginBottom: 6 }}>
            <strong>不会带走</strong>
          </p>
          <ul className="p-list">
            <li>API Key</li>
            <li>草稿与停用条目</li>
            <li>记录原文</li>
            <li>测试集</li>
          </ul>
        </div>
      </div>

      <p className="p-sub p-mt">对方导入后只能当用户提问，看不到你的知识库和记录。</p>

      <div className="p-row p-mt">
        <button className="primary" onClick={doExport} disabled={busy || !has("botsExport")}>
          {busy ? "导出中…" : `导出「${botName}」`}
        </button>
        {note ? <span className="p-ok">{note}</span> : null}
      </div>
      {resultPath ? <p className="p-sub p-mt">已导出到：{resultPath}</p> : null}
      {!has("botsExport") ? <p className="p-warn p-mt">主进程还没实现 botsExport，导出按钮暂不可用。</p> : null}
    </div>
  );
}
