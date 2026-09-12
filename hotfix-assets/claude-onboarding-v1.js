(function () {
  "use strict";

  const grid = document.getElementById("servicePlansGrid");
  if (!grid) return;

  document.body.classList.add("claude-onboarding-ready");

  const markup = `
    <section class="chatgpt-onboarding-brief" aria-label="Главное перед покупкой Claude">
      <div class="chatgpt-onboarding-brief__copy">
        <span class="chatgpt-onboarding-brief__mark" aria-hidden="true">✓</span>
        <span class="chatgpt-onboarding-brief__text"><strong>Официальное подключение подписки</strong><small>После оплаты откроется короткая инструкция. Аккаунт и ваши чаты сохранятся.</small></span>
      </div>
      <button class="chatgpt-onboarding-brief__details" type="button" data-claude-onboarding-open><span>Как это работает</span><span class="chatgpt-onboarding-brief__arrow" aria-hidden="true">→</span></button>
    </section>`;

  function mountBrief() {
    const card = grid.querySelector(".price-card");
    const buyButton = card && card.querySelector(".pay-now-btn");
    if (!card || !buyButton || card.querySelector(".chatgpt-onboarding-brief")) return;
    buyButton.insertAdjacentHTML("beforebegin", markup);
  }

  new MutationObserver(mountBrief).observe(grid, { childList: true, subtree: true });
  mountBrief();

  document.body.insertAdjacentHTML("beforeend", `
    <div class="chatgpt-onboarding-modal" data-claude-onboarding-modal hidden aria-hidden="true">
      <button class="chatgpt-onboarding-modal__backdrop" type="button" data-claude-onboarding-close aria-label="Закрыть"></button>
      <section class="chatgpt-onboarding-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="claudeOnboardingTitle">
        <button class="chatgpt-onboarding-modal__close" type="button" data-claude-onboarding-close aria-label="Закрыть">×</button>
        <span class="chatgpt-onboarding-modal__eyebrow">3 коротких шага</span>
        <h2 id="claudeOnboardingTitle">Как подключим Claude</h2>
        <p class="chatgpt-onboarding-modal__lead">Оформим подписку официальным способом, а на каждом этапе покажем, что делать дальше.</p>
        <ol class="chatgpt-onboarding-steps">
          <li class="chatgpt-onboarding-step">
            <span class="chatgpt-onboarding-step__number">1</span>
            <span class="chatgpt-onboarding-step__copy"><strong>Выберите и оплатите тариф</strong><small>Подойдёт PRO, MAX 5x или MAX 20x.</small></span>
          </li>
          <li class="chatgpt-onboarding-step">
            <span class="chatgpt-onboarding-step__number">2</span>
            <span class="chatgpt-onboarding-step__copy"><strong>Следуйте короткой инструкции</strong><small>После оплаты откроется защищённая форма с понятными подсказками.</small></span>
          </li>
          <li class="chatgpt-onboarding-step">
            <span class="chatgpt-onboarding-step__number">3</span>
            <span class="chatgpt-onboarding-step__copy"><strong>Получите подписку</strong><small>Мы подключим выбранный тариф и сообщим о результате.</small></span>
          </li>
        </ol>
        <details class="chatgpt-onboarding-fit">
          <summary><span class="chatgpt-onboarding-fit__summary"><span class="chatgpt-onboarding-fit__icon" aria-hidden="true">✓</span><span><strong>Перед оплатой</strong><small>Два простых пункта</small></span></span><span class="chatgpt-onboarding-fit__action">Посмотреть <i aria-hidden="true">⌄</i></span></summary>
          <ul class="chatgpt-onboarding-fit__list">
            <li><span aria-hidden="true">✓</span><p><strong>Почта Gmail или iCloud</strong><small>Это рекомендуемые адреса для наиболее стабильного подключения Claude.</small></p></li>
            <li><span aria-hidden="true">✓</span><p><strong>Почта на другом домене</strong><small>Напишите нам перед оплатой — бесплатно проверим совместимость аккаунта.</small></p></li>
          </ul>
        </details>
        <div class="chatgpt-onboarding-modal__note"><span aria-hidden="true">✓</span><p><strong>Официальная оплата и помощь до результата</strong><small>Мы оплачиваем подписку официальным способом. Если понадобится помощь, заказ продолжит специалист поддержки без доплаты.</small></p></div>
        <button class="chatgpt-onboarding-modal__primary" type="button" data-claude-onboarding-close>Всё понятно</button>
      </section>
    </div>`);

  const modal = document.querySelector("[data-claude-onboarding-modal]");
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
