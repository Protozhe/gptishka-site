(function () {
  "use strict";

  const grid = document.getElementById("servicePlansGrid");
  if (!grid) return;

  const markup = `
    <section class="chatgpt-onboarding-brief" aria-label="Главное перед покупкой">
      <div class="chatgpt-onboarding-brief__copy">
        <span class="chatgpt-onboarding-brief__mark" aria-hidden="true">✓</span>
        <span class="chatgpt-onboarding-brief__text"><strong>Подключение без входа в аккаунт</strong><small>После оплаты откроется короткая инструкция. История чатов сохранится.</small></span>
      </div>
      <button class="chatgpt-onboarding-brief__details" type="button" data-onboarding-open><span>Как это работает</span><span class="chatgpt-onboarding-brief__arrow" aria-hidden="true">→</span></button>
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
    <div class="chatgpt-onboarding-modal" data-onboarding-modal hidden aria-hidden="true">
      <button class="chatgpt-onboarding-modal__backdrop" type="button" data-onboarding-close aria-label="Закрыть"></button>
      <section class="chatgpt-onboarding-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="chatgptOnboardingTitle">
        <button class="chatgpt-onboarding-modal__close" type="button" data-onboarding-close aria-label="Закрыть">×</button>
        <span class="chatgpt-onboarding-modal__eyebrow">3 коротких шага</span>
        <h2 id="chatgptOnboardingTitle">Как проходит подключение</h2>
        <p class="chatgpt-onboarding-modal__lead">Следуйте подсказкам на экране — мы покажем, что делать дальше.</p>
        <ol class="chatgpt-onboarding-steps">
          <li class="chatgpt-onboarding-step">
            <span class="chatgpt-onboarding-step__number">1</span>
            <span class="chatgpt-onboarding-step__copy"><strong>Оплатите тариф</strong><small>Выберите подходящий план и удобный способ оплаты.</small></span>
          </li>
          <li class="chatgpt-onboarding-step">
            <span class="chatgpt-onboarding-step__number">2</span>
            <span class="chatgpt-onboarding-step__copy"><strong>Вставьте токен</strong><small>После оплаты откроется форма с короткой инструкцией.</small></span>
          </li>
          <li class="chatgpt-onboarding-step">
            <span class="chatgpt-onboarding-step__number">3</span>
            <span class="chatgpt-onboarding-step__copy"><strong>Получите подписку</strong><small>Страница покажет процесс и сообщит о результате.</small></span>
          </li>
        </ol>
        <details class="chatgpt-onboarding-fit">
          <summary><span class="chatgpt-onboarding-fit__summary"><span class="chatgpt-onboarding-fit__icon" aria-hidden="true">✓</span><span><strong>Перед оплатой</strong><small>Два коротких пункта</small></span></span><span class="chatgpt-onboarding-fit__action">Посмотреть <i aria-hidden="true">⌄</i></span></summary>
          <ul class="chatgpt-onboarding-fit__list">
            <li><span aria-hidden="true">✓</span><p><strong>Есть доступ к аккаунту</strong><small>И к привязанной электронной почте.</small></p></li>
            <li><span aria-hidden="true">✓</span><p><strong>Почта аккаунта</strong><small>Подойдут Gmail и другие зарубежные адреса. Yandex, Mail.ru и VK Почта не принимаются.</small></p></li>
          </ul>
        </details>
        <div class="chatgpt-onboarding-modal__note"><span aria-hidden="true">✓</span><p><strong>Мы доведём подключение до результата</strong><small>Если понадобится помощь, заказ автоматически продолжит специалист поддержки. Доплачивать не нужно.</small></p></div>
        <button class="chatgpt-onboarding-modal__primary" type="button" data-onboarding-close>Всё понятно</button>
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

