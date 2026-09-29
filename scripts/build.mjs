import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";

await esbuild({
  entryPoints: {
    main: "electron/main.ts",
    preload: "electron/preload.ts",
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  outdir: "dist-electron",
  outExtension: { ".js": ".cjs" },
  external: ["electron"],
});
await viteBuild({ configFile: "vite.config.ts" });
