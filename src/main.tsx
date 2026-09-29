import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./theme.css";

class Guard extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: "" };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message || "未知错误" };
  }

  render() {
    if (this.state.error) {
      return <div style={{ padding: 24, fontFamily: "Microsoft YaHei, sans-serif" }}>界面出错了：{this.state.error}</div>;
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <Guard>
    <App />
  </Guard>,
);
