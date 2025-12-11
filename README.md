# 美食图解 · 解构式海报生成

基于 Cloudflare Pages + Functions + Gemini 的极简美食解构海报生成器。输入美食名称，AI 自动拆解食材、分析文化风格，生成纯黑背景的纵向分层解构海报。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/keenturbo/food-deconstruction-poster)

## ✨ 项目亮点 (MVP)
- **极简前端**：单页应用，无服务器，无数据库。
- **智能生成**：后端集成 Gemini Pro Vision/Image 模型，通过精心设计的 Prompt 实现“食谱分析 -> 视觉解构”。
- **即时反馈**：生成结果直接以 Base64 流返回，无需配置存储桶即可运行。
- **交互体验**：
  - 每日限免 3 次（基于 LocalStorage）。
  - 随机展示精美案例作为等待区背景（支持从 R2 加载）。
  - 支持一键下载高清海报。

## 🛠️ 快速部署指南

### 1. 准备工作
- 拥有一个 Cloudflare 账号。
- 申请 Google Gemini API Key（支持文生图的模型）。

### 2. 一键部署
1. 点击上方的 **Deploy to Cloudflare** 按钮。
2. 授权 Cloudflare 访问你的 GitHub 账号并选择仓库。
3. 在部署配置页面，**构建命令 (Build command)** 和 **输出目录 (Build output directory)** 均留空即可（本项目为纯静态 + Functions）。

### 3. 配置环境变量 (关键)
部署完成后，进入 Cloudflare Pages 项目后台 -> **Settings** -> **Environment variables**，添加以下变量：

| 变量名 | 描述 | 示例值 |
|--------|------|--------|
| `GEMINI_API_KEY` | **(必填)** Google AI Studio API Key | `AIzaSy...` |
| `AI_MODEL_NAME` | (可选) 指定模型版本 | `gemini-1.5-flash` 或 `gemini-2.0-flash-exp` |

> **注意**：无需配置 KV 或 R2 即可跑通 MVP 流程。

### 4. 重新部署
保存环境变量后，进入 **Deployments** 标签页，点击最新的部署记录右侧的三个点 -> **Retry deployment**，以使环境变量生效。

## 📂 项目结构
- **`public/index.html`**
  - 核心前端逻辑。
  - 包含 UI 布局、随机背景加载、API 请求、Base64 图片展示、下载功能及限次逻辑。
- **`functions/api/generate.ts`**
  - 核心后端逻辑 (Serverless)。
  - 接收前端 JSON 请求 `{ character_name: "..." }`。
  - 构建复杂的“美食解构”提示词 (Prompt)。
  - 调用 Gemini API 生成图片并处理返回数据。

## 🎨 自定义配置
- **修改提示词**：编辑 `functions/api/generate.ts` 中的 `buildPrompt` 函数。
- **替换背景图**：编辑 `public/index.html` 中的 `sampleImages` 数组，填入你自己的图片 URL（推荐使用 R2 或图床）。

## 🤝 贡献与支持
本项目为 MVP 版本，欢迎 Fork 修改。如需商业化功能（如支付、用户系统、历史记录存储），建议接入 Supabase 或 Cloudflare D1 + R2。
