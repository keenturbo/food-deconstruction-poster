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
      responseMimeType: "image/png",
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
  const partWithInline = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
  const inline = partWithInline?.inlineData;
  if (!inline?.data) throw new Error("Gemini 响应缺少图片数据");
  const mime = inline.mimeType || "image/png";
  return { base64: inline.data as string, mime };
}

function buildPrompt(foodName: string) {
  const name = foodName.trim();
  return `Premium commercial food poster featuring deconstructed layers of ${name} floating in a vertical stack on a pure black background (#000000).

**Background Design:**
- Massive, translucent background text '${name}' in an appropriate cultural font (Chinese Calligraphy for CN dishes, Bold Sans for western dishes) at 15% opacity.

**The Deconstructed Stack (Top to Bottom):**
1) Layer 1 (Garnish/Top): choose specific garnish matching ${name}. Particles frozen in mid-air, sharp focus.
2) Layer 2 (Secondary/Veg): vivid secondary ingredient.
3) Layer 3 (Core Protein/Filling): main ingredient with visible texture (glistening fat, sear marks, juicy interior).
4) Layer 4 (Base/Carb): base ingredient with clear structure and texture (fluffy, al dente, golden brown).
5) Layer 5 (Liquid/Sauce): dynamic splash of the sauce/broth, glossy and translucent.
6) Transition Gap: empty space with subtle steam/oil droplets/crumbs drifting.
7) Layer 7 (The Reveal): a plated, finished ${name} in a vessel, hot and appetizing.

**Details:**
- Chinese/English bilingual labels with thin lines pointing to each layer.
- Lighting: dramatic 45-degree studio light, rim lights on edges.
- Perspective: consistent 45-degree angle, no pedestal.
- Output: 8k resolution, ultra-realistic food photography.`;
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
