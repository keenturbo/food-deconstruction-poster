export interface Env {
  ORDERS_KV: KVNamespace;
  BARK_KEY?: string;
  ADMIN_PASSWORD?: string;
  SITE_URL?: string;
}

type PayMethod = "wechat" | "alipay" | "hongbao";

type OrderStatus = "pending" | "confirmed" | "rejected";

type CreateOrderBody = {
  food_name?: string;
  character_name?: string;
  foodName?: string;
  style?: string;

  payMethod?: PayMethod;
  remark?: string;
  orderCode?: string;

  customKeyProvided?: boolean;
};

type OrderRecord = {
  id: string;
  status: OrderStatus;

  foodName: string;
  style: string;

  payMethod: PayMethod;
  remark: string;
  orderCode: string;

  ip: string;
  ua: string;

  createdAt: string;
  confirmedAt?: string;
  rejectedAt?: string;
};

const ORDER_CODE_LENGTH = 5;
const ORDER_INDEX_KEY = "orders:index";
const ORDER_INDEX_MAX = 200;

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX = 3;

const ORDERCODE_CONSUMED_TTL_SECONDS = 60 * 60 * 24 * 30;

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
      JSON.stringify({ success: false, error: "提交过于频繁，请稍后再试" }),
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
  url += `?group=${encodeURIComponent("Orders")}`;
  url += `&sound=${encodeURIComponent("minuet")}`;
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

async function writeIndex(env: Env, ids: string[]) {
  const sliced = ids.slice(0, ORDER_INDEX_MAX);
  await env.ORDERS_KV.put(ORDER_INDEX_KEY, JSON.stringify(sliced));
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!env.ORDERS_KV) {
    return json({ success: false, error: "缺少 ORDERS_KV 绑定" }, { status: 500 });
  }

  const ip = getClientIp(request);
  const ua = clampText(request.headers.get("user-agent"), 200);

  try {
    await rateLimitOrThrow(env, `rl:order:${ip}`);

    let body: CreateOrderBody;
    try {
      body = (await request.json()) as CreateOrderBody;
    } catch {
      return json({ success: false, error: "请求体必须是 JSON" }, { status: 400 });
    }

    const foodName = clampText(body.food_name || body.character_name || body.foodName, 40);
    const style = clampText(body.style || "food_poster", 40);

    const payMethod = (clampText(body.payMethod || "wechat", 20) as PayMethod) || "wechat";
    const remark = clampText(body.remark || "", 80);

    const rawOrderCode = clampText(body.orderCode || "", 20);
    const orderCode = rawOrderCode.trim().toUpperCase();

    if (!foodName) {
      return json({ success: false, error: "缺少美食名称" }, { status: 400 });
    }

    if (payMethod !== "wechat" && payMethod !== "alipay" && payMethod !== "hongbao") {
      return json({ success: false, error: "payMethod 不合法" }, { status: 400 });
    }

    if (payMethod === "hongbao") {
      if (!remark || remark.length < 3) {
        return json({ success: false, error: "口令红包方式必须填写 remark（口令）" }, { status: 400 });
      }
    } else {
      if (!isValidOrderCode(orderCode)) {
        return json({ success: false, error: "缺少或无效的 orderCode" }, { status: 400 });
      }
    }

    if (orderCode) {
      const existing = await env.ORDERS_KV.get(`orderbycode:${orderCode}`);
      if (existing) {
        return json({ success: false, error: "该订单号已提交，请勿重复提交" }, { status: 409 });
      }
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const record: OrderRecord = {
      id,
      status: "pending",
      foodName,
      style,
      payMethod,
      remark,
      orderCode,
      ip,
      ua,
      createdAt: now,
    };

    await env.ORDERS_KV.put(`order:${id}`, JSON.stringify(record));

    if (orderCode) {
      await env.ORDERS_KV.put(`orderbycode:${orderCode}`, id, { expirationTtl: ORDERCODE_CONSUMED_TTL_SECONDS });

      const reservedKey = `ordercode:${orderCode}`;
      const reservedRaw = await env.ORDERS_KV.get(reservedKey);
      if (reservedRaw) {
        try {
          const reserved = JSON.parse(reservedRaw);
          reserved.orderId = id;
          reserved.consumedAt = now;
          await env.ORDERS_KV.put(reservedKey, JSON.stringify(reserved), {
            expirationTtl: ORDERCODE_CONSUMED_TTL_SECONDS,
          });
        } catch {
          await env.ORDERS_KV.put(
            reservedKey,
            JSON.stringify({ orderCode, orderId: id, consumedAt: now }),
            { expirationTtl: ORDERCODE_CONSUMED_TTL_SECONDS },
          );
        }
      }
    }

    const index = await readIndex(env);
    index.unshift(id);
    await writeIndex(env, index);

    const pendingCount = index.length;

    const barkTitle = "💰 新订单待确认";
    const barkBody = `美食: ${foodName}\n订单号: ${orderCode || "-"}\n方式: ${payMethod}\n备注: ${remark || "-"}`;

    await sendBark(env, request, barkTitle, barkBody);

    return json({ success: true, orderId: id, status: "pending" });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return json({ success: false, error: err?.message || "Internal Server Error" }, { status: 500 });
  }
};