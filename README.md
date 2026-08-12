# 办公工作台 (Office Workbench)

一个**单文件 HTML 应用** + **C# WebView2 窗口版**的个人办公效率工具。零依赖、内联 CSS/JS，支持 PC 与手机响应式访问。

## 功能模块

- **今日概览** — 当天待办、灵感、项目进度一屏掌握
- **待办** — 轻重缓急（P0/P1/P2）、截止日期、提醒时间、提前提醒、重复任务、关联项目
- **日历** — 按日期查看任务与提醒
- **灵感** — 快速记录想法，支持标签
- **项目** — 项目阶段追踪（进行中/卡住/完成），与待办双向关联
- **周回顾** — 自动汇总本周完成情况

## 特色能力

- 📁 **配置文件数据源**：页面数据可实时从指定 Excel/JSON 文件读写，多端共享同一份数据
- 🔔 **久坐提醒**：按间隔弹出休息提示，提示音支持自定义本地音乐文件或内置五声音阶旋律
- ⏰ **待办到点提醒**：到达提醒时间弹框 + 声音（可关闭），支持「稍后 10 分钟」/「去处理」
- 🔄 **项目关联**：待办可关联项目，重载配置后关联关系稳定保持
- 🌐 **多端同步**：C# HTTP 服务端作为共享数据权威源，手机通过浏览器访问同一份数据

## 目录结构

```
src/                  # 源码（HTML 片段 + JS 模块，最终由 build.js 拼成单文件）
  01_head.html        页面 <head> 与样式
  02_body.html        页面结构与 SVG 图标
  03_core.js          数据模型、存储、提醒/重复引擎
  04_render_a.js      今日概览 / 待办 / 日历渲染
  05_render_b.js      灵感 / 项目 / 周回顾渲染
  06_app.js           交互、导入导出、久坐与待办提醒
  07_file.js          配置文件数据源（Excel/JSON 读写）
  08_sync.js          服务端共享同步
build.js              # 将 src/ 拼成 办公工作台.html
app/gui/              # C# WebView2 窗口版（dotnet）
app/cs/               # 另一种 C# 宿主
app/win/              # Windows 原生宿主
```

## 构建

```bash
node build.js          # 生成 办公工作台.html（单文件应用）
```

## 打包 Windows 窗口版

```bash
cd app/gui
dotnet publish -c Release -r win-x64 --self-contained true \
  /p:PublishSingleFile=true /p:IncludeNativeLibrariesForSelfExtract=true \
  /p:ApplicationIcon=app.ico -o out
```

## 数据格式

- 本地默认使用 `localStorage` 持久化
- 可绑定 Excel（`.xlsx`）或 JSON 作为数据源，详见应用内「数据与提醒」设置

## 技术栈

- 前端：原生 HTML/CSS/JS，零外部依赖
- 桌面：C# + WebView2（Microsoft Edge）
- 文件格式：手写 ZIP + CRC32 生成 xlsx（支持共享字符串）
