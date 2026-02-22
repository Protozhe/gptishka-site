(function () {
  var TTL_MS = 7 * 24 * 60 * 60 * 1000;
  var SHOW_DELAY_MS = 20000;
  var STORAGE_CLOSE_KEY = "gptishka_support_widget_closed_until";
  var STORAGE_CLICK_KEY = "gptishka_support_widget_clicked_until";
  var WIDGET_ID = "gptishka-support-widget";

  function readUntil(key) {
    try {
      var raw = window.localStorage.getItem(key);
      var value = Number(raw || "0");
      return Number.isFinite(value) ? value : 0;
    } catch (_e) {
      return 0;
    }
  }

  function writeUntil(key, until) {
    try {
      window.localStorage.setItem(key, String(until));
    } catch (_e) {
      // localStorage may be blocked in privacy mode.
    }
  }

  function setSuppress(key) {
    writeUntil(key, Date.now() + TTL_MS);
  }

  function shouldSuppress() {
    var now = Date.now();
    return readUntil(STORAGE_CLOSE_KEY) > now || readUntil(STORAGE_CLICK_KEY) > now;
  }

  function closeWidget(root) {
    setSuppress(STORAGE_CLOSE_KEY);
    root.classList.remove("is-visible");
    window.setTimeout(function () {
      if (root && root.parentNode) {
        root.parentNode.removeChild(root);
      }
    }, 320);
  }

  function createWidget() {
    if (document.getElementById(WIDGET_ID)) return null;

    var root = document.createElement("aside");
    root.id = WIDGET_ID;
    root.className = "support-widget";
    root.setAttribute("role", "complementary");
    root.setAttribute("aria-label", "Виджет поддержки");
    root.innerHTML =
      '<button class="support-widget__close" type="button" aria-label="Закрыть">×</button>' +
      '<h3 class="support-widget__title">Нужна помощь?</h3>' +
      '<p class="support-widget__text">Напишите нам в поддержку — поможем с подключением.</p>' +
      '<p class="support-widget__meta">Средний ответ: ~5 минут</p>' +
      '<a class="support-widget__cta" href="https://t.me/gptishkasupp" target="_blank" rel="noopener noreferrer">Написать в Telegram</a>';

    var closeBtn = root.querySelector(".support-widget__close");
    var cta = root.querySelector(".support-widget__cta");

    closeBtn.addEventListener("click", function () {
      closeWidget(root);
    });

    cta.addEventListener("click", function () {
      setSuppress(STORAGE_CLICK_KEY);
      root.classList.remove("is-visible");
    });

    return root;
  }

  function showWidget() {
    if (shouldSuppress()) return;
    var widget = createWidget();
    if (!widget) return;

    document.body.appendChild(widget);
    window.requestAnimationFrame(function () {
      widget.classList.add("is-visible");
    });
  }

  function initSupportWidget() {
    if (!document.body) return;
    if (shouldSuppress()) return;
    window.setTimeout(showWidget, SHOW_DELAY_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSupportWidget);
  } else {
    initSupportWidget();
  }
})();
