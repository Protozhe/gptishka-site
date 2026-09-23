(function () {
  "use strict";

  const grid = document.getElementById("servicePlansGrid");
  if (!grid) return;

  document.body.classList.add("chatgpt-onboarding-ready");

  const isEnglish = document.documentElement.lang.toLowerCase().startsWith("en") || location.pathname.startsWith("/en/");
  const copy = isEnglish ? {
    briefLabel: "Activation method for the selected plan",
    briefTitle: "Automatic activation",
    briefText: "After payment, enter your account token in the secure form. The page will show the activation status.",
    how: "How it works",
    close: "Close",
    eyebrow: "3 short steps",
    title: "How activation works",
    lead: "Follow the on-screen prompts — we will show you what to do next.",
    step1: "Pay for your plan",
    step1Text: "Choose the right plan and a payment method.",
    step2: "Paste the token",
    step2Text: "A secure form with a short guide opens after payment.",
    step3: "Get your subscription",
    step3Text: "The page shows the progress and confirms the result.",
    before: "Before payment",
    twoPoints: "Two quick checks",
    view: "View",
    access: "Account access",
    accessText: "Keep access to your account and its email address.",
    email: "Account email",
    emailText: "Gmail and other international email services are supported. Yandex, Mail.ru, and VK Mail are not accepted.",
    result: "We will complete the activation",
    resultText: "If assistance is needed, a support specialist will automatically continue the order at no extra cost.",
    understood: "Got it"
  } : {
    briefLabel: "Способ подключения выбранного тарифа",
    briefTitle: "Автоматическое подключение",
    briefText: "После оплаты вставьте токен аккаунта в защищённую форму. Страница покажет ход подключения.",
    how: "Как это работает",
    close: "Закрыть",
    eyebrow: "3 коротких шага",
    title: "Как проходит подключение",
    lead: "Следуйте подсказкам на экране — мы покажем, что делать дальше.",
    step1: "Оплатите тариф",
    step1Text: "Выберите подходящий план и удобный способ оплаты.",
    step2: "Вставьте токен",
    step2Text: "После оплаты откроется форма с короткой инструкцией.",
    step3: "Получите подписку",
    step3Text: "Страница покажет процесс и сообщит о результате.",
    before: "Перед оплатой",
    twoPoints: "Два коротких пункта",
    view: "Посмотреть",
    access: "Есть доступ к аккаунту",
    accessText: "И к привязанной электронной почте.",
    email: "Почта аккаунта",
    emailText: "Подойдут Gmail и другие зарубежные адреса. Yandex, Mail.ru и VK Почта не принимаются.",
    result: "Мы доведём подключение до результата",
    resultText: "Если понадобится помощь, заказ автоматически продолжит специалист поддержки. Доплачивать не нужно.",
    understood: "Всё понятно"
  };

  const automaticPlanKeys = new Set(["go", "plus"]);
  const markup = `
    <section class="chatgpt-onboarding-brief" aria-label="${copy.briefLabel}">
      <div class="chatgpt-onboarding-brief__copy">
        <span class="chatgpt-onboarding-brief__mark" aria-hidden="true">✓</span>
        <span class="chatgpt-onboarding-brief__text"><strong>${copy.briefTitle}</strong><small>${copy.briefText}</small></span>
      </div>
      <button class="chatgpt-onboarding-brief__details" type="button" data-onboarding-open><span>${copy.how}</span><span class="chatgpt-onboarding-brief__arrow" aria-hidden="true">→</span></button>
    </section>`;

  function mountBrief() {
    const card = grid.querySelector(".price-card");
    const buyButton = card && card.querySelector(".pay-now-btn");
    if (!card || !buyButton || card.querySelector(".chatgpt-onboarding-brief")) return;
    if (!automaticPlanKeys.has(card.dataset.planKey || "")) return;
    buyButton.insertAdjacentHTML("beforebegin", markup);
  }

  new MutationObserver(mountBrief).observe(grid, { childList: true, subtree: true });
  mountBrief();

  function mountCodexEntry() {
    const page = document.querySelector("main.service-page");
    const plans = page && page.querySelector(".service-plans-section");
    if (!page || !plans || page.querySelector(".codex-entry")) return;
    plans.insertAdjacentHTML("afterend", `
      <section class="codex-entry" aria-label="${isEnglish ? "Codex credit top-up" : "Пополнение кредитов Codex"}">
        <a class="codex-entry__card" href="${isEnglish ? "/en/codex-credits" : "/codex-credits"}">
          <span class="codex-entry__visual" aria-hidden="true"><span class="codex-entry__brand-mark"></span><i>CODEX</i></span>
          <span class="codex-entry__content">
            <span class="codex-entry__eyebrow">${isEnglish ? "Additional balance" : "Дополнительный баланс"}</span>
            <strong>${isEnglish ? "Running out of Codex credits?" : "Заканчиваются кредиты Codex?"}</strong>
            <span>${isEnglish ? "Top up 250, 500, or 1,000 credits without sharing your login or password." : "Пополните 250, 500 или 1000 кредитов без логина и пароля."}</span>
          </span>
          <span class="codex-entry__button">${isEnglish ? "Top up credits" : "Пополнить кредиты"}</span>
        </a>
      </section>`);
  }

  mountCodexEntry();

  document.body.insertAdjacentHTML("beforeend", `
    <div class="chatgpt-onboarding-modal" data-onboarding-modal hidden aria-hidden="true">
      <button class="chatgpt-onboarding-modal__backdrop" type="button" data-onboarding-close aria-label="${copy.close}"></button>
      <section class="chatgpt-onboarding-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="chatgptOnboardingTitle">
        <button class="chatgpt-onboarding-modal__close" type="button" data-onboarding-close aria-label="${copy.close}">×</button>
        <span class="chatgpt-onboarding-modal__eyebrow">${copy.eyebrow}</span>
        <h2 id="chatgptOnboardingTitle">${copy.title}</h2>
        <p class="chatgpt-onboarding-modal__lead">${copy.lead}</p>
        <ol class="chatgpt-onboarding-steps">
          <li class="chatgpt-onboarding-step">
            <span class="chatgpt-onboarding-step__number">1</span>
            <span class="chatgpt-onboarding-step__copy"><strong>${copy.step1}</strong><small>${copy.step1Text}</small></span>
          </li>
          <li class="chatgpt-onboarding-step">
            <span class="chatgpt-onboarding-step__number">2</span>
            <span class="chatgpt-onboarding-step__copy"><strong>${copy.step2}</strong><small>${copy.step2Text}</small></span>
          </li>
          <li class="chatgpt-onboarding-step">
            <span class="chatgpt-onboarding-step__number">3</span>
            <span class="chatgpt-onboarding-step__copy"><strong>${copy.step3}</strong><small>${copy.step3Text}</small></span>
          </li>
        </ol>
        <details class="chatgpt-onboarding-fit">
          <summary><span class="chatgpt-onboarding-fit__summary"><span class="chatgpt-onboarding-fit__icon" aria-hidden="true">✓</span><span><strong>${copy.before}</strong><small>${copy.twoPoints}</small></span></span><span class="chatgpt-onboarding-fit__action">${copy.view} <i aria-hidden="true">⌄</i></span></summary>
          <ul class="chatgpt-onboarding-fit__list">
            <li><span aria-hidden="true">✓</span><p><strong>${copy.access}</strong><small>${copy.accessText}</small></p></li>
            <li><span aria-hidden="true">✓</span><p><strong>${copy.email}</strong><small>${copy.emailText}</small></p></li>
          </ul>
        </details>
        <div class="chatgpt-onboarding-modal__note"><span aria-hidden="true">✓</span><p><strong>${copy.result}</strong><small>${copy.resultText}</small></p></div>
        <button class="chatgpt-onboarding-modal__primary" type="button" data-onboarding-close>${copy.understood}</button>
      </section>
    </div>`);

  const modal = document.querySelector("[data-onboarding-modal]");
  let opener = null;

  function openModal(button) {
    opener = button;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("chatgpt-onboarding-is-open");
    modal.querySelector(".chatgpt-onboarding-modal__close").focus();
  }

  function closeModal() {
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("chatgpt-onboarding-is-open");
    if (opener && opener.isConnected) opener.focus();
  }

  document.addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-onboarding-open]");
    if (openButton) {
      event.preventDefault();
      openModal(openButton);
      return;
    }
    if (event.target.closest("[data-onboarding-close]")) closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });
})();
