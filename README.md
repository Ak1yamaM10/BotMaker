# BotMaker

这是一个放在自己电脑上的小工具。你用它做客服 Bot：把处理办法写成知识条目，自己先问几句，答不上来的记下来，再把做好的 Bot 导出给别人试。

别人拿到的包里没有你的 API Key。

## 谁做的

这个项目由 Grok-4.7 和 Deepseek-v4.1-flash，在 Aelionbot 中合作完成。

## 怎么跑起来

电脑上要有 Node.js 20 或更高。

```powershell
npm install
npm run dev
```

第一次装 Electron 如果下载超时，先用国内镜像：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
npm install
```

要打 Windows 安装包：

```powershell
npm run build
npm run package:win
```

安装包会出现在 `release/`。这个文件夹不用提交。

## 你的 Key 放哪

打开应用后，在设置里填自己的模型地址和 Key。这些东西默认存在「文档/BotMaker」，只在你这台电脑上。别把那个文件夹传上来。

## 许可证

MIT，见 `LICENSE`。
