(() => {
  "use strict";
  const params = new URLSearchParams(location.search);
  const en = params.get("lang") === "en" || (params.get("lang") !== "ru" && location.pathname.startsWith("/en/"));
  const byId = (id) => document.getElementById(id);
  const orderId = params.get("order_id") || "";
  const orderToken = params.get("t") || "";
  const copy = {
    title: "Activate Gemini Pro", intro: "Enter your Google Account details. Track activation on this page.",
    order: "Order number", copy: "Copy", guide: "Before activation",
    step1: "Check the account: no active paid subscription or family group membership.",
    step2: "Google two-step verification must be enabled. Prepare your authenticator app key or one 8-digit backup code. A current 6-digit code will not work.",
    step3: "Complete the form and select Activate. Wait for the result on this page. You do not need to pay again.",
    safety: "After activation, change your password and replace the shared authenticator key or backup code. Do not send these details in support chat.",
    google: "Google Account security ↗", account: "Google Account details", email: "Google email", password: "Account password",
    twofa: "Authenticator key or backup code", twofaHint: "A key containing letters and digits 2–7, or one 8-digit backup code.",
    consent: "This is my account. I authorize using these details to activate the subscription and sharing them with the automatic activation service.",
    activate: "Activate", privacy: "Details are encrypted until sent for activation, for no more than 24 hours. After submission, they are removed from this form and GPTishka storage.",
    loading: "Checking your order…", accepted: "Details received", processing: "Activating", done: "Complete", manager: "Contact the manager ↗",
  };
  if (en) {
    document.documentElement.lang = "en";
    document.title = "Activate Gemini Pro — GPTishka";
    document.querySelectorAll("[data-copy]").forEach((node) => { node.textContent = copy[node.dataset.copy] || node.textContent; });
    document.querySelector("[data-gemini-product-link]").href = "/en/gemini";
  }
  document.querySelectorAll("[data-language]").forEach((link) => {
    if (link.tagName !== "A") return;
    const lang = link.dataset.language;
    const target = new URL(lang === "en" ? "/en/gemini-activation.html" : "/gemini-activation.html", location.origin);
    target.search = location.search; target.searchParams.set("lang", lang);
    link.href = target.href;
  });
  const form = byId("gemini-account-form"), fields = byId("gemini-fields"), workspace = byId("gemini-workspace");
  const status = byId("gemini-status"), title = byId("gemini-status-title"), detail = byId("gemini-status-detail");
  const spinner = status.querySelector(".gemini-order__spinner"), progress = byId("gemini-progress");
  let busy = false, reading = false, lastPhase = "";
  byId("gemini-order-id").textContent = orderId || "—";
  const t = (ru, english) => en ? english : ru;
  const states = {
    awaiting_account: ["Готово к активации", "Ready to activate", "Заполните данные своего Google-аккаунта в форме.", "Complete the form with your Google Account details."],
    awaiting_key: ["Заказ обрабатывается", "Order processing", "Оплата и данные получены. Подключение продолжится автоматически; повторно оплачивать заказ не нужно.", "Payment and account details received. Activation will continue automatically; do not pay again."],
    checking: ["Проверяем возможность подключения", "Checking activation", "Данные приняты. Подготавливаем активацию выбранного тарифа.", "Details received. Preparing your selected plan for activation."],
    dispatching: ["Подключаем Gemini Pro", "Activating Gemini Pro", "Заявка отправляется. Не запускайте подключение через другие сервисы.", "Submitting your request. Do not activate through another service at the same time."],
    processing: ["Подключаем Gemini Pro", "Activating Gemini Pro", "Заявка обрабатывается. Можно вернуться по этой же ссылке — статус сохранится.", "Your request is being processed. You can return using this link; progress is saved."],
    success: ["Gemini Pro активирован", "Gemini Pro is active", "Проверьте подписку в аккаунте Google. Смените пароль и замените переданные данные двухэтапной проверки.", "Check the subscription in your Google Account. Change your password and replace the shared two-step verification details."],
    needs_help: ["Нужна проверка заказа", "Your order needs attention", "Свяжитесь с менеджером и укажите номер заказа. Не оплачивайте повторно и не отправляйте данные аккаунта в чат.", "Contact the manager with your order number. Do not pay again or send account credentials in chat."],
    credentials_expired: ["Обновите данные аккаунта", "Update your account details", "Срок хранения данных истёк. Заполните форму снова — заказ остаётся оплаченным.", "Stored details have expired. Complete the form again; your order remains paid."],
    ultra_manual: ["Подключение Gemini Ultra 20×", "Gemini Ultra 20× order", "Свяжитесь с менеджером и укажите номер заказа. Менеджер выдаст готовый аккаунт или согласует подключение на ваш аккаунт. Повторная оплата не нужна.", "Contact the manager with your order number. The manager will provide the ready account or arrange activation on your account. Do not pay again."],
    new_account: ["Получите новый аккаунт", "Receive your new account", "Свяжитесь с менеджером и сообщите номер заказа. Менеджер подготовит аккаунт с выбранной подпиской. Данные вашего текущего аккаунта не нужны.", "Contact the manager with your order number. The manager will prepare a new account with your selected subscription. Your current account details are not needed."],
  };
  function show(data) {
    const ultra = data.activationFlow === "gemini_ultra_manual" && /^gemini-ultra-(ready|own)-1m$/.test(String(data.productSlug || ""));
    const newAccount = data.deliveryMode === "manual_login" && data.needsNewAccount === true;
    const phase = newAccount ? "new_account" : data.phase;
    if (!newAccount && !ultra && data.activationFlow !== "gemini_account") throw Error("wrong_product");
    const state = states[phase];
    if (!state) throw Error("status_unavailable");
    lastPhase = phase;
    title.textContent = t(state[0], state[1]); detail.textContent = t(state[2], state[3]);
    status.dataset.state = phase === "success" ? "success" : phase === "needs_help" ? "error" : "pending";
    const pending = ["awaiting_key", "checking", "dispatching", "processing"].includes(phase);
    spinner.hidden = !pending; progress.hidden = !pending && phase !== "success";
    progress.querySelectorAll("li").forEach((node, index) => node.classList.toggle("is-current", phase === "success" || index === 0 || (index === 1 && ["dispatching", "processing"].includes(phase))));
    fields.disabled = busy || !["awaiting_account", "credentials_expired"].includes(phase);
    workspace.hidden = pending || newAccount || ultra || phase === "success" || phase === "needs_help";
    workspace.dataset.processing = String(pending);
    form.hidden = newAccount || ultra;
    if (ultra) {
      document.querySelector('[data-copy="title"]').textContent = t("Подключение Gemini Ultra 20×", "Gemini Ultra 20× order");
      document.querySelector('[data-copy="intro"]').textContent = t("Заказ принят. Для получения аккаунта или подключения свяжитесь с менеджером.", "Your order is received. Contact the manager to receive the account or arrange activation.");
      document.title = "Gemini Ultra 20× — GPTishka";
    }
    if (pending || phase === "success" || phase === "needs_help") form.reset();
    if (data.productTitle && en) {
      const months = String(data.productSlug || "").match(/-(6|12|24)m$/)?.[1];
      byId("gemini-plan").textContent = ultra ? `Gemini Ultra 20× · 1 month · ${String(data.productSlug).includes("ready") ? "ready account" : "your account"}` : months ? `Gemini Pro · ${months} months` : "Gemini Pro";
    } else if (data.productTitle) byId("gemini-plan").textContent = data.productTitle;
  }
  const errors = {
    gemini_account_required: ["Заполните данные аккаунта.", "Complete the account details."],
    gemini_consent_required: ["Подтвердите согласие на подключение.", "Confirm your authorization to activate the subscription."],
    gemini_email_invalid: ["Проверьте почту Google.", "Check your Google email."],
    gemini_password_required: ["Введите пароль аккаунта.", "Enter the account password."],
    gemini_twofa_invalid: ["Нужен ключ аутентификатора или один 8-значный резервный код. Текущий 6-значный код не подойдёт.", "Enter an authenticator key or one 8-digit backup code. A current 6-digit code will not work."],
    gemini_account_already_bound: ["Заказ уже связан с другим аккаунтом. Обратитесь в поддержку.", "This order is already linked to another account. Contact support."],
    wrong_product: ["Для этого заказа нужна другая страница активации. Обратитесь в поддержку.", "This order uses a different activation page. Contact support."],
  };
  function errorMessage(error) {
    const code = String(error?.message || "");
    if (errors[code]) return t(...errors[code]);
    if (error?.status === 401 || error?.status === 403 || !orderToken) return t("Откройте личную ссылку из заказа. Без неё активация недоступна.", "Open your private order link. Activation requires that link.");
    if (error?.status === 409) return t("Оплата ещё не подтверждена. Обновим статус автоматически. Если вы уже оплатили, свяжитесь с поддержкой.", "Payment has not been confirmed yet. We will check again automatically. Contact support if you have already paid.");
    return t("Не удалось обновить статус. Попробуем снова; не оплачивайте повторно.", "Unable to update the status. We will check again; do not pay again.");
  }
  async function api(method, body) {
    const path = `/api/public/orders/${encodeURIComponent(orderId)}/activation${method === "POST" ? "/start" : ""}`;
    const response = await fetch(method === "POST" ? path : `${path}?t=${encodeURIComponent(orderToken)}`, {
      method, cache: "no-store", credentials: "same-origin", referrerPolicy: "no-referrer",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) { const error = Error(data.message || data.error || "request_failed"); error.status = response.status; throw error; }
    return data;
  }
  async function refresh() {
    if (reading || busy || document.hidden || !orderId || !orderToken) return;
    reading = true;
    try { show(await api("GET")); }
    catch (error) { if (!lastPhase) { title.textContent = t("Проверяем заказ", "Checking your order"); detail.textContent = errorMessage(error); } }
    finally { reading = false; }
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || fields.disabled || !form.reportValidity()) return;
    const account = { email: byId("gemini-email").value.trim(), password: byId("gemini-password").value, twofa: byId("gemini-twofa").value.replace(/\s+/g, ""), consent: byId("gemini-consent").checked };
    if (!/^(?:[A-Z2-7]{16,128}={0,6}|\d{8})$/i.test(account.twofa)) {
      detail.textContent = t(...errors.gemini_twofa_invalid); byId("gemini-twofa").focus(); return;
    }
    busy = true; fields.disabled = true;
    title.textContent = t("Отправляем данные…", "Submitting details…"); spinner.hidden = false;
    try { const result = await api("POST", { orderToken, token: JSON.stringify(account) }); busy = false; show(result); }
    catch (error) { busy = false; fields.disabled = false; spinner.hidden = true; detail.textContent = errorMessage(error); }
    finally { account.password = ""; account.twofa = ""; busy = false; }
  });
  byId("gemini-copy-order").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(orderId); byId("gemini-copy-order").textContent = t("Скопировано", "Copied"); } catch { /* Order number remains selectable. */ }
  });
  window.addEventListener("pagehide", () => form.reset());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void refresh(); });
  if (!orderId || !orderToken) detail.textContent = t("Откройте личную ссылку на активацию из своего заказа.", "Open the private activation link from your order.");
  else { void refresh(); setInterval(() => { if (lastPhase !== "success" && lastPhase !== "new_account" && lastPhase !== "ultra_manual") void refresh(); }, 12_000); }
})();
