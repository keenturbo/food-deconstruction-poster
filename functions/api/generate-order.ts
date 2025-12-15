export interface Env {
  ORDERS_KV: KVNamespace;
}

const ORDER_CODE_LENGTH = 5;
const ORDER_CODE_TTL_SECONDS = 60 * 60; // 1h 预留，防止撞码
const RATE_LIMIT_WINDOW_SECONDS = 60; // 60s
const RATE_LIMIT_MAX = 10; // 每 IP 每分钟最多生成 10 次订单号

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
    ...init,
  });
}

function getClientIp(request: Request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp && cfIp.trim()) return cfIp.trim();

  const xff = request.headers.get("x-forwarded-for");
  if (xff && xff.trim()) return xff.split(",")[0].trim();

  return "unknown";
}

function randomOrderCode(length: number) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉易混淆字符
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

async function rateLimitOrThrow(env: Env, key: string) {
  const current = await env.ORDERS_KV.get(key);
  const count = current ? Number.parseInt(current, 10) : 0;
  const next = Number.isFinite(count) ? count + 1 : 1;

  if (next > RATE_LIMIT_MAX) {
    throw new Response(
      JSON.stringify({
        success: false,
        error: "请求过于频繁，请稍后再试",
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }

  await env.ORDERS_KV.put(key, String(next), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!env.ORDERS_KV) {
    return json({ success: false, error: "缺少 ORDERS_KV 绑定" }, { status: 500 });
  }

  const ip = getClientIp(request);

  try {
    await rateLimitOrThrow(env, `rl:generate-order:${ip}`);

    let body: any = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    const foodNameRaw = (body?.food_name || body?.character_name || body?.foodName || "").toString();
    const styleRaw = (body?.style || "").toString();

    const foodName = foodNameRaw.trim().slice(0, 40);
    const style = styleRaw.trim().slice(0, 40);

    for (let attempt = 0; attempt < 12; attempt++) {
      const orderCode = randomOrderCode(ORDER_CODE_LENGTH);
      const key = `ordercode:${orderCode}`;

      const exists = await env.ORDERS_KV.get(key);
      if (exists) continue;

      const reserved = {
        orderCode,
        ip,
        foodName,
        style,
        createdAt: new Date().toISOString(),
      };

      await env.ORDERS_KV.put(key, JSON.stringify(reserved), {
        expirationTtl: ORDER_CODE_TTL_SECONDS,
      });

      return json({ success: true, orderCode });
    }

    return json({ success: false, error: "生成订单号失败，请重试" }, { status: 503 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return json({ success: false, error: err?.message || "Internal Server Error" }, { status: 500 });
  }
};