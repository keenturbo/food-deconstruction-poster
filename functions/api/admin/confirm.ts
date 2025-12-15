export interface Env {
  ORDERS_KV: KVNamespace;
  ADMIN_PASSWORD?: string;
}

type OrderStatus = "pending" | "confirmed" | "rejected";

type OrderRecord = {
  id: string;
  status: OrderStatus;

  foodName?: string;
  style?: string;

  payMethod?: string;
  remark?: string;
  orderCode?: string;

  ip?: string;
  ua?: string;

  createdAt?: string;
  confirmedAt?: string;
  rejectedAt?: string;
};

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX = 120;

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

function getAdminPasswordFromRequest(request: Request, url: URL, bodyPassword: string) {
  const header = request.headers.get("x-admin-password");
  if (header && header.trim()) return header.trim();

  const auth = request.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }

  const qp = url.searchParams.get("password");
  if (qp && qp.trim()) return qp.trim();

  if (bodyPassword && bodyPassword.trim()) return bodyPassword.trim();

  return "";
}

async function rateLimitOrThrow(env: Env, key: string) {
  const current = await env.ORDERS_KV.get(key);
  const count = current ? Number.parseInt(current, 10) : 0;
  const next = Number.isFinite(count) ? count + 1 : 1;

  if (next > RATE_LIMIT_MAX) {
    throw new Response(JSON.stringify({ success: false, error: "请求过于频繁，请稍后再试" }), {
      status: 429,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  await env.ORDERS_KV.put(key, String(next), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS });
}

function safeParseOrder(raw: string | null): OrderRecord | null {
  if (!raw) return null;
  try {
    const order = JSON.parse(raw) as OrderRecord;
    if (!order || typeof order !== "object") return null;
    if (!order.id || !order.status) return null;
    return order;
  } catch {
    return null;
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!env.ORDERS_KV) {
    return json({ success: false, error: "缺少 ORDERS_KV 绑定" }, { status: 500 });
  }

  const adminPassword = (env.ADMIN_PASSWORD || "").trim();
  if (!adminPassword) {
    return json({ success: false, error: "缺少 ADMIN_PASSWORD" }, { status: 500 });
  }

  const ip = getClientIp(request);

  try {
    await rateLimitOrThrow(env, `rl:admin:confirm:${ip}`);

    const url = new URL(request.url);

    let body: any = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    const orderId = clampText(body?.orderId || body?.id || "", 80);
    const bodyPassword = clampText(body?.password || "", 200);

    const provided = getAdminPasswordFromRequest(request, url, bodyPassword);
    if (!provided || provided !== adminPassword) {
      return json({ success: false, error: "未授权" }, { status: 401 });
    }

    if (!orderId) {
      return json({ success: false, error: "缺少 orderId" }, { status: 400 });
    }

    const key = `order:${orderId}`;
    const raw = await env.ORDERS_KV.get(key);
    const order = safeParseOrder(raw);

    if (!order) {
      return json({ success: false, error: "订单不存在" }, { status: 404 });
    }

    if (order.status === "confirmed") {
      return json({ success: true, message: "订单已确认", orderId: order.id, status: order.status });
    }

    if (order.status !== "pending") {
      return json({ success: false, error: `订单状态不允许确认: ${order.status}` }, { status: 400 });
    }

    order.status = "confirmed";
    order.confirmedAt = new Date().toISOString();

    await env.ORDERS_KV.put(key, JSON.stringify(order));

    return json({ success: true, orderId: order.id, status: order.status, confirmedAt: order.confirmedAt });
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
      "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Admin-Password",
      "Access-Control-Max-Age": "86400",
    },
  });
};