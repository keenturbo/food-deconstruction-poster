export interface Env {
  ORDERS_KV: KVNamespace;
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

const ORDER_CODE_LENGTH = 5;

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX = 60;

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

function isValidOrderCode(code: string) {
  const s = code.trim().toUpperCase();
  if (s.length !== ORDER_CODE_LENGTH) return false;
  return /^[A-Z0-9]+$/.test(s);
}

async function rateLimitOrThrow(env: Env, key: string) {
  const current = await env.ORDERS_KV.get(key);
  const count = current ? Number.parseInt(current, 10) : 0;
  const next = Number.isFinite(count) ? count + 1 : 1;

  if (next > RATE_LIMIT_MAX) {
    throw new Response(
      JSON.stringify({ success: false, error: "请求过于频繁，请稍后再试" }),
      {
        status: 429,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }

  await env.ORDERS_KV.put(key, String(next), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS });
}

function pickPublicFields(order: OrderRecord) {
  return {
    orderId: order.id,
    status: order.status,
    createdAt: order.createdAt,
    confirmedAt: order.confirmedAt,
    rejectedAt: order.rejectedAt,
  };
}

async function resolveOrderId(env: Env, url: URL) {
  const orderId = (url.searchParams.get("orderId") || url.searchParams.get("id") || "").trim();
  if (orderId) return orderId;

  const orderCode = (url.searchParams.get("orderCode") || "").trim().toUpperCase();
  if (!orderCode) return "";

  if (!isValidOrderCode(orderCode)) return "";

  const mapped = await env.ORDERS_KV.get(`orderbycode:${orderCode}`);
  return (mapped || "").trim();
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!env.ORDERS_KV) {
    return json({ success: false, error: "缺少 ORDERS_KV 绑定" }, { status: 500 });
  }

  const ip = getClientIp(request);

  try {
    await rateLimitOrThrow(env, `rl:order-status:${ip}`);

    const url = new URL(request.url);
    const orderId = await resolveOrderId(env, url);

    if (!orderId) {
      return json({ success: false, error: "缺少 orderId（或有效 orderCode）" }, { status: 400 });
    }

    const raw = await env.ORDERS_KV.get(`order:${orderId}`);
    if (!raw) {
      return json({ success: false, error: "订单不存在" }, { status: 404 });
    }

    let order: OrderRecord;
    try {
      order = JSON.parse(raw) as OrderRecord;
    } catch {
      return json({ success: false, error: "订单数据损坏" }, { status: 500 });
    }

    if (!order?.id || !order?.status) {
      return json({ success: false, error: "订单数据不完整" }, { status: 500 });
    }

    return json({ success: true, ...pickPublicFields(order) });
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
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
};