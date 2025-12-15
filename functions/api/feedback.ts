export interface Env {
  ORDERS_KV: KVNamespace;
  BARK_KEY?: string;
  SITE_URL?: string;
}

type FeedbackBody = {
  orderId?: string;
  foodName?: string;
  contact?: string;
  message?: string;
};

type FeedbackRecord = {
  id: string;
  orderId: string;
  foodName: string;
  contact: string;
  message: string;
  ip: string;
  createdAt: string;
};

const FEEDBACK_INDEX_KEY = "feedback:index";
const FEEDBACK_INDEX_MAX = 100;

const RATE_LIMIT_WINDOW_SECONDS = 300;
const RATE_LIMIT_MAX = 3;

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

function clampText(value: unknown, maxLen: number) {
  return String(value ?? "").trim().slice(0, maxLen);
}

async function rateLimitOrThrow(env: Env, key: string) {
  const current = await env.ORDERS_KV.get(key);
  const count = current ? Number.parseInt(current, 10) : 0;
  const next = Number.isFinite(count) ? count + 1 : 1;

  if (next > RATE_LIMIT_MAX) {
    throw new Response(
      JSON.stringify({ success: false, error: "反馈过于频繁，请稍后再试" }),
      {
        status: 429,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }

  await env.ORDERS_KV.put(key, String(next), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS });
}

async function sendBark(env: Env, request: Request, title: string, body: string) {
  const barkKey = (env.BARK_KEY || "").trim();
  if (!barkKey) return;

  let adminUrl = "";
  try {
    const origin = new URL(request.url).origin;
    adminUrl = `${origin}/admin.html`;
  } catch {
    adminUrl = (env.SITE_URL || "").trim();
    if (adminUrl && !adminUrl.endsWith("/admin.html")) {
      adminUrl = adminUrl.replace(/\/$/, "") + "/admin.html";
    }
  }

  const base = `https://api.day.app/${encodeURIComponent(barkKey)}`;
  let url = `${base}/${encodeURIComponent(title)}/${encodeURIComponent(body)}`;
  url += `?group=${encodeURIComponent("Feedback")}`;
  url += `&sound=${encodeURIComponent("bell")}`;
  if (adminUrl) {
    url += `&url=${encodeURIComponent(adminUrl)}`;
  }

  try {
    await fetch(url, { method: "GET" });
  } catch {
    // ignore
  }
}

async function readIndex(env: Env): Promise<string[]> {
  const raw = await env.ORDERS_KV.get(FEEDBACK_INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === "string");
  } catch {
    // ignore
  }
  return [];
}

async function writeIndex(env: Env, ids: string[]) {
  const sliced = ids.slice(0, FEEDBACK_INDEX_MAX);
  await env.ORDERS_KV.put(FEEDBACK_INDEX_KEY, JSON.stringify(sliced));
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!env.ORDERS_KV) {
    return json({ success: false, error: "缺少 ORDERS_KV 绑定" }, { status: 500 });
  }

  const ip = getClientIp(request);

  try {
    await rateLimitOrThrow(env, `rl:feedback:${ip}`);

    let body: FeedbackBody;
    try {
      body = (await request.json()) as FeedbackBody;
    } catch {
      return json({ success: false, error: "请求体必须是 JSON" }, { status: 400 });
    }

    const orderId = clampText(body.orderId, 80);
    const foodName = clampText(body.foodName, 40);
    const contact = clampText(body.contact, 100);
    const message = clampText(body.message, 200);

    if (!orderId) {
      return json({ success: false, error: "缺少订单ID" }, { status: 400 });
    }

    if (!contact) {
      return json({ success: false, error: "请填写联系方式" }, { status: 400 });
    }

    const existingFeedback = await env.ORDERS_KV.get(`feedback:order:${orderId}`);
    if (existingFeedback) {
      return json({ success: false, error: "该订单已反馈过，请勿重复提交" }, { status: 409 });
    }

    const orderRaw = await env.ORDERS_KV.get(`order:${orderId}`);
    if (!orderRaw) {
      return json({ success: false, error: "订单不存在" }, { status: 404 });
    }

    let order: any;
    try {
      order = JSON.parse(orderRaw);
    } catch {
      return json({ success: false, error: "订单数据异常" }, { status: 500 });
    }

    if (order.status !== "confirmed") {
      return json({ success: false, error: "订单未确认，无法反馈" }, { status: 400 });
    }

    const feedbackId = crypto.randomUUID();
    const now = new Date().toISOString();

    const record: FeedbackRecord = {
      id: feedbackId,
      orderId,
      foodName: foodName || order.foodName || "",
      contact,
      message,
      ip,
      createdAt: now,
    };

    await env.ORDERS_KV.put(`feedback:${feedbackId}`, JSON.stringify(record));
    await env.ORDERS_KV.put(`feedback:order:${orderId}`, feedbackId, { expirationTtl: 60 * 60 * 24 * 30 });

    const index = await readIndex(env);
    index.unshift(feedbackId);
    await writeIndex(env, index);

    const barkTitle = "⚠️ 用户反馈：图片生成失败";
    const barkBody = `订单ID: ${orderId}\n美食: ${record.foodName}\n联系方式: ${contact}\n留言: ${message || "无"}`;

    await sendBark(env, request, barkTitle, barkBody);

    return json({ success: true, feedbackId });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return json({ success: false, error: err?.message || "Internal Server Error" }, { status: 500 });
  }
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
};