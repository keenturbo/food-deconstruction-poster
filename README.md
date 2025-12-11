# 美食图解（Food Deconstruction Poster）

Cloudflare Pages + Functions + R2 + Gemini 文生图，生成“解构式”美食海报（垂直分层、黑底、高质商业风）。

## 目标
- 前端：单一风格，保留九宫格展示位，输入“美食名称”，展示生成结果与下载。
- 后端：沿用 AI-Chalkboard-Art 的 Cloudflare Functions 逻辑（Gemini / Grok / 自定义多路兜底），调用提示词生成图像并存储到 R2。
- 配置：admin KV 维护 prompts/api_configs；R2 存储输出；可按优先级切换 API。

## 部署概览
1) Fork/Clone 本仓库。
2) Cloudflare 绑定：Pages 项目 + Functions + R2 + KV（ADMIN_KV）。
3) 环境变量：
   - `GEMINI_API_KEY` （主用）
   - `AI_MODEL_NAME`/`AI_MODEL_URL`（可选兜底）
   - `R2_PUBLIC_DOMAIN` 公网访问域名
   - `ENV_SECRET_KEY` 任意随机串
4) 管理端：`/admin.html`（需已存在于 Pages 资源），填入唯一风格 `food_poster` 的提示词与缩略图。
5) 生成：前端 POST `/api/generate`，字段 `character_name`=美食名，`style`=`food_poster`；后端生成图像写入 R2，返回可公开访问的 URL。


## 开发要点
- 仅需重做 `public/index.html` 的 UI/文案/示例图，提交时保持 POST 字段名为 `character_name` 与 `style=food_poster`，后端无须大改。
- 管理端或 KV 中只保留一个风格 `food_poster`，防止前端误选其他风格。
- 替换九宫格示例/轮播图为美食海报样张（可先用占位图）。
- R2 公网域名需可直链访问，返回链接供前端展示/下载。
