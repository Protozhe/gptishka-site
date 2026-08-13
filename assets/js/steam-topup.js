(function () {
  "use strict";

  const STEAM_UNIT_PRICE = 151;
  const PRODUCT_SLUG = "steam-link";
  const MIN_QTY = 1;
  const MAX_QTY = 100;
  const isEnPage =
    String(document.documentElement.getAttribute("lang") || "").toLowerCase().startsWith("en") ||
    String(window.location.pathname || "").startsWith("/en/");
  const COPY = isEnPage
    ? {
        pay: "Pay",
        productTitle: "Steam top-up with Mann Co. keys",
        planTitle: "Mann Co. keys",
        duration: (quantity) => `${quantity} key${quantity === 1 ? "" : "s"}`,
        productConfigFetchError: "Could not load the current product configuration.",
        productNotFoundError: "The Steam product is not available in the server configuration yet. Try again later or contact support.",
        invalidTelegram: "Enter a valid Telegram username, for example @username.",
        invalidTradeUrl: "Enter a Steam trade URL in the tradeoffer/new format with partner and token.",
        creatingPayment: "Creating secure payment...",
        paymentCreateError: "Could not create the payment. Try again.",
        paymentGatewayUrlError: "The payment gateway did not return a payment link.",
      }
    : {
        pay: "Оплатить",
        productTitle: "Пополнение Steam ключами Манн Ко",
        planTitle: "Ключи Манн Ко",
        duration: (quantity) => `${quantity} ключ(ей)`,
        productConfigFetchError: "Не удалось получить актуальную конфигурацию товара.",
        productNotFoundError: "Товар Steam пока не найден в серверной конфигурации. Попробуйте позже или напишите в поддержку.",
        invalidTelegram: "Укажите корректный Telegram, например @username.",
        invalidTradeUrl: "Укажите Steam trade-ссылку в формате tradeoffer/new с partner и token.",
        creatingPayment: "Создаём безопасную оплату...",
        paymentCreateError: "Не удалось создать оплату. Попробуйте снова.",
        paymentGatewayUrlError: "Платёжный шлюз не вернул ссылку на оплату.",
      };

  function qs(root, selector) {
    return root ? root.querySelector(selector) : null;
  }

  function qsa(root, selector) {
    return root ? Array.from(root.querySelectorAll(selector)) : [];
  }

  function clampQty(value) {
    const parsed = Number.parseInt(String(value || ""), 10);
    if (!Number.isFinite(parsed)) return MIN_QTY;
    return Math.min(MAX_QTY, Math.max(MIN_QTY, parsed));
  }

  function formatRub(value) {
    const amount = Math.max(0, Number(value || 0));
    return `${amount.toLocaleString(isEnPage ? "en-US" : "ru-RU", { maximumFractionDigits: 0 })} RUB`;
  }

  function normalizeTradeUrl(value) {
    return String(value || "").trim();
  }

  function normalizeTelegram(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    return `@${raw.replace(/^@+/, "")}`;
  }

  function isValidTelegram(value) {
    return /^@[a-z0-9_]{5,32}$/i.test(normalizeTelegram(value));
  }

  function buildTelegramContactEmail(value) {
    const username = normalizeTelegram(value).slice(1).toLowerCase();
    return `steam_${username}@telegram.local`;
  }

  function isValidSteamTradeUrl(value) {
    const raw = normalizeTradeUrl(value);
    if (!raw) return false;
    try {
      const url = new URL(raw);
      const host = url.hostname.toLowerCase();
      if (url.protocol !== "https:") return false;
      if (host !== "steamcommunity.com" && host !== "www.steamcommunity.com") return false;
      if (!url.pathname.toLowerCase().startsWith("/tradeoffer/new/")) return false;
      return Boolean(url.searchParams.get("partner") && url.searchParams.get("token"));
    } catch (_) {
      return false;
    }
  }

  function setStatus(form, message, state) {
    const status = qs(form, "[data-steam-topup-status]");
    if (!status) return;
    status.textContent = message || "";
    status.classList.remove("is-error", "is-loading");
    if (state) status.classList.add(`is-${state}`);
  }

  function setBusy(form, busy) {
    const submit = qs(form, "[data-steam-topup-submit]");
    if (!submit) return;
    submit.disabled = Boolean(busy);
    submit.setAttribute("aria-busy", busy ? "true" : "false");
  }

  function markInvalid(field, invalid) {
    const label = field && field.closest ? field.closest(".steam-topup-field") : null;
    if (label) label.classList.toggle("is-invalid", Boolean(invalid));
    if (field) field.setAttribute("aria-invalid", invalid ? "true" : "false");
  }

  function updateTotals(form) {
    const qtyInput = qs(form, "[data-steam-qty]");
    const quantity = clampQty(qtyInput ? qtyInput.value : 1);
    if (qtyInput && String(qtyInput.value) !== String(quantity)) qtyInput.value = String(quantity);
    const total = STEAM_UNIT_PRICE * quantity;
    qsa(form, "[data-steam-topup-total]").forEach((node) => {
      node.textContent = formatRub(total);
    });
    const submit = qs(form, "[data-steam-topup-submit]");
    if (submit) submit.textContent = `${COPY.pay} ${formatRub(total)}`;
    return { quantity, total };
  }

  function flattenProducts(payload) {
    if (!payload || typeof payload !== "object") return [];
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.products)) return payload.products;
    if (Array.isArray(payload.sections)) {
      return payload.sections.flatMap((section) => Array.isArray(section.products) ? section.products : []);
    }
    return [];
  }

  async function resolveSteamProductId(form) {
    const pageSlug = String(form.getAttribute("data-product-slug") || PRODUCT_SLUG).trim() || PRODUCT_SLUG;
    const productLanguage = `lang=${isEnPage ? "en" : "ru"}`;
    const response = await fetch(`/api/public/products?${productLanguage}`, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error(COPY.productConfigFetchError);
    const payload = await response.json();
    const items = flattenProducts(payload);
    const found = items.find((item) => {
      const values = [
        item && item.slug,
        item && item.product,
        item && item.baseSlug,
      ].map((value) => String(value || "").trim().toLowerCase());
      return values.includes(pageSlug.toLowerCase());
    });
    const productId = String(found && found.id || "").trim();
    if (!/^[a-z0-9]{10,}$/i.test(productId)) {
      throw new Error(COPY.productNotFoundError);
    }
    return productId;
  }

  function collectPaymentMethod(form) {
    const checked = qs(form, 'input[name="paymentMethod"]:checked');
    const value = String(checked && checked.value || "lava").trim().toLowerCase();
    return value === "lava" ? "lava" : "enot";
  }

  function buildOrderDetails(form, productId, quantity, total, tradeUrl, telegram, email, paymentMethod) {
    const comment = String(qs(form, '[name="comment"]')?.value || "").trim();
    return {
      source: "steam_topup_page",
      capturedAt: new Date().toISOString(),
      product: {
        id: productId,
        slug: PRODUCT_SLUG,
        title: COPY.productTitle,
        price: STEAM_UNIT_PRICE,
        currency: "RUB",
      },
      selection: {
        product: "Steam",
        plan: COPY.planTitle,
        deliveryMethod: "manual_login",
        activationVariant: "withLogin",
        duration: COPY.duration(quantity),
        quantity: quantity,
        unitPrice: STEAM_UNIT_PRICE,
        total: total,
        paymentMethod: paymentMethod,
        steamTradeUrl: tradeUrl,
      },
      contact: {
        email: email,
        telegram: telegram,
        steamTradeUrl: tradeUrl,
      },
      steam: {
        tradeUrl: tradeUrl,
        quantity: quantity,
        unitPrice: STEAM_UNIT_PRICE,
        expectedTotal: total,
      },
      comment: comment,
    };
  }

  async function submitSteamTopup(form) {
    const telegramInput = qs(form, '[name="telegram"]');
    const tradeInput = qs(form, '[name="steamTradeUrl"]');
    const telegram = normalizeTelegram(telegramInput && telegramInput.value);
    const email = buildTelegramContactEmail(telegram);
    const tradeUrl = normalizeTradeUrl(tradeInput && tradeInput.value);
    const { quantity, total } = updateTotals(form);

    markInvalid(telegramInput, false);
    markInvalid(tradeInput, false);

    if (!isValidTelegram(telegram)) {
      markInvalid(telegramInput, true);
      setStatus(form, COPY.invalidTelegram, "error");
      if (telegramInput && typeof telegramInput.focus === "function") telegramInput.focus();
      return;
    }

    if (!isValidSteamTradeUrl(tradeUrl)) {
      markInvalid(tradeInput, true);
      setStatus(form, COPY.invalidTradeUrl, "error");
      if (tradeInput && typeof tradeInput.focus === "function") tradeInput.focus();
      return;
    }

    const paymentMethod = collectPaymentMethod(form);
    setBusy(form, true);
    setStatus(form, COPY.creatingPayment, "loading");

    try {
      const productId = await resolveSteamProductId(form);
      const orderDetails = buildOrderDetails(form, productId, quantity, total, tradeUrl, telegram, email, paymentMethod);
      try {
        localStorage.setItem("checkout_telegram", telegram);
        localStorage.setItem("gptishka_site_checkout_context", JSON.stringify({
          source: "steam_topup_page",
          productId: productId,
          productSlug: PRODUCT_SLUG,
          quantity: quantity,
          createdAt: Date.now(),
        }));
      } catch (_) {
        // Ignore storage write errors.
      }

      const response = await fetch(`/api/payments/${encodeURIComponent(paymentMethod)}/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email: email,
          contactEmail: email,
          plan_id: productId,
          planId: productId,
          product_id: productId,
          productId: productId,
          qty: quantity,
          quantity: quantity,
          payment_method: paymentMethod,
          paymentMethod: paymentMethod,
          telegram: telegram,
          product: "Steam",
          plan: COPY.planTitle,
          deliveryMethod: "manual_login",
          duration: COPY.duration(quantity),
          tradeUrl: tradeUrl,
          steamTradeUrl: tradeUrl,
          order_details: orderDetails,
          orderDetails: orderDetails,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = String(data && (data.error || data.message) || "").trim();
        throw new Error(message || COPY.paymentCreateError);
      }

      const payUrl = String(data && data.pay_url || "").trim();
      if (!payUrl) throw new Error(COPY.paymentGatewayUrlError);
      window.location.href = payUrl;
    } catch (error) {
      setBusy(form, false);
      setStatus(form, error instanceof Error ? error.message : COPY.paymentCreateError, "error");
    }
  }

  function initSteamTopupForm(form) {
    const qtyInput = qs(form, "[data-steam-qty]");
    const dec = qs(form, "[data-steam-qty-dec]");
    const inc = qs(form, "[data-steam-qty-inc]");
    const telegramInput = qs(form, '[name="telegram"]');
    const savedTelegram = normalizeTelegram(localStorage.getItem("checkout_telegram") || "");
    if (telegramInput && savedTelegram) telegramInput.value = savedTelegram;

    updateTotals(form);

    if (qtyInput) {
      qtyInput.addEventListener("input", () => updateTotals(form));
      qtyInput.addEventListener("blur", () => updateTotals(form));
    }

    if (dec) {
      dec.addEventListener("click", () => {
        if (qtyInput) qtyInput.value = String(clampQty(Number(qtyInput.value || 1) - 1));
        updateTotals(form);
      });
    }

    if (inc) {
      inc.addEventListener("click", () => {
        if (qtyInput) qtyInput.value = String(clampQty(Number(qtyInput.value || 1) + 1));
        updateTotals(form);
      });
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void submitSteamTopup(form);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-steam-topup-form]").forEach((form) => initSteamTopupForm(form));
  });
})();
