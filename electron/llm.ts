import type { BrowserWindow } from "electron";

const jobs = new Map<string, AbortController>();

export function stopChat(botId: string) {
  jobs.get(botId)?.abort();
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function streamChat(opts: {
  win: BrowserWindow;
  botId: string;
  url: string;
  apiKey: string;
  model: string;
  temperature: number;
  messages: ChatMessage[];
  silent?: boolean;
}) {
  const ac = new AbortController();
  jobs.set(opts.botId, ac);
  let text = "";
  let tokens = 0;
  try {
    const res = await fetch(opts.url, {
      method: "POST",
      signal: ac.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        temperature: opts.temperature,
        stream: true,
        messages: opts.messages,
      }),
    });
    if (!res.ok || !res.body) {
      const body = await res.text();
      const msg = `模型没回应（HTTP ${res.status}）。${body.slice(0, 180)}`;
      opts.win.webContents.send("chat:delta", msg);
      return { text: msg, tokens: 0, aborted: false };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let pending = "";
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      if (!pending || opts.silent || opts.win.isDestroyed()) {
        pending = "";
        return;
      }
      opts.win.webContents.send("chat:delta", pending);
      pending = "";
    };
    const push = (piece: string) => {
      text += piece;
      if (opts.silent) return;
      pending += piece;
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flush();
      }, 50);
    };
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("模型很久没有继续输出，这一轮已停止。")), 60000);
        }),
      ]).finally(() => clearTimeout(timer));
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let json: { choices?: { delta?: { content?: string } }[]; usage?: { total_tokens?: number } };
        try {
          json = JSON.parse(data) as typeof json;
        } catch {
          continue;
        }
        const piece = json.choices?.[0]?.delta?.content ?? "";
        if (json.usage?.total_tokens) tokens = json.usage.total_tokens;
        if (!piece) continue;
        push(piece);
      }
    }
    if (flushTimer) clearTimeout(flushTimer);
    flush();
    return { text, tokens, aborted: false };
  } catch (error) {
    if (ac.signal.aborted) return { text, tokens, aborted: true };
    const msg = `调用失败：${error instanceof Error ? error.message : String(error)}`;
    opts.win.webContents.send("chat:delta", msg);
    return { text: msg, tokens, aborted: false };
  } finally {
    jobs.delete(opts.botId);
  }
}
