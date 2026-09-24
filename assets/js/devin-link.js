(() => {
  "use strict";
  const params = new URLSearchParams(location.search);
  const orderId = String(params.get("order_id") || "").trim();
  const previewMode = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) &&
    orderId === "demo" && params.get("t") === "preview";
  let storedOrderToken = "";
  try {
    if (orderId) storedOrderToken = String(localStorage.getItem(`gptishka_activation_order_token:${orderId}`) || "");
  } catch (_) {
    // The payment return URL still carries the token when storage is unavailable.
  }
  const orderToken = String(params.get("t") || storedOrderToken).trim();
  const status = document.getElementById("status");
  const form = document.getElementById("linkForm");
  const input = document.getElementById("paymentLink");
  const button = document.getElementById("submitButton");
  const retry = document.getElementById("retryButton");
  const number = document.getElementById("orderNumber");
  const plan = document.getElementById("orderPlan");

  function setStatus(message, kind = "") {
    status.textContent = message;
    status.className = `mj-status${kind ? ` ${kind}` : ""}`;
  }

  function validLink(value) {
    const raw = String(value || "").trim();
    if (!raw || raw.length > 4096 || /\s/.test(raw)) return false;
    try {
      const url = new URL(raw);
      return url.protocol === "https:" && url.hostname === "checkout.stripe.com" &&
        !url.username && !url.password && !url.port && /^\/g\/pay\/cs_live_[A-Za-z0-9]+$/.test(url.pathname);
    } catch {
      return false;
    }
  }

  async function loadOrder() {
    if (previewMode) {
      number.textContent = "Демонстрация страницы";
      plan.textContent = "Тариф: Devin Pro — 1 месяц";
      retry.hidden = true;
      form.hidden = false;
      setStatus("Пример страницы после оплаты GPTishka. Здесь клиент отправит ссылку Devin.", "success");
      return;
    }
    if (!orderId || !orderToken) {
      setStatus("Не найдена защищённая ссылка на заказ. Вернитесь к странице подтверждения оплаты или обратитесь в поддержку.", "error");
      return;
    }
    number.textContent = `Заказ: ${orderId}`;
    retry.hidden = true;
    setStatus("Проверяем оплату заказа…");
    try {
      const url = `/api/orders/${encodeURIComponent(orderId)}/activation?t=${encodeURIComponent(orderToken)}`;
      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(response.status === 409 ? "Оплата заказа ещё подтверждается. Попробуйте проверить её чуть позже." : "Не удалось открыть заказ. Проверьте ссылку из письма или обратитесь в поддержку.", "error");
        retry.hidden = false;
        return;
      }
      if (data.deliveryMode !== "payment_link" || !/^devin-(pro|max|teams)-1$/.test(String(data.productSlug || ""))) {
        setStatus("Эта форма доступна только для заказа Devin.", "error");
        return;
      }
      plan.textContent = `Тариф: ${data.productTitle || "Devin"}`;
      form.hidden = false;
      if (data.status === "submitted") {
        setStatus("Ссылка уже получена. Мы оплатим подписку Devin в ближайшее время, ожидайте. Если возникнут сложности, менеджер свяжется с вами.", "success");
        button.textContent = "Отправить новую ссылку";
      } else {
        setStatus("Оплата заказа подтверждена. Отправьте ссылку Stripe Checkout для выбранного тарифа.");
      }
    } catch {
      setStatus("Не удалось проверить заказ из-за ошибки сети. Попробуйте ещё раз.", "error");
      retry.hidden = false;
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (previewMode) {
      setStatus("Это демонстрация. Ссылка не отправлена и заказ не изменён.");
      return;
    }
    const link = String(input.value || "").trim();
    if (!validLink(link)) {
      setStatus("Нужна полная HTTPS-ссылка Stripe Checkout вида checkout.stripe.com/g/pay/cs_live_…", "error");
      input.focus();
      return;
    }
    button.disabled = true;
    setStatus("Сохраняем ссылку в заказе…");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/activation/store-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ token: link, orderToken }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        setStatus(String(data.message || "Ссылка не принята. Проверьте её и попробуйте ещё раз."), "error");
        return;
      }
      input.value = "";
      button.textContent = "Отправить новую ссылку";
      setStatus("Ссылка получена. Мы оплатим подписку Devin в ближайшее время, ожидайте. Если возникнут сложности, менеджер свяжется с вами.", "success");
    } catch {
      setStatus("Не удалось отправить ссылку из-за ошибки сети. Попробуйте ещё раз.", "error");
    } finally {
      button.disabled = false;
    }
  });
  retry.addEventListener("click", loadOrder);
  loadOrder();
})();
