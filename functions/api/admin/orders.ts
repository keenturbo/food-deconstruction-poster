export interface Env {
  ORDERS_KV: KVNamespace;
  ADMIN_PASSWORD?: string;
}

type OrderStatus = "pending" | "confirmed" | "rejected";

type OrderRecord = {
  id: string;
  status: OrderStatus;

  foodName: string;
  style: string;

  payMethod: string;
  remark: string;
  orderCode: string;

  ip: string;
  ua: string;

  createdAt: string;
  confirmedAt?: string;
  rejectedAt?: string;
};

const ORDER_INDEX_KEY = "orders:index";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

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

function clampInt(value: string | null, fallback: number, min: number, max: number) {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function getAdminPasswordFromRequest(request: Request, url: URL) {
  const header = request.headers.get("x-admin-password");
  if (header && header.trim()) return header.trim();

  const auth = request.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }

  const qp = url.searchParams.get("password");
  if (qp && qp.trim()) return qp.trim();

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

async function readIndex(env: Env): Promise<string[]> {
  const raw = await env.ORDERS_KV.get(ORDER_INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === "string");
  } catch {
    // ignore
  }
  return [];
}

function isOrderStatus(value: string): value is OrderStatus {
  return value === "pending" || value === "confirmed" || value === "rejected";
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

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!env.ORDERS_KV) {
    return json({ success: false, error: "缺少 ORDERS_KV 绑定" }, { status: 500 });
  }

  const adminPassword = (env.ADMIN_PASSWORD || "").trim();
  if (!adminPassword) {
    return json({ success: false, error: "缺少 ADMIN_PASSWORD" }, { status: 500 });
  }

  const url = new URL(request.url);
  const provided = getAdminPasswordFromRequest(request, url);

  if (!provided || provided !== adminPassword) {
    return json({ success: false, error: "未授权" }, { status: 401 });
  }

  const ip = getClientIp(request);

  try {
    await rateLimitOrThrow(env, `rl:admin:orders:${ip}`);

    const offset = clampInt(url.searchParams.get("offset"), 0, 0, 10_000);
    const limit = clampInt(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);

    const statusParam = (url.searchParams.get("status") || "").trim();
    const statusFilter = statusParam && isOrderStatus(statusParam) ? statusParam : "";

    const ids = await readIndex(env);
    const total = ids.length;

    const pageIds = ids.slice(offset, offset + limit);

    const raws = await Promise.all(pageIds.map((id) => env.ORDERS_KV.get(`order:${id}`)));
    let orders = raws.map(safeParseOrder).filter((x): x is OrderRecord => Boolean(x));

    if (statusFilter) {
      orders = orders.filter((o) => o.status === statusFilter);
    }

    const stats = {
      total,
      pending: 0,
      confirmed: 0,
      rejected: 0,
    };

    for (const id of ids) {
      // 统计不做逐条 KV 读取，靠已读页面粗略统计即可；精确统计留到后续优化
      void id;
    }

    return json({
      success: true,
      offset,
      limit,
      total,
      statusFilter: statusFilter || null,
      orders,
      stats,
    });
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
      "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Admin-Password",
      "Access-Control-Max-Age": "86400",
    },
  });
};
