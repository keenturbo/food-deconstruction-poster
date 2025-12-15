/* public/payment-modal.js */
/* Global: PaymentModal */

const PaymentModal = (function () {
  const defaultConfig = {
    price: "5",
    currency: "¥",

    wechatQR: "",
    alipayQR: "",
    enableHongbao: true,

    apiGenerateOrder: "/api/generate-order",
    apiSubmitOrder: "/api/order",
    apiOrderStatus: "/api/order-status",

    onSuccess: null,
    onError: null,
    onClose: null,

    texts: {
      title: "扫码付款",
      subtitle: "付款后手动确认，确认后显示图片",
      wechatTab: "微信",
      alipayTab: "支付宝",
      hongbaoTab: "口令红包",
      orderLabel: "订单号",
      orderHint: "付款时请备注订单号（或按页面提示填写）",
      confirmBtn: "已完成付款",
      cancelBtn: "取消",
      mobileTip: "手机：长按二维码保存 → 打开对应 App 扫码支付",
      switchTip: "微信无法备注可切换支付宝；也可用口令红包",
      loadingOrder: "生成订单号…",
      orderFailed: "订单号获取失败",
      submitFailed: "订单提交失败",
      networkError: "网络错误",
      hongbaoLabel: "口令红包口令",
      hongbaoPlaceholder: "粘贴口令红包口令",
      hongbaoSteps:
        "1) 打开支付宝搜索「口令红包」\n2) 发一个对应金额的口令红包\n3) 复制口令，粘贴到下方\n4) 点击「已完成付款」提交",
    },
  };

  let config = {};
  let modalElement = null;
  let currentData = {};
  let currentOrderCode = "";
  let currentPayMethod = "wechat";

  function init(userConfig = {}) {
    config = { ...defaultConfig, ...userConfig };
    config.texts = { ...defaultConfig.texts, ...(userConfig.texts || {}) };

    if (!modalElement) {
      createModal();
      bindEvents();
    }

    hydrateStaticContent();
  }

  function hydrateStaticContent() {
    if (!modalElement) return;

    const title = modalElement.querySelector(".pm-title");
    const subtitle = modalElement.querySelector(".pm-subtitle");
    const price = modalElement.querySelector(".pm-price");

    if (title) title.textContent = config.texts.title;
    if (subtitle) subtitle.textContent = config.texts.subtitle;
    if (price) price.textContent = `${config.currency}${config.price}`;

    const tabs = modalElement.querySelector(".pm-tabs");
    if (tabs) {
      tabs.innerHTML = buildTabsHtml();
    }

    const contentWrap = modalElement.querySelector(".pm-contents");
    if (contentWrap) {
      contentWrap.innerHTML = buildContentsHtml();
    }

    const tip = modalElement.querySelector(".pm-switch-tip");
    if (tip) tip.textContent = config.texts.switchTip;

    const cancelBtn = modalElement.querySelector(".pm-btn-cancel");
    const confirmBtn = modalElement.querySelector(".pm-btn-confirm");
    if (cancelBtn) cancelBtn.textContent = config.texts.cancelBtn;
    if (confirmBtn) confirmBtn.textContent = config.texts.confirmBtn;
  }

  function buildTabsHtml() {
    const tabs = [];

    if (config.wechatQR) {
      tabs.push(
        `<button type="button" class="pm-tab pm-tab-wechat" data-method="wechat">${escapeHtml(
          config.texts.wechatTab,
        )}</button>`,
      );
    }

    if (config.alipayQR) {
      tabs.push(
        `<button type="button" class="pm-tab pm-tab-alipay" data-method="alipay">${escapeHtml(
          config.texts.alipayTab,
        )}</button>`,
      );
    }

    if (config.enableHongbao) {
      tabs.push(
        `<button type="button" class="pm-tab pm-tab-hongbao" data-method="hongbao">${escapeHtml(
          config.texts.hongbaoTab,
        )}</button>`,
      );
    }

    return tabs.join("");
  }

  function buildContentsHtml() {
    const blocks = [];

    if (config.wechatQR) {
      blocks.push(`
        <div id="pmPayWechat" class="pm-content" data-method="wechat">
          <div class="pm-qrcode"><img src="${escapeAttr(config.wechatQR)}" alt="wechat"></div>
          <div class="pm-mobile-tip">${escapeHtml(config.texts.mobileTip)}</div>
        </div>
      `);
    }

    if (config.alipayQR) {
      blocks.push(`
        <div id="pmPayAlipay" class="pm-content" data-method="alipay">
          <div class="pm-qrcode"><img src="${escapeAttr(config.alipayQR)}" alt="alipay"></div>
          <div class="pm-mobile-tip">${escapeHtml(config.texts.mobileTip)}</div>
        </div>
      `);
    }

    if (config.enableHongbao) {
      blocks.push(`
        <div id="pmPayHongbao" class="pm-content" data-method="hongbao">
          <div class="pm-hongbao-steps">${escapeHtml(config.texts.hongbaoSteps).replace(/\n/g, "<br>")}</div>
          <div class="pm-hongbao-input">
            <label for="pmHongbaoCode">${escapeHtml(config.texts.hongbaoLabel)}</label>
            <input type="text" id="pmHongbaoCode" placeholder="${escapeAttr(
              config.texts.hongbaoPlaceholder,
            )}" maxlength="80">
          </div>
        </div>
      `);
    }

    return blocks.join("");
  }

  function createModal() {
    const html = `
      <div id="paymentModalOverlay" class="pm-overlay" aria-hidden="true">
        <div class="pm-modal" role="dialog" aria-modal="true" aria-label="payment-modal">
          <div class="pm-header">
            <div class="pm-title">${escapeHtml(defaultConfig.texts.title)}</div>
            <div class="pm-subtitle" style="margin-top:6px; font-size:12px; color: rgba(247,247,251,0.68);">
              ${escapeHtml(defaultConfig.texts.subtitle)}
            </div>
            <div class="pm-price" style="margin-top:10px;">${escapeHtml(
              `${defaultConfig.currency}${defaultConfig.price}`,
            )}</div>
          </div>

          <div class="pm-tabs"></div>
          <div class="pm-contents"></div>

          <div id="pmOrderSection" class="pm-order-section">
            <div class="pm-order-label">${escapeHtml(defaultConfig.texts.orderLabel)}</div>
            <div class="pm-order-code" id="pmOrderCode">${escapeHtml(defaultConfig.texts.loadingOrder)}</div>
            <div class="pm-order-hint">${escapeHtml(defaultConfig.texts.orderHint)}</div>
          </div>

          <div class="pm-switch-tip"></div>

          <div class="pm-btn-group">
            <button type="button" class="pm-btn pm-btn-cancel">${escapeHtml(
              defaultConfig.texts.cancelBtn,
            )}</button>
            <button type="button" class="pm-btn pm-btn-confirm">${escapeHtml(
              defaultConfig.texts.confirmBtn,
            )}</button>
          </div>
        </div>
      </div>
    `;

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container.firstElementChild);
    modalElement = document.getElementById("paymentModalOverlay");
  }

  function bindEvents() {
    if (!modalElement) return;

    modalElement.addEventListener("click", (e) => {
      if (e.target === modalElement) close();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modalElement.classList.contains("active")) {
        close();
      }
    });

    const cancelBtn = modalElement.querySelector(".pm-btn-cancel");
    const confirmBtn = modalElement.querySelector(".pm-btn-confirm");

    if (cancelBtn) cancelBtn.addEventListener("click", close);
    if (confirmBtn) confirmBtn.addEventListener("click", confirm);

    modalElement.addEventListener("click", (e) => {
      const tab = e.target.closest(".pm-tab");
      if (!tab) return;
      const method = tab.getAttribute("data-method") || "";
      if (method) switchTab(method);
    });
  }

  function getDefaultMethod() {
    if (config.wechatQR) return "wechat";
    if (config.alipayQR) return "alipay";
    return "hongbao";
  }

  function switchTab(method) {
    currentPayMethod = method;

    const tabs = modalElement.querySelectorAll(".pm-tab");
    tabs.forEach((t) => t.classList.remove("active"));
    const activeTab = modalElement.querySelector(`.pm-tab[data-method="${cssEscape(method)}"]`);
    if (activeTab) activeTab.classList.add("active");

    const contents = modalElement.querySelectorAll(".pm-content");
    contents.forEach((c) => c.classList.remove("active"));
    const activeContent = modalElement.querySelector(`.pm-content[data-method="${cssEscape(method)}"]`);
    if (activeContent) activeContent.classList.add("active");

    const orderSection = modalElement.querySelector("#pmOrderSection");
    if (orderSection) {
      orderSection.style.display = method === "hongbao" ? "none" : "block";
    }
  }

  async function open(data = {}) {
    currentData = { ...(data || {}) };

    hydrateStaticContent();
    modalElement.classList.add("active");
    modalElement.setAttribute("aria-hidden", "false");

    const orderCodeEl = modalElement.querySelector("#pmOrderCode");
    if (orderCodeEl) orderCodeEl.textContent = config.texts.loadingOrder;

    const initialMethod = getDefaultMethod();
    switchTab(initialMethod);

    const hb = modalElement.querySelector("#pmHongbaoCode");
    if (hb) hb.value = "";

    currentOrderCode = "";

    const orderCode = await generateOrderCode(currentData);
    currentOrderCode = orderCode;

    if (orderCodeEl) orderCodeEl.textContent = orderCode || config.texts.orderFailed;
  }

  function close() {
    if (!modalElement) return;
    modalElement.classList.remove("active");
    modalElement.setAttribute("aria-hidden", "true");
    if (typeof config.onClose === "function") config.onClose();
  }

  async function generateOrderCode(data) {
    try {
      const resp = await fetch(config.apiGenerateOrder, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data || {}),
      });

      const result = await safeJson(resp);
      if (resp.ok && result && result.success && result.orderCode) {
        return String(result.orderCode).trim();
      }
    } catch {
      // ignore
    }

    // local fallback
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    const bytes = new Uint8Array(ORDER_CODE_LENGTH);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < ORDER_CODE_LENGTH; i++) {
      code += chars.charAt(bytes[i] % chars.length);
    }
    return code;
  }

  async function confirm() {
    const confirmBtn = modalElement.querySelector(".pm-btn-confirm");
    if (confirmBtn) confirmBtn.disabled = true;

    const payload = { ...(currentData || {}) };

    let remark = "";
    let orderCode = "";

    if (currentPayMethod === "hongbao") {
      const hb = modalElement.querySelector("#pmHongbaoCode");
      const hbCode = hb ? String(hb.value || "").trim() : "";
      if (!hbCode) {
        if (confirmBtn) confirmBtn.disabled = false;
        if (typeof config.onError === "function") config.onError("请填写口令红包口令");
        return;
      }
      remark = `口令:${hbCode}`;
      orderCode = "";
    } else {
      remark = currentOrderCode;
      orderCode = currentOrderCode;
    }

    payload.payMethod = currentPayMethod;
    payload.remark = remark;
    payload.orderCode = orderCode;

    try {
      const resp = await fetch(config.apiSubmitOrder, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await safeJson(resp);

      if (resp.ok && result && result.success) {
        close();
        if (typeof config.onSuccess === "function") {
          config.onSuccess({
            orderId: result.orderId,
            status: result.status,
            orderCode: currentOrderCode,
            payMethod: currentPayMethod,
            data: currentData,
            result,
          });
        }
      } else {
        const msg = (result && (result.message || result.error)) || config.texts.submitFailed;
        if (typeof config.onError === "function") config.onError(String(msg));
      }
    } catch {
      if (typeof config.onError === "function") config.onError(config.texts.networkError);
    } finally {
      if (confirmBtn) confirmBtn.disabled = false;
    }
  }

  async function getOrderStatus(params) {
    const qs = new URLSearchParams(params || {}).toString();
    const url = qs ? `${config.apiOrderStatus}?${qs}` : config.apiOrderStatus;

    const resp = await fetch(url, { method: "GET" });
    const result = await safeJson(resp);
    if (!resp.ok) throw new Error((result && (result.error || result.message)) || "status failed");
    return result;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/`/g, "&#096;");
  }

  function cssEscape(s) {
    return String(s ?? "").replace(/"/g, '\\"');
  }

  async function safeJson(resp) {
    try {
      return await resp.json();
    } catch {
      return null;
    }
  }

  return {
    init,
    open,
    close,
    switchTab,
    getOrderStatus,
    getConfig: () => config,
  };
})();

if (typeof window !== "undefined") {
  window.PaymentModal = PaymentModal;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = PaymentModal;
}

var ORDER_CODE_LENGTH = 5;