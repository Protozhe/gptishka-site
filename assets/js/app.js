// =========================
// PAGE TRANSITION - FIXED
// =========================

document.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.remove("is-leaving");

  const header = document.querySelector("header");
  if (!header) return;

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      header.classList.toggle("is-scrolled", window.scrollY > 10);
      ticking = false;
    });
  };

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
});

// "Resume activation" floating shortcut intentionally disabled by product request.
  
document.querySelectorAll("a[href]").forEach(link => {
    const href = link.getAttribute("href");
  
    if (
      !href ||
      href.includes("#") ||          // IMPORTANT
      href.startsWith("http") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:")
    ) return;
  
    link.addEventListener("click", e => {
      e.preventDefault();
  
      document.documentElement.classList.add("is-leaving");
  
      setTimeout(() => {
        window.location.href = href;
      }, 160);
    });
  });

(() => {
  const CART_KEY = "gptishka_cart_v1";
  const CARD_QTY_KEY = "gptishka_card_qty_v1";
  const CART_SELECTION_KEY = "selected_cart";
  const pricingGridEl = document.getElementById("pricingGrid");
  let cards = [];
  const cartListEl = document.getElementById("cartList");
  const cartEmptyEl = document.getElementById("cartEmpty");
  const cartTotalEl = document.getElementById("cartTotal");
  const cartCheckoutEl = document.getElementById("cartCheckoutBtn");
  const cartSectionEl = document.getElementById("cart");
  const headerCartEl = document.getElementById("headerCart");
  const headerCartTotalEl = document.getElementById("headerCartTotal");
  const headerCartCountEl = document.getElementById("headerCartCount");
  const headerCartPanelEl = document.getElementById("headerCartPanel");
  const headerCartPanelListEl = document.getElementById("headerCartPanelList");
  const headerCartPanelEmptyEl = document.getElementById("headerCartPanelEmpty");
  const headerCartPanelCountEl = document.getElementById("headerCartPanelCount");
  const headerCartPanelTotalEl = document.getElementById("headerCartPanelTotal");
  const headerCartPanelCheckoutBtnEl = document.getElementById("headerCartPanelCheckoutBtn");
  const headerCartPanelLinkEl = document.querySelector(".header-cart-panel__link");
  const headerCartPromoInputEl = document.getElementById("headerCartPromoInput");
  const headerCartPromoApplyEl = document.getElementById("headerCartPromoApply");
  const headerCartPromoMsgEl = document.getElementById("headerCartPromoMsg");
  const cartPromoInputEl = document.getElementById("cartPromoInput");
  const cartPromoApplyEl = document.getElementById("cartPromoApply");
  const cartPromoMsgEl = document.getElementById("cartPromoMsg");
  const headerCartEmailInputEl = document.getElementById("headerCartEmailInput");
  const cartEmailInputEl = document.getElementById("cartEmailInput");
  const isEnPage =
    String(document.documentElement.lang || "").toLowerCase().startsWith("en") ||
    window.location.pathname.startsWith("/en/");
  const numberLocale = isEnPage ? "en-US" : "ru-RU";
  const cartPagePath = isEnPage ? "/en/cart.html" : "/cart.html";
  const TEXT = isEnPage
    ? {
        promo10: "10% discount",
        promo5: "5% discount",
        badgeBest: "Best choice",
        badgeNew: "New",
        badgeHit: "Hit",
        badgeSale: "Sale",
        badgePopular: "Popular",
        badgeLimited: "Limited",
        badgeGift: "Bonus",
        badgePro: "Pro",
        pillAutoIssue: "Auto-issue",
        pillInstant: "Instant",
        pillWarranty: "Warranty",
        productsUnavailable: "Products are temporarily unavailable",
        payNow: "Pay",
        qtyDec: "Decrease quantity",
        qtyInc: "Increase quantity",
        metaAuto: "Automatic",
        metaSecure: "Secure",
        metaSupport: "24/7 support",
        panelCount: count => `${count} items`,
        promoApplied: (label, discountLabel) => `${label} applied (-${discountLabel})`,
        promoInvalid: "Promo code not found",
        promoChecking: "Checking promo code...",
        promoAccepted: "Promo code accepted. Final amount will be locked at checkout.",
        remove: "Remove",
        paymentFallback: "Order payment",
        cartCheckoutDesc: "Cart checkout",
        cartSummaryPrefix: "Cart: ",
        emailPlaceholder: "Email for order details",
        invalidEmail: "Please enter a valid email",
        checkoutError: "Failed to start checkout. Please try again.",
        checkoutProductMissing: "The selected item is outdated in cart. Please re-add it from pricing.",
        multiCartCheckout: "Checkout is currently available one item at a time. Please pay items separately.",
      }
    : {
        promo10: "Скидка 10%",
        promo5: "Скидка 5%",
        badgeBest: "Лучший выбор",
        badgeNew: "Новинка",
        badgeHit: "Хит",
        badgeSale: "Акция",
        badgePopular: "Популярно",
        badgeLimited: "Ограничено",
        badgeGift: "Бонус",
        badgePro: "Pro",
        pillAutoIssue: "Автовыдача",
        pillInstant: "Мгновенно",
        pillWarranty: "Гарантия",
        productsUnavailable: "Товары временно недоступны",
        payNow: "Оплатить",
        qtyDec: "Уменьшить количество",
        qtyInc: "Увеличить количество",
        metaAuto: "Автоматически",
        metaSecure: "Безопасно",
        metaSupport: "Поддержка 24/7",
        panelCount: count => `${count} поз.`,
        promoApplied: (label, discountLabel) => `${label} применена (-${discountLabel})`,
        promoInvalid: "Промокод не найден",
        promoChecking: "Проверяем промокод...",
        promoAccepted: "Промокод принят",
        remove: "Удалить",
        paymentFallback: "Оплата заказа",
        cartCheckoutDesc: "Оформление корзины",
        cartSummaryPrefix: "Корзина: ",
        emailPlaceholder: "Email для получения данных заказа",
        invalidEmail: "Введите корректный email",
        checkoutError: "Не удалось начать оплату. Попробуйте снова.",
        checkoutProductMissing: "Товар в корзине устарел. Добавьте его заново из тарифов.",
        multiCartCheckout: "Сейчас оплата доступна по одному товару. Оплатите позиции по отдельности.",
      };
  const PROMO_CODE_KEY = "gptishka_cart_promo_v1";
  let clickTimer = null;
  let activePromoCode = "";
  let promoValidationState = "idle"; // idle | checking | valid | invalid
  let promoDiscountAmount = 0;
  let promoValidationContextKey = "";

  function toInt(value) {
    const parsed = Number.parseInt(String(value || "").replace(/[^\d-]/g, ""), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function toAmount(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const normalized = String(value || "")
      .replace(/\s+/g, "")
      .replace(/,/g, ".")
      .replace(/[^\d.-]/g, "");
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatAmount(value) {
    const amount = Math.max(0, toAmount(value));
    const hasFraction = Math.abs(amount % 1) > 0.000001;
    return amount.toLocaleString(numberLocale, {
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: 2,
    });
  }

  function formatRub(value) {
    return formatAmount(value) + " RUB";
  }

  function formatPriceByCurrency(value, currency) {
    const amount = Math.max(0, toAmount(value));
    const c = String(currency || "RUB").toUpperCase();
    const symbol = c === "RUB" ? "RUB" : c;
    return formatAmount(amount) + " " + symbol;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function alignToHashTarget(behavior = "auto") {
    const hash = String(window.location.hash || "").trim();
    if (!hash || hash === "#") return;

    const targetId = decodeURIComponent(hash.slice(1));
    if (!targetId) return;

    const target = document.getElementById(targetId);
    if (!target) return;

    target.scrollIntoView({ behavior, block: "start" });
  }

  function refreshCards() {
    cards = Array.from(document.querySelectorAll(".price-card[data-product]"));
  }

  function resolveBadge(itemBadge, tags) {
    const direct = String(itemBadge || "").toLowerCase();
    const allowed = new Set(["best", "new", "hit", "sale", "popular", "limited", "gift", "pro"]);
    if (allowed.has(direct)) return direct;
    if (Array.isArray(tags)) {
      const fromTags = tags
        .map((tag) => String(tag || "").toLowerCase())
        .find((tag) => tag.startsWith("badge:"));
      if (fromTags) {
        const value = fromTags.split(":")[1] || "";
        if (allowed.has(value)) return value;
      }
    }
    return "";
  }

  function buildProductCard(item, index) {
    const product = String(item.product || item.id || "product_" + index).trim();
    const title = String(item.title || "Product").trim();
    const description = String(item.description || "").trim();
    const category = String(item.category || "").trim();
    const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];
    const displayTags = tags.filter(tag => !String(tag).startsWith("badge:"));
    const term = category || (displayTags[0] ? displayTags[0].toUpperCase() : "DIGITAL");
    const sub = displayTags.length ? displayTags.slice(0, 3).join(" • ") : description.slice(0, 90);
    const topHighlights = isEnPage
      ? [
          "⚡ Fast responses",
          "🧠 Help with tasks of any complexity",
          "🌍 Works in multiple languages",
          "💼 Useful for work and business",
          "🛠 Universal tool",
        ]
      : [
          "⚡ Мгновенные ответы",
          "🧠 Помощь в задачах любой сложности",
          "🌍 Работает на разных языках",
          "💼 Полезен для работы и бизнеса",
          "🛠 Универсальный инструмент",
        ];
    const topHighlightsHtml = topHighlights
      .map(line => '<div class="sub-top-line">' + escapeHtml(line) + "</div>")
      .join("");
    const price = Math.max(0, toAmount(item.price));
    const currency = String(item.currency || "RUB").toUpperCase();
    const badgeType = resolveBadge(item.badge, tags);
    const badgeLabelByType = {
      best: TEXT.badgeBest,
      new: TEXT.badgeNew,
      hit: TEXT.badgeHit,
      sale: TEXT.badgeSale,
      popular: TEXT.badgePopular,
      limited: TEXT.badgeLimited,
      gift: TEXT.badgeGift,
      pro: TEXT.badgePro,
    };
    const badge = badgeType
      ? '<span class="badge ' + escapeHtml(badgeType) + '">' + escapeHtml(badgeLabelByType[badgeType] || TEXT.badgeBest) + "</span>"
      : "";
    const features = (description ? description.split(/\r?\n|[.;]/).map(v => v.trim()).filter(Boolean) : [])
      .slice(0, 5)
      .map(v => {
        const normalized = String(v || "").toLowerCase();
        const isDuration = normalized.startsWith("продолжительность") || normalized.startsWith("duration");
        const liClass = isDuration ? "feature-line feature-duration" : "feature-line";
        return '<li class="' + liClass + '">&#10003; ' + escapeHtml(v) + "</li>";
      })
      .join("");
    const list = features ||
      "<li>&#10003; " + escapeHtml(TEXT.metaAuto) + "</li>" +
      "<li>&#10003; " + escapeHtml(TEXT.metaSecure) + "</li>" +
      "<li>&#10003; " + escapeHtml(TEXT.metaSupport) + "</li>";

    return (
      '<div class="price-card' + (badgeType === "best" ? " featured" : "") + '"' +
      ' data-product="' + escapeHtml(product) + '"' +
      ' data-product-id="' + escapeHtml(String(item.id || "")) + '"' +
      ' data-title="' + escapeHtml(title) + '"' +
      ' data-sub="' + escapeHtml(sub) + '"' +
      ' data-term="' + escapeHtml(term) + '"' +
      ' data-price="' + escapeHtml(price) + '"' +
      ' data-currency="' + escapeHtml(currency) + '">' +
      badge +
      "<h3>" + escapeHtml(title) + "</h3>" +
      '<div class="term">' + escapeHtml(term) + "</div>" +
      '<div class="sub sub-top-list">' + topHighlightsHtml + "</div>" +
      '<div class="price">' + escapeHtml(formatPriceByCurrency(price, currency)) + "</div>" +
      "<ul>" + list + "</ul>" +
      '<div class="price-actions">' +
      '<button type="button" class="buy-btn pay-now-btn" data-product="' + escapeHtml(product) + '" data-sub="' + escapeHtml(sub) + '" data-title="' + escapeHtml(title) + '" data-term="' + escapeHtml(term) + '" data-price="' + escapeHtml(price) + '" data-currency="' + escapeHtml(currency) + '">' + escapeHtml(TEXT.payNow) + "</button>" +
      "</div>" +
      '<div class="meta"><span>&#10003; ' + escapeHtml(TEXT.metaAuto) + "</span><span>&#10003; " + escapeHtml(TEXT.metaSecure) + "</span><span>&#10003; " + escapeHtml(TEXT.metaSupport) + "</span></div>" +
      "</div>"
    );
  }

  async function loadPricingCards() {
    if (!pricingGridEl) {
      refreshCards();
      return;
    }

    try {
      const response = await fetch("/api/public/products?lang=" + (isEnPage ? "en" : "ru"), { cache: "no-store" });
      if (!response.ok) throw new Error("Products API not available");
      const payload = await response.json();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      reconcileCartProductIds(items);

      if (!items.length) {
        pricingGridEl.innerHTML = '<div class="price-card"><h3>' + escapeHtml(TEXT.productsUnavailable) + "</h3></div>";
        refreshCards();
        return;
      }

      pricingGridEl.innerHTML = items.map((item, idx) => buildProductCard(item, idx)).join("");
      refreshCards();
      syncCards();
      renderCart();
      alignToHashTarget("auto");
    } catch (_) {
      refreshCards();
      syncCards();
      renderCart();
      alignToHashTarget("auto");
    }
  }

  function submitWebMoneyPayment(amount, description) {
    const numericAmount = Math.max(0, toAmount(amount));
    if (!numericAmount) return;

    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/payment/webmoney/pay.php";

    const amountInput = document.createElement("input");
    amountInput.type = "hidden";
    amountInput.name = "amount";
    amountInput.value = String(numericAmount);

    const descInput = document.createElement("input");
    descInput.type = "hidden";
    descInput.name = "description";
    descInput.value = String(description || TEXT.paymentFallback).slice(0, 240);

    form.appendChild(amountInput);
    form.appendChild(descInput);
    document.body.appendChild(form);
    form.submit();
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
  }

  function syncCheckoutEmailInputs() {
    const stored = String(localStorage.getItem("checkout_email") || "").trim().toLowerCase();
    if (headerCartEmailInputEl && !String(headerCartEmailInputEl.value || "").trim()) {
      headerCartEmailInputEl.value = stored;
    }
    if (cartEmailInputEl && !String(cartEmailInputEl.value || "").trim()) {
      cartEmailInputEl.value = stored;
    }
  }

  function markEmailInvalid(inputEl) {
    if (!inputEl) return;
    inputEl.classList.add("is-invalid");
    inputEl.focus();
    setTimeout(() => inputEl.classList.remove("is-invalid"), 1400);
  }

  function pickEmailCandidate() {
    const values = [
      String(headerCartEmailInputEl ? headerCartEmailInputEl.value : "").trim().toLowerCase(),
      String(cartEmailInputEl ? cartEmailInputEl.value : "").trim().toLowerCase(),
      String(localStorage.getItem("checkout_email") || "").trim().toLowerCase(),
    ].filter(Boolean);
    return values[0] || "";
  }

  function getCheckoutEmail() {
    const email = pickEmailCandidate();
    if (!isValidEmail(email)) {
      markEmailInvalid(headerCartEmailInputEl);
      markEmailInvalid(cartEmailInputEl);
      alert(TEXT.invalidEmail);
      return "";
    }

    localStorage.setItem("checkout_email", email);
    if (headerCartEmailInputEl) headerCartEmailInputEl.value = email;
    if (cartEmailInputEl) cartEmailInputEl.value = email;
    return email;
  }

  async function startBackendCheckout(item, qty, promoCode) {
    const checkoutItem = await ensureCheckoutItemProductId(item);
    if (!checkoutItem || !checkoutItem.productId) {
      throw new Error(TEXT.checkoutProductMissing);
    }

    persistCartSelection(undefined, promoCode || "");

    const email = getCheckoutEmail();
    if (!email) {
      alert(TEXT.invalidEmail);
      return;
    }

    const payload = {
      email,
      plan_id: checkoutItem.productId,
      qty: 1,
      promo_code: promoCode || undefined,
    };

    const response = await fetch("/api/payments/enot/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.pay_url) {
      throw new Error(data?.message || "Checkout init failed");
    }

    const checkoutUrl = String(data.pay_url);
    window.location.href = checkoutUrl;
  }

  function safeParse(raw, fallback) {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function normalizeCartRow(source, fallbackProduct = "") {
    if (!source || typeof source !== "object") return null;
    const product = String(source.product || fallbackProduct || "").trim();
    if (!product) return null;

    const lineId = String(source.lineId || source.id || ("lot_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10))).trim();
    const qty = 1;

    return {
      lineId,
      product,
      productId: String(source.productId || "").trim(),
      title: String(source.title || product).trim(),
      term: String(source.term || "").trim(),
      sub: String(source.sub || "").trim(),
      price: Math.max(0, toAmount(source.price)),
      currency: String(source.currency || "RUB").trim() || "RUB",
      qty,
    };
  }

  function loadCart() {
    try {
      const parsed = safeParse(localStorage.getItem(CART_KEY) || "[]", []);
      if (Array.isArray(parsed)) {
        const rows = parsed.map(row => normalizeCartRow(row)).filter(Boolean);
        if (rows.length !== parsed.length) saveCart(rows);
        return rows;
      }

      if (parsed && typeof parsed === "object") {
        const legacyRows = Object.entries(parsed)
          .map(([product, row]) => normalizeCartRow(row, product))
          .filter(Boolean);
        if (legacyRows.length) saveCart(legacyRows);
        return legacyRows;
      }

      return [];
    } catch (_) {
      return [];
    }
  }

  function saveCart(cart) {
    const rows = Array.isArray(cart) ? cart.map(row => normalizeCartRow(row)).filter(Boolean) : [];
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(rows));
    } catch (_) {
      // Ignore storage write errors.
    }
  }

  function loadCardQtyMap() {
    try {
      const parsed = safeParse(localStorage.getItem(CARD_QTY_KEY) || "{}", {});
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

      const next = {};
      Object.keys(parsed).forEach(product => {
        const key = String(product || "").trim();
        if (!key) return;
        next[key] = Math.max(1, toInt(parsed[product]) || 1);
      });
      return next;
    } catch (_) {
      return {};
    }
  }

  function saveCardQtyMap(cardQtyMap) {
    try {
      localStorage.setItem(CARD_QTY_KEY, JSON.stringify(cardQtyMap || {}));
    } catch (_) {
      // Ignore storage write errors.
    }
  }

  function loadPromoCode() {
    try {
      return String(localStorage.getItem(PROMO_CODE_KEY) || "").trim().toUpperCase();
    } catch (_) {
      return "";
    }
  }

  function savePromoCode(code) {
    try {
      if (code) localStorage.setItem(PROMO_CODE_KEY, code);
      else localStorage.removeItem(PROMO_CODE_KEY);
    } catch (_) {
      // Ignore storage write errors.
    }
  }

  function calculateDiscount(total, code) {
    const hasCode = String(code || "").trim().length > 0;
    if (!hasCode || promoValidationState !== "valid") return 0;
    const base = Math.max(0, toAmount(total));
    const discount = Math.max(0, toAmount(promoDiscountAmount));
    return Math.min(base, Number(discount.toFixed(2)));
  }

  async function validatePromoCodeViaBackend(code) {
    const normalized = String(code || "").trim().toUpperCase();
    if (!normalized) {
      promoValidationState = "idle";
      promoDiscountAmount = 0;
      promoValidationContextKey = "";
      renderCart();
      return;
    }

    const rows = loadCart().filter(row => row && row.lineId && row.product && toInt(row.qty) > 0);
    const first = rows[0];
    if (!first || !first.productId) {
      promoValidationState = "idle";
      promoDiscountAmount = 0;
      promoValidationContextKey = "";
      renderCart();
      return;
    }
    const qty = Math.max(1, toInt(first.qty) || 1);
    promoValidationContextKey = [normalized, String(first.productId || ""), qty].join("|");

    promoValidationState = "checking";
    renderCart();

    try {
      const response = await fetch("/api/promo/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: normalized,
          productId: first.productId,
          quantity: qty,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload && payload.valid) {
        promoValidationState = "valid";
        promoDiscountAmount = Math.max(0, toAmount(payload.discountAmount));
      } else {
        promoValidationState = "invalid";
        promoDiscountAmount = 0;
      }
    } catch (_) {
      promoValidationState = "invalid";
      promoDiscountAmount = 0;
    }

    renderCart();
  }

  function applyPromoMessageState(el, state) {
    if (!el) return;
    el.classList.remove("is-error", "is-success");
    if (state === "invalid") el.classList.add("is-error");
    if (state === "valid") el.classList.add("is-success");
  }

  function getCardItem(card) {
    if (!card) return null;
    const product = String(card.getAttribute("data-product") || "").trim();
    if (!product) return null;

    const h3 = card.querySelector("h3");
    const term = card.querySelector(".term");
    const sub = card.querySelector(".sub");
    const priceNode = card.querySelector(".price");

    const item = {
      product,
      productId: String(card.getAttribute("data-product-id") || "").trim(),
      title: String(card.getAttribute("data-title") || (h3 ? h3.innerText : "")).replace(/\s+/g, " ").trim(),
      term: String(card.getAttribute("data-term") || (term ? term.innerText : "")).replace(/\s+/g, " ").trim(),
      sub: String(card.getAttribute("data-sub") || (sub ? sub.innerText : "")).replace(/\s+/g, " ").trim(),
      price: toAmount(card.getAttribute("data-price") || (priceNode ? priceNode.innerText : "")),
      currency: String(card.getAttribute("data-currency") || "RUB").trim() || "RUB",
    };

    return item;
  }

  function normalizeLookup(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function buildProductLookup(items) {
    const byProduct = new Map();
    const byTitle = new Map();
    if (!Array.isArray(items)) return { byProduct, byTitle };

    items.forEach(item => {
      const id = String(item?.id || "").trim();
      if (!id) return;

      const productKey = normalizeLookup(item?.product);
      if (productKey && !byProduct.has(productKey)) byProduct.set(productKey, id);

      const titleKey = normalizeLookup(item?.title);
      if (titleKey && !byTitle.has(titleKey)) byTitle.set(titleKey, id);
    });

    return { byProduct, byTitle };
  }

  function reconcileCartProductIds(items) {
    const lookup = buildProductLookup(items);
    const cart = loadCart();
    if (!cart.length) return;

    let changed = false;
    const next = cart.map(row => {
      if (!row || row.productId) return row;
      const matchedId =
        lookup.byProduct.get(normalizeLookup(row.product)) ||
        lookup.byTitle.get(normalizeLookup(row.title));
      if (!matchedId) return row;
      changed = true;
      return { ...row, productId: matchedId };
    });

    if (changed) saveCart(next);
  }

  async function ensureCheckoutItemProductId(item) {
    if (!item) return null;
    if (item.productId) return item;

    const cardItems = cards.map(card => getCardItem(card)).filter(Boolean);
    const cardLookup = buildProductLookup(cardItems);
    const directCardId =
      cardLookup.byProduct.get(normalizeLookup(item.product)) ||
      cardLookup.byTitle.get(normalizeLookup(item.title));
    if (directCardId) {
      const resolved = { ...item, productId: directCardId };
      const cart = loadCart().map(row => {
        if (!row) return row;
        if (row.lineId === item.lineId || normalizeLookup(row.product) === normalizeLookup(item.product)) {
          return { ...row, productId: directCardId };
        }
        return row;
      });
      saveCart(cart);
      return resolved;
    }

    try {
      const response = await fetch("/api/public/products?lang=" + (isEnPage ? "en" : "ru"), { cache: "no-store" });
      if (!response.ok) return item;
      const payload = await response.json();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      reconcileCartProductIds(items);
      const lookup = buildProductLookup(items);
      const resolvedId =
        lookup.byProduct.get(normalizeLookup(item.product)) ||
        lookup.byTitle.get(normalizeLookup(item.title));
      return resolvedId ? { ...item, productId: resolvedId } : item;
    } catch (_) {
      return item;
    }
  }

  function getQty(product) {
    const normalizedProduct = String(product || "").trim();
    if (!normalizedProduct) return 0;

    const rows = loadCart();
    return rows.reduce((sum, row) => {
      if (!row || row.product !== normalizedProduct) return sum;
      return sum + Math.max(1, toInt(row.qty));
    }, 0);
  }

  function getCardQty(product) {
    const normalizedProduct = String(product || "").trim();
    if (!normalizedProduct) return 1;
    return 1;
  }

  function setCardQty(product, qty) {
    const normalizedProduct = String(product || "").trim();
    if (!normalizedProduct) return;
    const cardQtyMap = loadCardQtyMap();
    cardQtyMap[normalizedProduct] = 1;
    saveCardQtyMap(cardQtyMap);
    syncCards();
  }

  function addCartLot(item, qty) {
    if (!item || !item.product) return;
    const normalizedQty = 1;
    const cart = loadCart();
    cart.push(
      normalizeCartRow({
        lineId: "lot_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10),
        product: item.product,
        productId: item.productId,
        title: item.title,
        term: item.term,
        sub: item.sub,
        price: item.price,
        currency: item.currency || "RUB",
        qty: normalizedQty,
      })
    );
    saveCart(cart);
    renderCart();
  }

  function setLotQty(lineId, qty) {
    const normalizedLineId = String(lineId || "").trim();
    if (!normalizedLineId) return;

    const nextQty = Math.max(0, toInt(qty));
    const cart = loadCart();
    const index = cart.findIndex(row => row && row.lineId === normalizedLineId);
    if (index < 0) return;

    if (nextQty === 0) {
      cart.splice(index, 1);
    } else {
      cart[index] = {
        ...cart[index],
        qty: 1,
      };
    }

    saveCart(cart);
    renderCart();
  }

  function removeLot(lineId) {
    setLotQty(lineId, 0);
  }

  function syncCard(card) {
    const item = getCardItem(card);
    if (!item) return;

    const qty = getCardQty(item.product);
    const stepper = card.querySelector(".qty-stepper");
    if (stepper) stepper.hidden = true;
  }

  function syncCards() {
    cards.forEach(syncCard);
  }

  function bumpHeaderCart() {
    if (!headerCartEl) return;
    headerCartEl.classList.remove("bump");
    void headerCartEl.offsetWidth;
    headerCartEl.classList.add("bump");
  }

  function animateAddToCart(card) {
    if (!card || !headerCartEl) return;

    const from = card.getBoundingClientRect();
    const to = headerCartEl.getBoundingClientRect();
    const dot = document.createElement("div");
    dot.className = "cart-fly-dot";
    dot.style.left = `${from.left + from.width * 0.5 - 6}px`;
    dot.style.top = `${from.top + 24}px`;
    document.body.appendChild(dot);

    const dx = to.left + to.width * 0.5 - (from.left + from.width * 0.5);
    const dy = to.top + to.height * 0.5 - (from.top + 24);

    const anim = dot.animate(
      [
        { transform: "translate(0, 0) scale(1)", opacity: 0.95 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0.05 },
      ],
      {
        duration: 560,
        easing: "cubic-bezier(0.2, 0.7, 0.2, 1)",
      }
    );

    anim.onfinish = () => {
      dot.remove();
      bumpHeaderCart();
    };
  }

  function closeHeaderCartPanel() {
    if (!headerCartPanelEl) return;
    headerCartPanelEl.classList.remove("open");
    headerCartPanelEl.setAttribute("aria-hidden", "true");
  }

  function openHeaderCartPanel() {
    if (!headerCartPanelEl) return;
    headerCartPanelEl.classList.add("open");
    headerCartPanelEl.setAttribute("aria-hidden", "false");
  }

  function renderHeaderCartPanel(rows, total) {
    if (!headerCartPanelEl || !headerCartPanelListEl || !headerCartPanelEmptyEl || !headerCartPanelCountEl || !headerCartPanelTotalEl || !headerCartPanelCheckoutBtnEl) {
      return;
    }

    const count = rows.reduce((sum, row) => sum + Math.max(1, toInt(row.qty)), 0);
    const discount = calculateDiscount(total, activePromoCode);
    const finalTotal = Math.max(0, Number((total - discount).toFixed(2)));

    headerCartPanelCountEl.textContent = TEXT.panelCount(count);
    headerCartPanelTotalEl.textContent = formatRub(finalTotal);
    headerCartPanelCheckoutBtnEl.disabled = !rows.length;
    headerCartPanelCheckoutBtnEl.setAttribute("aria-disabled", rows.length ? "false" : "true");
    headerCartPanelEmptyEl.style.display = rows.length ? "none" : "block";

    if (!rows.length) {
      headerCartPanelListEl.innerHTML = "";
      if (headerCartPromoMsgEl) {
        headerCartPromoMsgEl.textContent = "";
        applyPromoMessageState(headerCartPromoMsgEl, "idle");
      }
      if (cartPromoMsgEl) {
        cartPromoMsgEl.textContent = "";
        applyPromoMessageState(cartPromoMsgEl, "idle");
      }
      return;
    }

    const promoMsg = !activePromoCode
      ? ""
      : promoValidationState === "checking"
      ? TEXT.promoChecking
      : promoValidationState === "valid"
      ? TEXT.promoAccepted + (discount > 0 ? " (-" + formatRub(discount) + ")" : "")
      : promoValidationState === "invalid"
      ? TEXT.promoInvalid
      : "";
    if (headerCartPromoMsgEl) {
      headerCartPromoMsgEl.textContent = promoMsg;
      applyPromoMessageState(headerCartPromoMsgEl, promoValidationState);
    }
    if (cartPromoMsgEl) {
      cartPromoMsgEl.textContent = promoMsg;
      applyPromoMessageState(cartPromoMsgEl, promoValidationState);
    }

    headerCartPanelListEl.innerHTML = rows
      .map(row => {
        const qty = 1;
        const price = Math.max(0, toAmount(row.price));
        return (
          '<article class="header-mini-item" data-line-id="' + escapeHtml(row.lineId) + '">' +
          '<div class="header-mini-item__top">' +
          '<div>' +
          '<div class="header-mini-item__title">' + escapeHtml(row.title || row.product) + "</div>" +
          '<div class="header-mini-item__price">' + escapeHtml(formatRub(price)) + " x " + qty + "</div>" +
          "</div>" +
          '<button type="button" class="header-mini-remove-btn">x</button>' +
          "</div>" +
          "</article>"
        );
      })
      .join("");
  }

  function renderCart() {
    const rows = loadCart().filter(row => row && row.lineId && row.product && toInt(row.qty) > 0);
    const first = rows[0];
    const firstQty = first ? Math.max(1, toInt(first.qty) || 1) : 0;
    const nextPromoContextKey =
      activePromoCode && first && first.productId
        ? [activePromoCode, String(first.productId || ""), firstQty].join("|")
        : "";
    if (nextPromoContextKey !== promoValidationContextKey) {
      if (activePromoCode && first && first.productId) {
        validatePromoCodeViaBackend(activePromoCode);
      } else {
        promoValidationState = activePromoCode ? "invalid" : "idle";
        promoDiscountAmount = 0;
        promoValidationContextKey = "";
      }
    }

    let total = 0;
    rows.forEach(row => {
      total += Math.max(0, toAmount(row.price)) * Math.max(1, toInt(row.qty));
    });

    const discount = calculateDiscount(total, activePromoCode);
    const headerTotal = Math.max(0, Number((total - discount).toFixed(2)));

    if (headerCartTotalEl) headerCartTotalEl.textContent = formatRub(headerTotal);
    if (headerCartCountEl) {
      const count = rows.reduce((sum, row) => sum + Math.max(1, toInt(row.qty)), 0);
      headerCartCountEl.textContent = String(count);
    }
    renderHeaderCartPanel(rows, total);

    if (cartTotalEl) cartTotalEl.textContent = formatRub(headerTotal);
    if (cartCheckoutEl) {
      cartCheckoutEl.setAttribute("aria-disabled", rows.length ? "false" : "true");
      cartCheckoutEl.disabled = !rows.length;
    }
    if (cartEmptyEl) cartEmptyEl.style.display = rows.length ? "none" : "block";

    if (!cartListEl) return;

    if (!rows.length) {
      cartListEl.innerHTML = "";
      if (cartPromoMsgEl) {
        cartPromoMsgEl.textContent = "";
        applyPromoMessageState(cartPromoMsgEl, "idle");
      }
      try {
        localStorage.removeItem(CART_SELECTION_KEY);
      } catch (_) {
        // Ignore storage write errors.
      }
      return;
    }

    if (cartPromoMsgEl) {
      const promoMsg = !activePromoCode
        ? ""
        : promoValidationState === "checking"
        ? TEXT.promoChecking
        : promoValidationState === "valid"
        ? TEXT.promoAccepted + (discount > 0 ? " (-" + formatRub(discount) + ")" : "")
        : promoValidationState === "invalid"
        ? TEXT.promoInvalid
        : "";
      cartPromoMsgEl.textContent = promoMsg;
      applyPromoMessageState(cartPromoMsgEl, promoValidationState);
    }

    cartListEl.innerHTML = rows
      .map(row => {
        const qty = 1;
        const itemTotal = Math.max(0, toAmount(row.price)) * qty;
        return (
          '<article class="cart-item" data-line-id="' +
          escapeHtml(row.lineId) +
          '">' +
          '<div class="cart-item__info">' +
          '<div class="cart-item__name">' +
          escapeHtml(row.title || row.product) +
          "</div>" +
          '<div class="cart-item__meta">' +
          escapeHtml((row.term ? row.term + " • " : "") + formatRub(toAmount(row.price)) + " x " + qty + " = " + formatRub(itemTotal)) +
          "</div>" +
          "</div>" +
          '<div class="cart-item__controls">' +
          '<button type="button" class="cart-remove-btn">' + escapeHtml(TEXT.remove) + "</button>" +
          "</div>" +
          "</article>"
        );
      })
      .join("");
  }

  function persistCartSelection(overrideTotal, promoCode) {
    const rows = loadCart().filter(row => row && row.lineId && row.product && toInt(row.qty) > 0);
    if (!rows.length) return;

    const total = overrideTotal !== undefined
      ? Math.max(0, toAmount(overrideTotal))
      : rows.reduce((sum, row) => sum + Math.max(0, toAmount(row.price)) * Math.max(1, toInt(row.qty)), 0);
    try {
      localStorage.setItem(
        CART_SELECTION_KEY,
        JSON.stringify({
          items: rows,
          total,
          promoCode: promoCode || null,
          currency: "RUB",
        })
      );
    } catch (_) {
      // Ignore storage write errors.
    }
  }

  document.addEventListener("click", e => {
    const payNowBtn = e.target.closest && e.target.closest(".pay-now-btn");
    if (payNowBtn) {
      e.preventDefault();
      const card = payNowBtn.closest(".price-card");
      const item = getCardItem(card);
      if (!item) return;

      const qty = Math.max(1, getCardQty(item.product) || 1);
      addCartLot(item, qty);
      persistCartSelection(undefined, activePromoCode);
      window.location.href = cartPagePath;
      return;
    }

    const headerMiniItem = e.target.closest && e.target.closest(".header-mini-item");
    if (headerMiniItem) {
      const lineId = String(headerMiniItem.getAttribute("data-line-id") || "").trim();
      if (!lineId) return;
      const cart = loadCart();
      const row = cart.find(item => item && item.lineId === lineId);
      if (!row) return;

      const removeMiniBtn = e.target.closest(".header-mini-remove-btn");
      if (removeMiniBtn) {
        removeLot(lineId);
        return;
      }

    }

    if (headerCartPromoApplyEl && (e.target === headerCartPromoApplyEl || e.target.closest("#headerCartPromoApply"))) {
      const raw = String(headerCartPromoInputEl ? headerCartPromoInputEl.value : "").trim().toUpperCase();
      activePromoCode = raw;
      savePromoCode(activePromoCode);
      if (cartPromoInputEl && cartPromoInputEl.value !== activePromoCode) cartPromoInputEl.value = activePromoCode;
      validatePromoCodeViaBackend(activePromoCode);
      return;
    }

    if (cartPromoApplyEl && (e.target === cartPromoApplyEl || e.target.closest("#cartPromoApply"))) {
      const raw = String(cartPromoInputEl ? cartPromoInputEl.value : "").trim().toUpperCase();
      activePromoCode = raw;
      savePromoCode(activePromoCode);
      if (headerCartPromoInputEl && headerCartPromoInputEl.value !== activePromoCode) headerCartPromoInputEl.value = activePromoCode;
      validatePromoCodeViaBackend(activePromoCode);
      return;
    }

    if (headerCartPanelCheckoutBtnEl && (e.target === headerCartPanelCheckoutBtnEl || e.target.closest("#headerCartPanelCheckoutBtn"))) {
      if (headerCartPanelCheckoutBtnEl.getAttribute("aria-disabled") === "true") return;
      const rows = loadCart().filter(row => row && row.lineId && row.product && toInt(row.qty) > 0);
      if (!rows.length) return;

      if (rows.length !== 1) {
        alert(TEXT.multiCartCheckout);
        return;
      }

      const row = rows[0];
      startBackendCheckout(row, row.qty, activePromoCode).catch(() => {
        alert(TEXT.checkoutError);
      });
      return;
    }

    const cartItem = e.target.closest && e.target.closest(".cart-item");
    if (!cartItem) return;
    const lineId = String(cartItem.getAttribute("data-line-id") || "").trim();
    if (!lineId) return;
    const cart = loadCart();
    const row = cart.find(item => item && item.lineId === lineId);
    if (!row) return;

    const removeBtn = e.target.closest(".cart-remove-btn");
    if (removeBtn) {
      removeLot(lineId);
      return;
    }

  });

  if (cartCheckoutEl) {
    cartCheckoutEl.addEventListener("click", e => {
      if (cartCheckoutEl.getAttribute("aria-disabled") === "true") {
        e.preventDefault();
        return;
      }

      const rows = loadCart().filter(row => row && row.lineId && row.product && toInt(row.qty) > 0);
      if (!rows.length) {
        e.preventDefault();
        return;
      }

      if (rows.length !== 1) {
        e.preventDefault();
        alert(TEXT.multiCartCheckout);
        return;
      }

      const row = rows[0];
      startBackendCheckout(row, row.qty, activePromoCode).catch(() => {
        alert(TEXT.checkoutError);
      });
    });
  }

  activePromoCode = loadPromoCode();
  if (headerCartPromoInputEl) headerCartPromoInputEl.value = activePromoCode;
  if (cartPromoInputEl) cartPromoInputEl.value = activePromoCode;
  if (activePromoCode) {
    validatePromoCodeViaBackend(activePromoCode);
  }
  syncCheckoutEmailInputs();

  loadPricingCards();
  renderCart();

  if (headerCartEl) {
    headerCartEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
        window.location.href = cartPagePath;
        return;
      }

      clickTimer = setTimeout(() => {
        clickTimer = null;
        if (!headerCartPanelEl) return;
        const isOpen = headerCartPanelEl.classList.contains("open");
        if (isOpen) closeHeaderCartPanel();
        else openHeaderCartPanel();
      }, 220);
    });
  }

  if (headerCartPanelLinkEl) {
    headerCartPanelLinkEl.addEventListener("click", e => {
      e.preventDefault();
      window.location.href = cartPagePath;
    });
  }

  if (headerCartPromoInputEl) {
    headerCartPromoInputEl.addEventListener("input", () => {
      const value = String(headerCartPromoInputEl.value || "").trim().toUpperCase();
      if (cartPromoInputEl && cartPromoInputEl.value !== value) cartPromoInputEl.value = value;
    });
    headerCartPromoInputEl.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      activePromoCode = String(headerCartPromoInputEl.value || "").trim().toUpperCase();
      savePromoCode(activePromoCode);
      if (cartPromoInputEl && cartPromoInputEl.value !== activePromoCode) cartPromoInputEl.value = activePromoCode;
      validatePromoCodeViaBackend(activePromoCode);
    });
  }

  if (cartPromoInputEl) {
    cartPromoInputEl.addEventListener("input", () => {
      const value = String(cartPromoInputEl.value || "").trim().toUpperCase();
      if (headerCartPromoInputEl && headerCartPromoInputEl.value !== value) headerCartPromoInputEl.value = value;
    });
    cartPromoInputEl.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      activePromoCode = String(cartPromoInputEl.value || "").trim().toUpperCase();
      savePromoCode(activePromoCode);
      if (headerCartPromoInputEl && headerCartPromoInputEl.value !== activePromoCode) headerCartPromoInputEl.value = activePromoCode;
      validatePromoCodeViaBackend(activePromoCode);
    });
  }

  [headerCartEmailInputEl, cartEmailInputEl].forEach(inputEl => {
    if (!inputEl) return;
    if (!String(inputEl.getAttribute("placeholder") || "").trim()) {
      inputEl.setAttribute("placeholder", TEXT.emailPlaceholder);
    }
    inputEl.addEventListener("input", () => {
      const value = String(inputEl.value || "").trim().toLowerCase();
      if (isValidEmail(value)) {
        localStorage.setItem("checkout_email", value);
        if (headerCartEmailInputEl && headerCartEmailInputEl !== inputEl) headerCartEmailInputEl.value = value;
        if (cartEmailInputEl && cartEmailInputEl !== inputEl) cartEmailInputEl.value = value;
      }
    });
  });

  document.addEventListener("click", (e) => {
    if (!headerCartPanelEl || !headerCartEl) return;
    if (!headerCartPanelEl.contains(e.target) && !headerCartEl.contains(e.target)) {
      closeHeaderCartPanel();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeHeaderCartPanel();
  });

  window.addEventListener("gptishka:cart-cleared", () => {
    activePromoCode = "";
    promoValidationState = "idle";
    promoDiscountAmount = 0;
    promoValidationContextKey = "";
    if (headerCartPromoInputEl) headerCartPromoInputEl.value = "";
    if (cartPromoInputEl) cartPromoInputEl.value = "";
    renderCart();
    syncCards();
  });

  window.addEventListener("hashchange", () => {
    alignToHashTarget("smooth");
  });

  window.gptishkaCart = {
    getQty,
    getCardQty,
    getCardItem,
    persistCartSelection,
  };
})();

// Prefetch Telegram reviews in background and cache for 3 hours.
(() => {
  const REVIEWS_CACHE_KEY = "gptishka_reviews_cache_v1";
  const REVIEWS_CACHE_TS_KEY = "gptishka_reviews_cache_ts_v1";
  const REVIEWS_CACHE_TTL_MS = 3 * 60 * 60 * 1000;
  const REVIEWS_CACHE_LIMIT = 20;
  const REVIEWS_API_URL = "/api/reviews/telegram?limit=" + REVIEWS_CACHE_LIMIT;

  function getCacheInfo() {
    try {
      const raw = localStorage.getItem(REVIEWS_CACHE_KEY);
      const ts = Number(localStorage.getItem(REVIEWS_CACHE_TS_KEY) || 0);
      const items = JSON.parse(raw || "[]");
      const hasItems = Array.isArray(items) && items.length > 0;
      return {
        hasItems,
        isFresh: hasItems && Date.now() - ts < REVIEWS_CACHE_TTL_MS,
      };
    } catch (_) {
      return { hasItems: false, isFresh: false };
    }
  }

  function storeCache(items) {
    try {
      localStorage.setItem(REVIEWS_CACHE_KEY, JSON.stringify(items));
      localStorage.setItem(REVIEWS_CACHE_TS_KEY, String(Date.now()));
    } catch (_) {
      // Ignore storage errors.
    }
  }

  function prefetchReviews() {
    const cache = getCacheInfo();
    if (cache.isFresh) return;

    fetch(REVIEWS_API_URL, { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(response => (response.ok ? response.json() : Promise.reject(new Error("reviews api failed"))))
      .then(payload => {
        const items = Array.isArray(payload?.items) ? payload.items : [];
        if (items.length) storeCache(items);
      })
      .catch(() => {
        // Silent fail: reviews page will keep old cache/fallback.
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", prefetchReviews);
  } else {
    prefetchReviews();
  }
})();

// Persist selected product for the payment page (fallback if query params are lost).
document.addEventListener("click", e => {
  const a = e.target.closest && e.target.closest("a.buy-btn");
  if (!a) return;

  try {
    const url = new URL(a.getAttribute("href"), window.location.href);
    const product = a.getAttribute("data-product") || url.searchParams.get("product") || a.getAttribute("data-plan") || url.searchParams.get("plan");

    const payload = {
      product,
      title: a.getAttribute("data-title") || null,
      sub: a.getAttribute("data-sub") || null,
      term: a.getAttribute("data-term") || null,
      price: a.getAttribute("data-price") || null,
      currency: a.getAttribute("data-currency") || null,
      qty: 1,
      total_price: null,
    };

    // If attributes are missing, try extracting data from the pricing card markup.
    const card = a.closest && a.closest(".price-card");
    if (card) {
      if (!payload.title) {
        const h3 = card.querySelector("h3");
        if (h3) payload.title = (h3.innerText || "").replace(/\s+/g, " ").trim();
      }
      if (!payload.term) {
        const term = card.querySelector(".term");
        if (term) payload.term = (term.innerText || "").replace(/\s+/g, " ").trim();
      }
      if (!payload.sub) {
        const sub = card.querySelector(".sub");
        if (sub) payload.sub = (sub.innerText || "").replace(/\s+/g, " ").trim();
      }
      if (!payload.price) {
        const price = card.querySelector(".price");
        if (price) payload.price = (price.innerText || "").replace(/[^\d.,-]/g, "");
      }
      if (!payload.currency) {
        payload.currency = "RUB";
      }

      if (window.gptishkaCart && typeof window.gptishkaCart.getCardQty === "function") {
        const item = window.gptishkaCart.getCardItem(card);
        if (item && item.product) {
          const fromCard = window.gptishkaCart.getCardQty(item.product);
          payload.qty = fromCard > 0 ? fromCard : 1;
        }
      }
    }

    const numericPrice = toAmount(payload.price);
    if (Number.isFinite(numericPrice) && numericPrice > 0) {
      payload.total_price = String(Number((numericPrice * payload.qty).toFixed(2)));
    }

    if (product) localStorage.setItem("selected_product", JSON.stringify(payload));
  } catch (_) {
    // Non-critical: ignore storage/url parsing failures.
  }
}, true);

// Live ticker with purchases and online count.
(() => {
  const API_STATS_URL = "/api/stats";
  const API_HEARTBEAT_URL = "/api/heartbeat";
  const STATS_REFRESH_MS = 15000;
  const HEARTBEAT_MS = 20000;
  const SESSION_KEY = "gptishka_session_id";

  let tickerTrack = null;
  let salesValueEl = null;
  let onlineValueEl = null;
  let isInitialized = false;

  function ensureSessionId() {
    try {
      const existing = localStorage.getItem(SESSION_KEY);
      if (existing) return existing;
      const generated =
        "s_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2, 10);
      localStorage.setItem(SESSION_KEY, generated);
      return generated;
    } catch (_) {
      return "s_" + Date.now().toString(36);
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function createTicker() {
    if (document.getElementById("siteTicker")) return;
    const header = document.querySelector("header");
    if (!header) return;

    const ticker = document.createElement("div");
    ticker.id = "siteTicker";
    ticker.className = "site-ticker";
    ticker.setAttribute("role", "status");
    ticker.setAttribute("aria-live", "polite");
    ticker.innerHTML = [
      '<div class="site-ticker__marquee">',
      '  <div class="site-ticker__track" id="siteTickerTrack"></div>',
      "</div>",
      '<div class="site-ticker__stats">',
      '  <span class="site-ticker__stat"><span class="site-ticker__stat-label">Sales:</span> <strong id="siteTickerSales">0</strong></span>',
      '  <span class="site-ticker__dot"></span>',
      '  <span class="site-ticker__stat"><span class="site-ticker__stat-label">Online:</span> <strong id="siteTickerOnline">0</strong></span>',
      "</div>",
    ].join("");

    header.insertBefore(ticker, header.firstChild);

    tickerTrack = document.getElementById("siteTickerTrack");
    salesValueEl = document.getElementById("siteTickerSales");
    onlineValueEl = document.getElementById("siteTickerOnline");
  }

  function renderTicker(lastBuyers) {
    if (!tickerTrack) return;

    const buyers = Array.isArray(lastBuyers) ? lastBuyers.filter(Boolean) : [];
    const fallback = ["No recent subscriptions yet"];
    const baseItems = (buyers.length ? buyers : fallback).map(email => {
      return (
        '<span class="site-ticker__item">🔥 ' +
        escapeHtml(email) +
        " subscribed</span>"
      );
    });

    const separator = '<span class="site-ticker__sep">•</span>';
    const joined = baseItems.join(separator);
    const repeated = new Array(4).fill(joined).join(separator);

    tickerTrack.innerHTML =
      '<div class="site-ticker__loop">' +
      repeated +
      "</div>" +
      '<div class="site-ticker__loop" aria-hidden="true">' +
      repeated +
      "</div>";
  }

  function formatNumber(value) {
    const num = Number(value || 0);
    if (!Number.isFinite(num)) return "0";
    return num.toLocaleString();
  }

  async function fetchAndRenderStats() {
    try {
      const response = await fetch(API_STATS_URL, { cache: "no-store" });
      if (!response.ok) return;
      const stats = await response.json();

      if (salesValueEl) salesValueEl.textContent = formatNumber(stats.sales);
      if (onlineValueEl) onlineValueEl.textContent = formatNumber(stats.online);
      renderTicker(stats.lastBuyers);
    } catch (_) {
      // Keep last successful values if API is unavailable.
    }
  }

  async function sendHeartbeat(sessionId) {
    try {
      await fetch(API_HEARTBEAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          path: window.location.pathname,
        }),
        keepalive: true,
      });
    } catch (_) {
      // Silent fallback when backend is not available.
    }
  }

  function initLiveTicker() {
    if (isInitialized) return;
    isInitialized = true;

    createTicker();
    renderTicker([]);

    const sessionId = ensureSessionId();
    sendHeartbeat(sessionId);
    fetchAndRenderStats();

    window.setInterval(() => {
      sendHeartbeat(sessionId);
    }, HEARTBEAT_MS);

    window.setInterval(() => {
      fetchAndRenderStats();
    }, STATS_REFRESH_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLiveTicker);
  } else {
    initLiveTicker();
  }
})();

