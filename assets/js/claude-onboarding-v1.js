(function () {
  "use strict";

  const grid = document.getElementById("servicePlansGrid");
  if (!grid) return;

  const isEnglish = document.documentElement.lang.toLowerCase().startsWith("en") || location.pathname.startsWith("/en/");
  const copy = isEnglish ? {
    briefLabel: "Important information before purchasing Claude",
    briefTitle: "Official subscription activation",
    briefText: "A short guide will open after payment. Your account and chats stay intact.",
    how: "How it works",
    close: "Close",
    eyebrow: "3 short steps",
    title: "How we activate Claude",
    lead: "We pay for the subscription through the official checkout and guide you through every step.",
    step1: "Choose and pay for a plan",
    step1Text: "Choose Claude Pro.",
    step2: "Follow the short guide",
    step2Text: "A secure form with clear prompts opens after payment.",
    step3: "Get your subscription",
    step3Text: "We activate the selected plan and notify you when it is ready.",
    before: "Before payment",
    twoPoints: "Two quick checks",
    view: "View",
    recommended: "Gmail or iCloud email",
    recommendedText: "These addresses are recommended for the most reliable Claude activation.",
    other: "A different email provider",
    otherText: "Contact us before payment and we will check account compatibility free of charge.",
    result: "Official payment and support until completion",
    resultText: "We pay for the subscription through the official checkout. If help is needed, a support specialist will continue the order at no extra cost.",
    understood: "Got it"
  } : {
    briefLabel: "Главное перед покупкой Claude",
    briefTitle: "Официальное подключение подписки",
    briefText: "После оплаты откроется короткая инструкция. Аккаунт и ваши чаты сохранятся.",
    how: "Как это работает",
    close: "Закрыть",
    eyebrow: "3 коротких шага",
    title: "Как подключим Claude",
    lead: "Оформим подписку официальным способом, а на каждом этапе покажем, что делать дальше.",
    step1: "Выберите и оплатите тариф",
    step1Text: "Выберите Claude Pro.",
    step2: "Следуйте короткой инструкции",
    step2Text: "После оплаты откроется защищённая форма с понятными подсказками.",
    step3: "Получите подписку",
    step3Text: "Мы подключим выбранный тариф и сообщим о результате.",
    before: "Перед оплатой",
    twoPoints: "Два простых пункта",
    view: "Посмотреть",
    recommended: "Почта Gmail или iCloud",
    recommendedText: "Это рекомендуемые адреса для наиболее стабильного подключения Claude.",
    other: "Почта на другом домене",
    otherText: "Напишите нам перед оплатой — бесплатно проверим совместимость аккаунта.",
    result: "Официальная оплата и помощь до результата",
    resultText: "Мы оплачиваем подписку официальным способом. Если понадобится помощь, заказ продолжит специалист поддержки без доплаты.",
    understood: "Всё понятно"
  };

  const maxCopy = isEnglish ? {
    briefTitle: "Account sign-in with manager support",
    briefText: "After payment, a manager will contact you and request the account details needed for activation.",
    title: "How we connect Claude Max",
    lead: "Max 5x and Max 20x are connected manually with sign-in to your account. No login or password is needed in the order form.",
    step1Text: "Choose Max 5x or Max 20x and pay for your order.",
    step2: "Wait for the manager",
    step2Text: "We will contact you using the email or Telegram in your order and request the account details needed for activation.",
    step3Text: "We will connect the selected Max plan and notify you when it is ready.",
    resultText: "A specialist will handle your order after payment and stay in touch until activation is complete."
  } : {
    briefTitle: "Подключение со входом в аккаунт",
    briefText: "После оплаты менеджер свяжется с вами и запросит данные аккаунта для подключения.",
    title: "Как подключим Claude Max",
    lead: "Max 5x и Max 20x подключаются вручную со входом в ваш аккаунт. В форме заказа логин и пароль не нужны.",
    step1Text: "Выберите Max 5x или Max 20x и оплатите заказ.",
    step2: "Дождитесь менеджера",
    step2Text: "Мы свяжемся с вами по почте или в Telegram из заказа и запросим данные аккаунта для подключения.",
    step3Text: "Подключим выбранный тариф Max и сообщим, когда всё будет готово.",
    resultText: "После оплаты заказ обработает специалист и останется на связи до завершения подключения."
  };

  document.body.classList.add("claude-onboarding-ready");

  const markupFor = (planCopy) => `
    <section class="chatgpt-onboarding-brief" aria-label="${copy.briefLabel}">
      <div class="chatgpt-onboarding-brief__copy">
        <span class="chatgpt-onboarding-brief__mark" aria-hidden="true">✓</span>
        <span class="chatgpt-onboarding-brief__text"><strong>${planCopy.briefTitle}</strong><small>${planCopy.briefText}</small></span>
      </div>
      <button class="chatgpt-onboarding-brief__details" type="button" data-claude-onboarding-open><span>${copy.how}</span><span class="chatgpt-onboarding-brief__arrow" aria-hidden="true">→</span></button>
    </section>`;

  function mountBrief() {
    const card = grid.querySelector(".price-card");
    const buyButton = card && card.querySelector(".pay-now-btn");
    if (!card || !buyButton || card.querySelector(".chatgpt-onboarding-brief")) return;
    const planCopy = String(card.dataset.planKey || "").startsWith("max-") ? { ...copy, ...maxCopy } : copy;
    buyButton.insertAdjacentHTML("beforebegin", markupFor(planCopy));
    const detailsButton = card.querySelector("[data-claude-onboarding-open]");
    if (detailsButton) {
      detailsButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        openModal(detailsButton);
      });
    }
  }

  new MutationObserver(mountBrief).observe(grid, { childList: true, subtree: true });
  mountBrief();

  document.body.insertAdjacentHTML("beforeend", `
    <div class="chatgpt-onboarding-modal" data-claude-onboarding-modal hidden aria-hidden="true">
      <button class="chatgpt-onboarding-modal__backdrop" type="button" data-claude-onboarding-close aria-label="${copy.close}"></button>
      <section class="chatgpt-onboarding-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="claudeOnboardingTitle">
        <button class="chatgpt-onboarding-modal__close" type="button" data-claude-onboarding-close aria-label="${copy.close}">×</button>
        <span class="chatgpt-onboarding-modal__eyebrow">${copy.eyebrow}</span>
        <h2 id="claudeOnboardingTitle">${copy.title}</h2>
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
            <li><span aria-hidden="true">✓</span><p><strong>${copy.recommended}</strong><small>${copy.recommendedText}</small></p></li>
            <li><span aria-hidden="true">✓</span><p><strong>${copy.other}</strong><small>${copy.otherText}</small></p></li>
          </ul>
        </details>
        <div class="chatgpt-onboarding-modal__note"><span aria-hidden="true">✓</span><p><strong>${copy.result}</strong><small>${copy.resultText}</small></p></div>
        <button class="chatgpt-onboarding-modal__primary" type="button" data-claude-onboarding-close>${copy.understood}</button>
      </section>
    </div>`);

  const modal = document.querySelector("[data-claude-onboarding-modal]");
  let opener = null;

  function setModalCopy(planCopy) {
    const setText = (selector, value) => {
      const element = modal.querySelector(selector);
      if (element) element.textContent = value;
    };
    setText("#claudeOnboardingTitle", planCopy.title);
    setText(".chatgpt-onboarding-modal__lead", planCopy.lead);
    setText(".chatgpt-onboarding-step:nth-child(1) small", planCopy.step1Text);
    setText(".chatgpt-onboarding-step:nth-child(2) strong", planCopy.step2);
    setText(".chatgpt-onboarding-step:nth-child(2) small", planCopy.step2Text);
    setText(".chatgpt-onboarding-step:nth-child(3) small", planCopy.step3Text);
    setText(".chatgpt-onboarding-modal__note small", planCopy.resultText);
  }

  function openModal(button) {
    opener = button;
    const isMax = String(button.closest(".price-card")?.dataset.planKey || "").startsWith("max-");
    setModalCopy(isMax ? { ...copy, ...maxCopy } : copy);
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
    const openButton = event.target.closest("[data-claude-onboarding-open]");
    if (openButton) {
      event.preventDefault();
      openModal(openButton);
      return;
    }
    if (event.target.closest("[data-claude-onboarding-close]")) closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });
})();
