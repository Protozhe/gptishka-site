(function () {
  "use strict";

  var layout = document.querySelector(".codex-checkout-layout");
  var form = document.querySelector("[data-codex-order-form]");
  var details = document.querySelector(".codex-details");
  var process = document.querySelector(".codex-info");
  var terms = document.querySelector(".codex-terms");
  if (!layout || !form || form.dataset.calmLayout === "1") return;
  form.dataset.calmLayout = "1";

  layout.insertAdjacentHTML("beforebegin", `
    <section class="codex-calm-intro" aria-labelledby="codexCalmTitle">
      <span class="codex-calm-intro__eyebrow">Дополнительный баланс</span>
      <h1 id="codexCalmTitle">Пополнить Codex</h1>
      <p>Выберите пакет и оплатите заказ. После оплаты откроется короткая инструкция.</p>
      <div class="codex-calm-trust" aria-label="Преимущества">
        <span>Без логина и пароля</span>
        <span>Поможем до результата</span>
      </div>
    </section>`);

  var heading = form.querySelector(".codex-order__head h2");
  if (heading) heading.textContent = "Выберите пакет";

  var fields = Array.from(form.querySelectorAll(":scope > .codex-field"));
  if (fields.length) {
    var contactTitle = document.createElement("h3");
    contactTitle.className = "codex-calm-section-title";
    contactTitle.innerHTML = '<span aria-hidden="true">2</span>Контакты';
    fields[0].before(contactTitle);

    var contactGrid = document.createElement("div");
    contactGrid.className = "codex-calm-contact-grid";
    fields[0].before(contactGrid);
    fields.forEach(function (field) { contactGrid.appendChild(field); });

    var email = contactGrid.querySelector('input[name="email"]');
    var telegram = contactGrid.querySelector('input[name="telegram"]');
    if (email) email.placeholder = "Ваш email";
    if (telegram) telegram.placeholder = "Telegram для связи";
  }

  var confirmation = form.querySelector(".codex-confirm span");
  if (confirmation) confirmation.textContent = "На аккаунте доступна покупка дополнительных кредитов Codex";

  form.querySelectorAll(".codex-payment small").forEach(function (caption) {
    caption.remove();
  });

  if (details) {
    var compatibility = document.createElement("details");
    compatibility.className = "codex-calm-more";
    compatibility.innerHTML = `
      <summary>Подойдёт ли мой аккаунт?</summary>
      <div class="codex-calm-more__body">
        <p><strong>Подходит:</strong> в вашем аккаунте ChatGPT уже доступна покупка дополнительных кредитов Codex.</p>
        <p>Free-аккаунты к пополнению не принимаются. Пароль, 2FA и доступ к почте не нужны.</p>
      </div>`;
    form.insertAdjacentElement("afterend", compatibility);
  }

  var after = document.createElement("details");
  after.className = "codex-calm-more codex-calm-after";
  after.innerHTML = `
    <summary>Что будет после оплаты?</summary>
    <div class="codex-calm-more__body">
      <p><strong>1.</strong> Откроется защищённая страница с короткой инструкцией.</p>
      <p><strong>2.</strong> Вы вставите временный платёжный токен.</p>
      <p><strong>3.</strong> Мы пополним баланс и покажем результат заказа.</p>
      <p>Если потребуется помощь, подключится специалист поддержки без доплаты.</p>
    </div>`;
  form.parentElement.insertAdjacentElement("afterend", after);

  if (process) process.hidden = true;
  if (terms) terms.hidden = true;
})();
