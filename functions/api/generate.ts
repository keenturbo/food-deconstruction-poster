import type { RequestHandler } from "@cloudflare/workers-types";

const DEFAULT_MODEL = "gemini-1.5-flash-latest";
const DEFAULT_API_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

async function callGeminiImage(apiUrl: string, apiKey: string, prompt: string) {
  const url = `${apiUrl}?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      candidateCount: 1,
      responseModalities: ["IMAGE"],
      temperature: 0.6,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    ],
  } as const;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Gemini API ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];

  // 优先读取 inlineData 图片
  for (const part of parts) {
    const inline = part?.inlineData;
    if (inline?.data) {
      return { base64: inline.data, mime: inline.mimeType || "image/png" };
    }
  }

  // 其次尝试文本 JSON
  for (const part of parts) {
    if (typeof part?.text === "string" && part.text.trim()) {
      try {
        const parsed = JSON.parse(part.text);
        if (parsed.base64) {
          return { base64: parsed.base64, mime: parsed.mime || "image/png" };
        }
      } catch (e) {
        // ignore parse errors, continue
      }
    }
  }

  throw new Error("Gemini 响应缺少图片数据");
}

function buildPrompt(foodName: string) {
  const name = foodName.trim();
  const localized = name; // 可按需做本地化
  return `Generate one ultra-realistic PNG image only. Do not return text. Follow strictly:
# Role: Master Food Deconstructionist (Image Generator)

# Task:
Analyze the Food Name, determine its cultural origin/recipe, and generate a prompt where **LABELS ARE EXPLICITLY DEFINED**. Then EXECUTE DRAWING.

# Visual Structure:
- **Background:** Pure black (#000000).
- **Typography:** **VERTICAL STAGGERED CALLIGRAPHY** (CRITICAL).
- **Layout:** **STRICT SINGLE VERTICAL STACK**.

# Prompt Construction Template (For Image Generation):
"A premium commercial food poster featuring deconstructed layers of **${name}** floating in a **STRICT SINGLE VERTICAL STACK** on a pure black background (#000000).

    **Background Typography (CRITICAL - HARD CONSTRAINT):**
    - The text **'${localized}'** is written in **MASSIVE CHINESE BRUSH CALLIGRAPHY**.
    - **FORCED LAYOUT:** The characters MUST be arranged in a **SINGLE VERTICAL COLUMN** from top to bottom.
    - **Style:** If the name is long (e.g., >4 chars), allow the characters to overlap slightly or stagger left/right to fit the height, but maintain the **VERTICAL FLOW**.
    - **Constraint:** Write the exact string **'${localized}'** ONLY ONCE. Do NOT break it into multiple blocks. Do NOT switch to horizontal.

    **The Stack (Top to Bottom):**
    
    [AI: Insert 3-5 Dynamic Layers. MUST include a 'Dripping' liquid layer.]
    
    *   **Layer 1 (Top):** [Garnish/Top Ingredient]. Floating, sharp focus.
    *   **Layer 2:** [Core Ingredient]. Rich texture.
    *   **Layer 3 (The Action Layer):** [Sauce/Glaze/Juice] **DRIPPING DOWN** dynamically. High gloss.
    *   **Layer ...:** [Base Ingredient].
    
    **Visual Gap:** An intentional empty vertical space filled with rising steam. **DO NOT LABEL THIS AREA.**
    
    **Bottom Layer (The Reveal):** A complete, finished **${name}** plated in [Vessel], sitting directly at the bottom.

    **Label Styling (Luxury Aesthetics):**
    - **Color:** Text and pointer lines are **ELEGANT CHAMPAGNE GOLD (#F7E7CE)**.
    - **Font:** Chinese **Slim Serif (细宋体)** + English **Small Caps**.
    - **Lines:** Ultra-thin gold lines pointing to ingredients.

    **Labeling Instructions:**
    - Add pointers with **EXACT BILINGUAL LABELS** for each solid layer:
      - Pointing to Layer 1: "[Layer 1 Name CN] [Layer 1 Name EN]"
      - Pointing to Layer 2: "[Layer 2 Name CN] [Layer 2 Name EN]"
      - Pointing to Bottom Dish: "成品 Finished Dish"
    - **IMPORTANT: Do NOT write 'Empty Space'.**

    **Details:**
    - **NO SPLIT SCREEN.** All elements centered.
    - Dramatic studio lighting, rim lights, 8k resolution, vertical format."

# User Input Handling:
- Wait for the user to provide a food name.
- **Action:**
    1.  **Culture Check:** Use "Vertical Calligraphy" for Chinese food.
    2.  **Recipe Check:** Pre-calculate layers and labels.
    3.  **GENERATE IMAGE.**
`;
}

export const onRequestPost: RequestHandler = async ({ request, env }) => {
  try {
    const { character_name, food_name, style } = await request.json<any>();
    const name = (food_name || character_name || "").trim();
    if (!name) {
      return new Response(JSON.stringify({ error: "缺少美食名称" }), { status: 400 });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "缺少 GEMINI_API_KEY" }), { status: 500 });
    }

    const model = env.AI_MODEL_NAME || DEFAULT_MODEL;
    const apiUrl = env.AI_MODEL_URL || DEFAULT_API_URL(model);

    const prompt = buildPrompt(name);
    const { base64, mime } = await callGeminiImage(apiUrl, apiKey, prompt);
    const imageUrl = `data:${mime};base64,${base64}`;

    return new Response(
      JSON.stringify({ image_url: imageUrl, style: style || "food_poster" }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || "未知错误" }), { status: 500 });
  }
};
