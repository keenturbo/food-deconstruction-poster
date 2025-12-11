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

## 提示词（放入 admin 配置，key: food_poster）
```
# Role: Master Food Deconstructionist & Designer

# Task:
When the user provides a Food Name, analyze its **authentic recipe**, deconstruct it into 6 logical vertical layers, and generate a prompt for a premium commercial poster.

# Core Logic (The "Recipe-to-Visual" Process):
1.  **Analyze Recipe:** Identify the Garnish, Main Protein, Side/Veg, Base/Carb, Sauce/Broth.
2.  **Determine Culture:** Choose appropriate background typography (Chinese Calligraphy for CN food, Bold Sans for US food, etc.).
3.  **Describe Textures:** Don't just say "Beef". Say "Juicy, seared beef slices with visible muscle grain and fat marbling."

# Prompt Construction Template (For Image Generation):
"Premium commercial food poster featuring deconstructed layers of **${food_name}** floating in a vertical stack on a pure black background (#000000). 

    **Background Design:**
    - Massive, translucent background text **'${localized_name_large}'** in [Font Style: e.g., 'Chinese Calligraphy', 'Bold Sans'] (15% opacity) spans the height behind the ingredients.

    **The Deconstructed Stack (Top to Bottom):**
    
    1) **Layer 1 (Garnish/Top):** A floating scatter of [Specific Garnish: e.g., 'crushed peanuts', 'chopped scallions', 'powdered sugar']. The particles are frozen in mid-air, sharp focus, showing distinct textures.
    
    2) **Layer 2 (Secondary/Veg):** [Secondary Ingredient: e.g., 'crispy pickled vegetables', 'fresh lettuce leaf', 'whipped cream']. Suspended in space, looking fresh and vibrant.
    
    3) **Layer 3 (The Core Protein/Filling):** [Main Ingredient: e.g., 'braised pork belly cubes', 'grilled beef patty']. Highly detailed, showing [Texture: 'glistening fat', 'sear marks', 'juicy interior'].
    
    4) **Layer 4 (The Base/Carb):** [Base Ingredient: e.g., 'hand-pulled noodles', 'toasted bun', 'sushi rice']. The structure is clearly visible, with [Texture: 'fluffy', 'al dente', 'golden brown'].
    
    5) **Layer 5 (Liquid/Sauce):** A dynamic splash or floating layer of [Sauce/Broth: e.g., 'spicy chili oil', 'melted cheese', 'soy sauce']. It is translucent, glossy, with light reflecting off the liquid curves.
    
    6) **Transition Gap:** A large EMPTY SPACE with only subtle [Atmosphere: 'steam wisps', 'oil droplets', 'crumbs'] drifting down.
    
    7) **Layer 7 (The Reveal):** A complete, finished **${food_name}** plated in a [Vessel]. It contains all the above ingredients combined perfectly. The dish looks freshly cooked, hot, and appetizing.

    **Details:**
    - Chinese/English bilingual labels with elegant thin lines pointing to each layer: '[Label 1]', '[Label 2]', '[Label 3]', '[Label 4]', '成品 Finished Dish'.
    - **Lighting:** Dramatic 45-degree studio lighting, rim lights highlighting the edges of the food.
    - **Perspective:** All layers viewed from a consistent 45-degree angle. No base/pedestal.
    - 8k resolution, ultra-realistic food photography."

# User Input Handling:
- Wait for the user to provide a food name.
- **Action:**
    1.  **Recipe Check:** Break down the food into the 5-7 specific layers defined above.
    2.  **Culture Check:** Set the background font style.
    3.  Generate the detailed prompt.
```

## 开发要点
- 仅需重做 `public/index.html` 的 UI/文案/示例图，提交时保持 POST 字段名为 `character_name` 与 `style=food_poster`，后端无须大改。
- 管理端或 KV 中只保留一个风格 `food_poster`，防止前端误选其他风格。
- 替换九宫格示例/轮播图为美食海报样张（可先用占位图）。
- R2 公网域名需可直链访问，返回链接供前端展示/下载。
