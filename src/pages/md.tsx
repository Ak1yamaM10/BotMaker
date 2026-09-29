import type { ReactNode } from "react";

/**
 * 一个很小的 Markdown 渲染器（不引依赖，避免联网装包）
 *
 * 为什么需要它：调优助手和客服 Bot 的回复天然是 Markdown（**加粗**、表格、有序步骤），
 * 直接当纯文本显示会变成一堆 `**` 和 `|---|`，读起来很糟。这里只支持我们实际用到的子集：
 *   标题 / 段落（保留换行）/ 有序与无序列表 / 表格 / 代码块 / 行内加粗·斜体·代码
 * 输出的是 React 节点，不用 dangerouslySetInnerHTML，所以不存在注入问题。
 */

/** 行内标记：**粗**、*斜*、`代码` */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null = null;
  let n = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const piece = String(m[0]);
    const k = `${keyPrefix}-i${n++}`;
    if (piece.slice(0, 2) === "**") out.push(<strong key={k}>{piece.slice(2, -2)}</strong>);
    else if (piece.charAt(0) === "`") out.push(<code key={k} className="md-code">{piece.slice(1, -1)}</code>);
    else out.push(<em key={k}>{piece.slice(1, -1)}</em>);
    last = m.index + piece.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** 把一行按 | 切成单元格 */
function cells(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

const isSeparator = (line: string) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes("-");

export function Markdown({ text }: { text: string }) {
  const lines = (text ?? "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    if (line.trim().startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) buf.push(lines[i++]);
      i++; // 跳过结束的 ```
      blocks.push(
        <pre key={`k${key++}`} className="md-pre">
          <code>{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // 表格：当前行是 | 开头，下一行是分隔行
    if (line.trim().startsWith("|") && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      blocks.push(
        <div key={`k${key++}`} className="md-table-wrap">
          <table className="md-table">
            <thead>
              <tr>{head.map((h, hi) => <th key={hi}>{inline(h, `h${hi}`)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>{head.map((_, ci) => <td key={ci}>{inline(r[ci] ?? "", `r${ri}c${ci}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = Math.min(h[1].length + 2, 6); // 消息里不用 h1/h2，避免层级过大
      const Tag = (`h${level}` as unknown) as "h3";
      blocks.push(
        <Tag key={`k${key++}`} className={`md-h md-h${level}`}>
          {inline(h[2], `h${key}`)}
        </Tag>,
      );
      i++;
      continue;
    }

    // 列表（有序 / 无序）
    const isUl = /^\s*[-*+]\s+/.test(line);
    const isOl = /^\s*\d+[.)]\s+/.test(line);
    if (isUl || isOl) {
      const items: string[] = [];
      while (i < lines.length && (isUl ? /^\s*[-*+]\s+/.test(lines[i]) : /^\s*\d+[.)]\s+/.test(lines[i]))) {
        items.push(lines[i].replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ""));
        i++;
      }
      const List = isUl ? "ul" : "ol";
      blocks.push(
        <List key={`k${key++}`} className="md-list">
          {items.map((it, ii) => <li key={ii}>{inline(it, `l${ii}`)}</li>)}
        </List>,
      );
      continue;
    }

    // 空行
    if (!line.trim()) {
      i++;
      continue;
    }

    // 段落：连续的普通行合成一段，行内换行保留
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].trim().startsWith("|") &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    blocks.push(
      <p key={`k${key++}`} className="md-p">
        {para.map((p, pi) => (
          <span key={pi}>
            {inline(p, `p${pi}`)}
            {pi < para.length - 1 ? <br /> : null}
          </span>
        ))}
      </p>,
    );
  }

  return <div className="md">{blocks}</div>;
}
