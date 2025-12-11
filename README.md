# 美食图解 · 解构式海报生成

Cloudflare Pages + Functions + R2 + Gemini，一键部署的美食解构分层海报生成器。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/keenturbo/food-deconstruction-poster)

## 功能概览
- 前端：单输入（美食名称）+ 生成按钮，右侧结果区展示竖版海报，支持下载；每日本地限免 3 次，超限提示打赏/自建部署。
- 结果区：随机示例遮罩背景，竖版 8K 分层示例；生成成功后展示实际图片。
- 后端：Cloudflare Pages Functions，调用 Gemini 文生图（默认 `AI_MODEL_NAME` 或 `gemini-3-pro-image-preview`），使用固定分层美食提示词；支持 R2 存储生成结果。
- 配置：支持 `food_poster` 单风格；若接入 admin/KV，可扩展多 API 与提示词。

## 快速部署（Cloudflare Pages）
1. 点击上方“一键部署”按钮，选择账号并创建 Pages 项目。
2. 资源绑定（Pages 项目 → Settings → Functions → Bindings）：
   - R2 Bucket：`R2_BUCKET`（你的 R2 存储桶，需开启公共访问域名）。
   - KV Namespace（可选，用于 admin 配置）：`ADMIN_KV`。
3. 环境变量（Pages 项目 → Settings → Environment variables）：
   - `GEMINI_API_KEY`：必填，Google AI Studio/Vertex API Key。
   - `AI_MODEL_NAME`：可选，默认 `gemini-1.5-flash-latest`；推荐 `gemini-3-pro-image-preview`。
   - `AI_MODEL_URL`：可选，留空用默认 `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`。
   - `R2_PUBLIC_DOMAIN`：你的 R2 公网访问域名（用于返回可直链的图片 URL）。
   - `ENV_SECRET_KEY`：任意随机字符串，用于签名/校验。
4. 构建设置：
   - Framework preset: `None`
   - Build command: 留空
   - Build output directory: `public`
   - Functions directory: `functions`
5. 部署完成后，访问 Pages 站点，输入美食名称即可生成；本地存储计数每日 3 次，超限提示自建或打赏。

## 项目结构
- `public/index.html`：前端单页（输入/按钮/结果区、示例背景、限免逻辑）。
- `functions/api/generate.ts`：主生成接口，POST `/api/generate`，字段 `character_name`（或 `food_name`），返回 `image_url`。使用固定美食解构提示词并请求 Gemini，支持 R2 存储。
- 其他文件：暂未强依赖，可按需增补 admin/KV 等。

## 本地开发（可选）
- 依赖：`npm install -g wrangler`。
- 运行：`wrangler dev`（需在 `.dev.vars` 中设置 `GEMINI_API_KEY`，可用 R2/KV 模拟或注释相关调用）。

## 使用提示
- 模型费用由 `GEMINI_API_KEY` 账号承担，请自行控制调用频率。
- 若需自定义提示词或多模型兜底，可参考 AI-Chalkboard-Art 的 admin/KV 方案，将 `prompts` 与 `api_configs` 写入 `ADMIN_KV`。
- 示例背景图可替换为你自己的 R2 公开资源，修改 `public/index.html` 中的示例数组即可。
