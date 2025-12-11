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
  const localized = name;
  return `Generate one ultra-realistic PNG image only. Do not return text. Follow strictly:
# Role: Master Food Deconstructionist & Designer

# Task:
When the user provides a Food Name, analyze its **authentic recipe**, deconstruct it into 6 logical vertical layers, and generate a prompt for a premium commercial poster.

# Core Logic (The "Recipe-to-Visual" Process):
1.  **Analyze Recipe:** Identify the Garnish, Main Protein, Side/Veg, Base/Carb, Sauce/Broth.
2.  **Determine Culture:** Choose appropriate background typography (Chinese Calligraphy for CN food, Bold Sans for US food, etc.).
3.  **Describe Textures:** Don't just say "Beef". Say "Juicy, seared beef slices with visible muscle grain and fat marbling."

# Prompt Construction Template (For Image Generation):
"Premium commercial food poster featuring deconstructed layers of **${name}** floating in a vertical stack on a pure black background (#000000). 

    **Background Design:**
    - Massive, translucent background text **'${localized}'** in [Font Style: e.g., 'Chinese Calligraphy', 'Bold Sans'] (15% opacity) spans the height behind the ingredients.

    **The Deconstructed Stack (Top to Bottom):
    
    1) **Layer 1 (Garnish/Top):** A floating scatter of [Specific Garnish: e.g., 'crushed peanuts', 'chopped scallions', 'powdered sugar']. The particles are frozen in mid-air, sharp focus, showing distinct textures.
    
    2) **Layer 2 (Secondary/Veg):** [Secondary Ingredient: e.g., 'crispy pickled vegetables', 'fresh lettuce leaf', 'whipped cream']. Suspended in space, looking fresh and vibrant.
    
    3) **Layer 3 (The Core Protein/Filling):** [Main Ingredient: e.g., 'braised pork belly cubes', 'grilled beef patty']. Highly detailed, showing [Texture: 'glistening fat', 'sear marks', 'juicy interior'].
    
    4) **Layer 4 (The Base/Carb):** [Base Ingredient: e.g., 'hand-pulled noodles', 'toasted bun', 'sushi rice']. The structure is clearly visible, with [Texture: 'fluffy', 'al dente', 'golden brown'].
    
    5) **Layer 5 (Liquid/Sauce):** A dynamic splash or floating layer of [Sauce/Broth: e.g., 'spicy chili oil', 'melted cheese', 'soy sauce']. It is translucent, glossy, with light reflecting off the liquid curves.
    
    6) **Transition Gap:** A large EMPTY SPACE with only subtle [Atmosphere: 'steam wisps', 'oil droplets', 'crumbs'] drifting down.
    
    7) **Layer 7 (The Reveal):** A complete, finished **${name}** plated in a [Vessel]. It contains all the above ingredients combined perfectly. The dish looks freshly cooked, hot, and appetizing.

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
