# 解构式美食海报 (Food Deconstruction Poster)

输入美食名称，自动拆解食材层次、质感与文化风格，生成纯黑背景的商业级分层海报。

![Cover](https://food.snippet.pp.ua/IMG_5090.jpeg)

## ✨ 特性

- **Gemini 驱动**：利用 Gemini 3.x 图像模型生成垂直分层解构海报。
- **极致 Prompt**：内置大师级解构提示词，强制垂直构图与双语标注。
- **极简架构**：纯静态前端 + Cloudflare Functions，无服务器负担。
- **每日限额**：前端本地实现每日 3 次免费生成额度（localStorage 计数）。
- **MVP 设计**：Base64 图片直出，无需配置对象存储即可运行；随机示例背景可直接使用公网图/R2 图床。

## 🛠️ 部署指南

### 1. 准备工作
- Cloudflare 账号
- Google Gemini API Key（支持图像生成的模型）

### 2. 一键部署
[![Deploy to Cloudflare Pages](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/keenturbo/food-deconstruction-poster)

### 3. 手动部署
1. **Fork/Clone**：
    ```bash
    git clone https://github.com/keenturbo/food-deconstruction-poster.git
    ```
2. **Cloudflare Pages**：Dashboard → Pages → Create project → Connect to Git → 选择本仓库。
3. **构建配置**：
   - Build command：留空（静态 + Functions）
   - Build output directory：`public`
4. **环境变量（必填）**：
   - `GEMINI_API_KEY`：你的 Gemini API Key
   - `AI_MODEL_NAME`（可选）：如 `gemini-3-pro-image-preview`（未设置则使用默认值）

保存后重新触发一次部署以生效环境变量。

## 📂 项目结构
- `public/index.html`：前端单页，包含额度限制、本地存储、随机示例背景、请求与展示逻辑。
- `functions/api/generate.ts`：后端 Cloudflare Function，构建提示词并调用 Gemini，返回 Base64 Data URL。

## ⚠️ 说明
- 当前为 MVP，生成结果直接以 Base64 返回，不做持久化；刷新或关闭页面后需自行下载。
- 示例背景随机读取公网/R2 图片，可在 `public/index.html` 的 `sampleImages` 中替换。
![food-poster.png 5.jpeg](https://icon.pp.ua/file/1765515078682_food-poster.png_5.jpeg)
## 🤝 贡献
欢迎 Fork 和改造。如需商用或持久化方案，可接入 R2/D1/Supabase 等存储与鉴权。