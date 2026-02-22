(function () {
  var TTL_MS = 7 * 24 * 60 * 60 * 1000;
  var SHOW_DELAY_MS = 20000;
  var STORAGE_CLOSE_KEY = "gptishka_support_widget_closed_until";
  var STORAGE_CLICK_KEY = "gptishka_support_widget_clicked_until";
  var WIDGET_ID = "gptishka-support-widget";
  var FORCE_SHOW_QUERY_KEY = "supportWidget";

  function clearSuppressState() {
    try {
      window.localStorage.removeItem(STORAGE_CLOSE_KEY);
      window.localStorage.removeItem(STORAGE_CLICK_KEY);
    } catch (_e) {
      // localStorage may be blocked in privacy mode.
    }
  }

  function hasForceShowFlag() {
    try {
      var params = new URLSearchParams(window.location.search);
      var value = params.get(FORCE_SHOW_QUERY_KEY);
      if (!value) return false;
      value = String(value).toLowerCase();
      return value === "1" || value === "true" || value === "on";
    } catch (_e) {
      return false;
    }
  }

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

  function showWidget(forceShow) {
    if (!forceShow && shouldSuppress()) return;
    var widget = createWidget();
    if (!widget) return;

    document.body.appendChild(widget);
    var activated = false;
    var activate = function () {
      if (activated) return;
      activated = true;
      widget.classList.add("is-visible");
    };
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(activate);
    }
    window.setTimeout(activate, 60);
  }

  function initSupportWidget() {
    if (!document.body) return;
    var forceShow = hasForceShowFlag();
    if (forceShow) {
      clearSuppressState();
    } else if (shouldSuppress()) {
      return;
    }
    window.setTimeout(function () {
      showWidget(forceShow);
    }, forceShow ? 300 : SHOW_DELAY_MS);
  }

  window.gptishkaSupportWidget = {
    showNow: function () {
      showWidget(true);
    },
    resetSuppress: function () {
      clearSuppressState();
    },
    getSuppressState: function () {
      return {
        closeUntil: readUntil(STORAGE_CLOSE_KEY),
        clickUntil: readUntil(STORAGE_CLICK_KEY)
      };
    }
  };
  Object.freeze(window.gptishkaSupportWidget);

  if (hasForceShowFlag()) {
    // Helps to debug quickly in browser console.
    window.console.info("[support-widget] force show mode is enabled via ?supportWidget=1");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSupportWidget);
  } else {
    initSupportWidget();
  }
})();
