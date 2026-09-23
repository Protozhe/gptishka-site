(() => {
  "use strict";

  const grid = document.getElementById("servicePlansGrid");
  if (!grid) return;
  document.body.classList.add("chatgpt-onboarding-ready");

  const brief = `
    <section class="chatgpt-onboarding-brief" aria-label="Порядок подключения Suno">
      <div class="chatgpt-onboarding-brief__copy">
        <span class="chatgpt-onboarding-brief__mark" aria-hidden="true">✓</span>
        <span class="chatgpt-onboarding-brief__text"><strong>Подключение по ссылке на оплату</strong><small>После оплаты GPTishka отправьте ссылку Stripe Checkout выбранного тарифа. Доступ к аккаунту нам не нужен.</small></span>
      </div>
      <button class="chatgpt-onboarding-brief__details" type="button" data-suno-onboarding-open><span>Как это работает</span><span class="chatgpt-onboarding-brief__arrow" aria-hidden="true">→</span></button>
    </section>`;

  function mountBrief() {
    const card = grid.querySelector(".price-card");
    const buyButton = card?.querySelector(".pay-now-btn");
    if (!buyButton || card.querySelector(".chatgpt-onboarding-brief")) return;
    buyButton.insertAdjacentHTML("beforebegin", brief);
  }

  new MutationObserver(mountBrief).observe(grid, { childList: true, subtree: true });
  mountBrief();

  document.body.insertAdjacentHTML("beforeend", `
    <div class="chatgpt-onboarding-modal" data-suno-onboarding-modal hidden aria-hidden="true">
      <button class="chatgpt-onboarding-modal__backdrop" type="button" data-suno-onboarding-close aria-label="Закрыть"></button>
      <section class="chatgpt-onboarding-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="sunoOnboardingTitle">
        <button class="chatgpt-onboarding-modal__close" type="button" data-suno-onboarding-close aria-label="Закрыть">×</button>
        <span class="chatgpt-onboarding-modal__eyebrow">3 шага</span>
        <h2 id="sunoOnboardingTitle">Как проходит подключение</h2>
        <p class="chatgpt-onboarding-modal__lead">Вы оплачиваете заказ GPTishka, затем передаёте ссылку на оплату того же тарифа в Suno.</p>
        <ol class="chatgpt-onboarding-steps">
          <li class="chatgpt-onboarding-step"><span class="chatgpt-onboarding-step__number">1</span><span class="chatgpt-onboarding-step__copy"><strong>Оплатите заказ GPTishka</strong><small>Выберите Pro или Premier на один месяц.</small></span></li>
          <li class="chatgpt-onboarding-step"><span class="chatgpt-onboarding-step__number">2</span><span class="chatgpt-onboarding-step__copy"><strong>Создайте ссылку Suno</strong><small>В своём аккаунте откройте Stripe Checkout для того же месячного тарифа. Не оплачивайте её самостоятельно.</small></span></li>
          <li class="chatgpt-onboarding-step"><span class="chatgpt-onboarding-step__number">3</span><span class="chatgpt-onboarding-step__copy"><strong>Отправьте ссылку</strong><small>Вставьте полную ссылку в защищённую форму после оплаты. Менеджер проверит её и завершит подключение.</small></span></li>
        </ol>
        <div class="chatgpt-onboarding-modal__note"><span aria-hidden="true">✓</span><p><strong>Логин и пароль не нужны</strong><small>Если возникнут сложности, менеджер свяжется с вами по контакту из заказа.</small></p></div>
        <button class="chatgpt-onboarding-modal__primary" type="button" data-suno-onboarding-close>Понятно</button>
      </section>
    </div>`);

  const modal = document.querySelector("[data-suno-onboarding-modal]");
  let opener = null;
  function closeModal() {
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("chatgpt-onboarding-is-open");
    if (opener?.isConnected) opener.focus();
  }
  document.addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-suno-onboarding-open]");
    if (openButton) {
      opener = openButton;
      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("chatgpt-onboarding-is-open");
      modal.querySelector(".chatgpt-onboarding-modal__close").focus();
    } else if (event.target.closest("[data-suno-onboarding-close]")) {
      closeModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });
})();
