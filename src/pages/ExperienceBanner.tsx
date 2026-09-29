import "./pages.css";

/**
 * 体验模式顶部横幅（方案 §8；文案取自《文案与交互清单》§4）
 *
 * 只在体验模式显示。它承担两件事：
 * ① 说清"你在体验谁"——回答来自作者配置的知识条目，不是通用模型；
 * ② 说清"你的提问去哪了"——只保存在本机，对方看不到。
 * 第 ② 条不是装饰：不写清楚，试用者会以为自己发出去的东西作者收到了。
 */
export function ExperienceBanner({ botName }: { botName: string }) {
  return (
    <div className="p-banner">
      你正在体验「{botName}」。回答来自作者配置的知识条目；你的提问只保存在本机。
    </div>
  );
}
