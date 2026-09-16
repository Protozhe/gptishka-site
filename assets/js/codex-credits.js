(function () {
  "use strict";

  const form = document.querySelector("[data-codex-order-form]");
  if (!form) return;

  const english = document.documentElement.lang === "en" || /^\/en(?:\/|$)/.test(location.pathname);
  const text = english ? {
    pay: "Pay",
    invalidEmail: "Enter a valid email address.",
    invalidTelegram: "Enter your Telegram username in the @username format.",
    incompatible: "Confirm that additional Codex credits are available for your account.",
    loading: "Creating a secure payment…",
    slow: "The payment provider is taking longer than usual. Trying an available route…",
    unavailable: "This package is temporarily unavailable. Please contact support.",
    loadFailed: "Could not load the available packages.",
    paymentFailed: "Could not create the payment.",
    missingUrl: "The payment provider did not return a payment link.",
    ready: "Payment is ready. Opening the secure payment page…",
    credits: "credits",
    productTitle: "Codex top-up"
  } : {
    pay: "Оплатить",
    invalidEmail: "Укажите корректный email.",
    invalidTelegram: "Укажите Telegram в формате @username.",
    incompatible: "Подтвердите, что аккаунту доступна покупка дополнительных кредитов.",
    loading: "Создаём безопасную оплату…",
    slow: "Платёжная система отвечает дольше обычного. Подключаем доступный маршрут…",
    unavailable: "Этот номинал пока недоступен. Напишите в поддержку.",
    loadFailed: "Не удалось загрузить актуальные варианты товара.",
    paymentFailed: "Не удалось создать оплату.",
    missingUrl: "Платёжная система не вернула ссылку на оплату.",
    ready: "Оплата готова. Открываем платёжную страницу…",
    credits: "кредитов",
    productTitle: "Пополнение Codex"
  };

  const statusEl = form.querySelector("[data-codex-status]");
  const submitEl = form.querySelector("[data-codex-submit]");
  const totalEl = form.querySelector("[data-codex-total]");
  const options = Array.from(form.querySelectorAll('.codex-option input[name="credits"]'));
  let productMapPromise = null;

  function formatRub(value) {
    const formatted = Number(value || 0).toLocaleString(english ? "en-US" : "ru-RU", { maximumFractionDigits: 0 });
    return english ? `${formatted} RUB` : `${formatted} ₽`;
  }

  function selectedOption() {
    return options.find((item) => item.checked) || options[0];
  }

  function syncSelection() {
    const current = selectedOption();
    form.querySelectorAll(".codex-option").forEach((label) => label.classList.toggle("is-selected", label.contains(current)));
    const price = Number(current && current.dataset.price || 0);
    if (totalEl) totalEl.textContent = formatRub(price);
    if (submitEl) submitEl.textContent = `${text.pay} ${formatRub(price)}`;
  }

  function setStatus(message, state) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.className = `codex-order__status${state ? ` is-${state}` : ""}`;
  }

  function normalizeTelegram(value) {
    const raw = String(value || "").trim();
    return raw ? `@${raw.replace(/^@+/, "")}` : "";
  }

  function getCreditAmount(item) {
    const tags = Array.isArray(item && item.tags) ? item.tags : [];
    const tag = tags.find((value) => /^credits:(250|500|1000)$/i.test(String(value || "")));
    const source = tag || (item && (item.baseSlug || item.slug || item.product || item.title)) || "";
    const match = String(source).match(/(?:credits:|codex[-\s]?)(250|500|1000)/i);
    return match ? match[1] : "";
  }

  function updateAvailablePackages(products) {
    options.forEach((option) => {
      const product = products.byCredits.get(String(option.value));
      if (!product || !Number.isFinite(product.price) || product.price <= 0 || !product.id || !product.slug) return;

      option.dataset.price = String(product.price);
      option.dataset.slug = product.slug;
      option.dataset.productId = product.id;
      const priceLabel = option.closest(".codex-option")?.querySelector("b");
      if (priceLabel) priceLabel.textContent = formatRub(product.price);
    });
    syncSelection();
  }

  function loadProductMap() {
    if (!productMapPromise) {
      productMapPromise = fetch(`/api/public/products?lang=${english ? "en" : "ru"}`, { credentials: "same-origin", cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error(text.loadFailed);
          return response.json();
        })
        .then((payload) => {
          const products = Array.isArray(payload.items) ? payload.items : Array.isArray(payload.products) ? payload.products :
            Array.isArray(payload.sections) ? payload.sections.flatMap((section) => Array.isArray(section.products) ? section.products : []) : [];
          const bySlug = new Map();
          const byCredits = new Map();
          products.forEach((item) => {
            const slug = String(item && (item.slug || item.product || item.baseSlug) || "").toLowerCase();
            const id = String(item && item.id || "");
            const price = Number(item && item.price);
            if (slug && id) bySlug.set(slug, id);
            const credits = getCreditAmount(item);
            if (credits && slug && id) byCredits.set(credits, { id, slug, price });
          });
          const result = { bySlug, byCredits };
          updateAvailablePackages(result);
          return result;
        })
        .catch((error) => {
          productMapPromise = null;
          throw error;
        });
    }
    return productMapPromise;
  }

  async function resolveProductId(option) {
    if (option.dataset.productId) return option.dataset.productId;
    const products = await loadProductMap();
    const productId = products.bySlug.get(String(option.dataset.slug || "").toLowerCase()) ||
      products.byCredits.get(String(option.value || ""))?.id;
    if (!productId) throw new Error(text.unavailable);
    return productId;
  }

  options.forEach((item) => item.addEventListener("change", syncSelection));
  syncSelection();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const emailInput = form.elements.email;
    const telegramInput = form.elements.telegram;
    const compatibleInput = form.elements.compatible;
    const email = String(emailInput.value || "").trim().toLowerCase();
    const telegram = normalizeTelegram(telegramInput.value);
    const option = selectedOption();
    const credits = Number(option.dataset.slug && option.value || 0);
      const slug = String(option.dataset.slug || "");
    const paymentMethod = String(form.elements.paymentMethod.value || "lava").toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus(text.invalidEmail, "error"); emailInput.focus(); return;
    }
    if (!/^@[a-z0-9_]{5,32}$/i.test(telegram)) {
      setStatus(text.invalidTelegram, "error"); telegramInput.focus(); return;
    }
    if (!compatibleInput.checked) {
      setStatus(text.incompatible, "error"); compatibleInput.focus(); return;
    }

    submitEl.disabled = true;
    submitEl.setAttribute("aria-busy", "true");
    setStatus(text.loading, "loading");
    const slowStatusTimer = window.setTimeout(() => setStatus(text.slow, "loading"), 3500);

    try {
      const productId = await resolveProductId(option);
      const price = Number(option.dataset.price || 0);
      const creditLabel = `${credits} ${text.credits}`;
      const orderDetails = {
        source: "codex_credits_page",
        capturedAt: new Date().toISOString(),
        product: { id: productId, slug, title: `${text.productTitle} — ${creditLabel}`, price, currency: "RUB" },
        selection: { product: "Codex", plan: creditLabel, duration: creditLabel, quantity: 1, paymentMethod, activationVariant: "withoutLogin", deliveryMethod: "link", deliveryKey: "link", serverDeliveryType: "activation" },
        contact: { email, telegram },
        account: { status: "compatible_confirmed", note: "Customer confirmed that Codex credit top-ups are available. No login or password requested." }
      };
      try {
        localStorage.setItem("checkout_email", email);
        localStorage.setItem("checkout_telegram", telegram);
        localStorage.setItem("gptishka_site_checkout_context", JSON.stringify({ source: "codex_credits_page", productId, productSlug: slug, credits, createdAt: Date.now() }));
      } catch (_) {}

      const response = await fetch(`/api/payments/${encodeURIComponent(paymentMethod)}/create`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, contactEmail: email, telegram, plan_id: productId, planId: productId, product_id: productId, productId, qty: 1, quantity: 1, payment_method: paymentMethod, paymentMethod, product: "Codex", plan: creditLabel, duration: creditLabel, deliveryMethod: "link", activationVariant: "withoutLogin", serverDeliveryType: "activation", order_details: orderDetails, orderDetails })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data.error || data.message || text.paymentFailed));
      if (!data.pay_url) throw new Error(text.missingUrl);
      window.clearTimeout(slowStatusTimer);
      setStatus(text.ready, "success");
      window.location.href = data.pay_url;
    } catch (error) {
      window.clearTimeout(slowStatusTimer);
      submitEl.disabled = false;
      submitEl.removeAttribute("aria-busy");
      setStatus(error instanceof Error ? error.message : text.paymentFailed, "error");
    }
  });

  try {
    const savedEmail = localStorage.getItem("checkout_email");
    const savedTelegram = localStorage.getItem("checkout_telegram");
    if (savedEmail) form.elements.email.value = savedEmail;
    if (savedTelegram) form.elements.telegram.value = savedTelegram;
  } catch (_) {}

  loadProductMap().catch(() => {});
})();
