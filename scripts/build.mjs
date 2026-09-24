// 将 src/ 下的片段合并为单文件页面：
//   dist/app.html  —— 页面片段（发布到 Claude Artifact 时使用）
//   index.html     —— 完整 HTML 文档（本地直接打开或部署到任意静态服务器/CDN）
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const r = f => readFileSync(new URL("../src/" + f, import.meta.url), "utf8");
const js = ["data.js", "engine.js", "ui.js"].map(r).join("\n");
const frag = r("shell.html").replace("/*STYLES*/", () => r("styles.css")).replace("/*SCRIPTS*/", () => js);
mkdirSync(new URL("../dist/", import.meta.url), { recursive: true });
writeFileSync(new URL("../dist/app.html", import.meta.url), frag);
writeFileSync(new URL("../index.html", import.meta.url),
  '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
  frag.replace(/<div class="app">[\s\S]*$/, "") + "</head>\n<body>\n" + frag.match(/<div class="app">[\s\S]*$/)[0] + "\n</body>\n</html>\n");
console.log("built dist/app.html and index.html", (frag.length / 1024).toFixed(1) + " KB");
