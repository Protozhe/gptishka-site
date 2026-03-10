(function () {
  var WIDGET_ID = "gptishka-support-widget";
  var SUPPORT_URL = "https://t.me/gptishkasupp";
  var FORCE_SHOW_QUERY_KEY = "supportWidget";
  var HIDE_PATHS = [
    "/404.html",
    "/500.html",
    "/fail.html",
    "/success.html",
    "/en/fail.html",
    "/en/success.html"
  ];

  var ACTIVATION_LAST_ORDER_ID_KEY = "gptishka_activation_order_id";
  var ACTIVATION_ORDER_TOKEN_PREFIX = "gptishka_activation_order_token:";
  var ACTIVATION_RESUME_URL_KEY = "gptishka_activation_resume_url";
  var ACTIVATION_RESUME_SAVED_AT_KEY = "gptishka_activation_saved_at";
  var ACTIVATION_RESUME_TTL_MS = 60 * 60 * 1000;

  function trackWidgetEvent(eventName, payload) {
    if (typeof window.gptishkaTrackEvent === "function") {
      window.gptishkaTrackEvent(eventName, payload || {});
      return;
    }
    if (typeof window.ym === "function") {
      try {
        window.ym(106969126, "reachGoal", eventName, payload || {});
      } catch (_e) {
        // Ignore analytics transport errors.
      }
    }
  }

  function getPathLower() {
    return String(window.location.pathname || "").toLowerCase();
  }

  function isEnPage() {
    return getPathLower().startsWith("/en/");
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

  function shouldSkipPage() {
    var currentPath = getPathLower();
    if (!currentPath) return false;
    return HIDE_PATHS.indexOf(currentPath) !== -1;
  }

  function clearStoredActivationResumeContext(orderId) {
    var safeOrderId = String(orderId || "").trim();
    try {
      var lastOrderId = safeOrderId || String(localStorage.getItem(ACTIVATION_LAST_ORDER_ID_KEY) || "").trim();
      if (lastOrderId) {
        localStorage.removeItem(ACTIVATION_ORDER_TOKEN_PREFIX + lastOrderId);
      }
      localStorage.removeItem(ACTIVATION_LAST_ORDER_ID_KEY);
      localStorage.removeItem(ACTIVATION_RESUME_URL_KEY);
      localStorage.removeItem(ACTIVATION_RESUME_SAVED_AT_KEY);
    } catch (_) {
      // localStorage may be blocked in privacy mode.
    }
  }

  function readStoredActivationResumeContext() {
    try {
      var savedAt = Number(localStorage.getItem(ACTIVATION_RESUME_SAVED_AT_KEY) || "0");
      if (!Number.isFinite(savedAt) || savedAt <= 0 || Date.now() - savedAt > ACTIVATION_RESUME_TTL_MS) {
        clearStoredActivationResumeContext();
        return { orderId: "", token: "" };
      }

      var orderId = String(localStorage.getItem(ACTIVATION_LAST_ORDER_ID_KEY) || "").trim();
      var token = orderId
        ? String(localStorage.getItem(ACTIVATION_ORDER_TOKEN_PREFIX + orderId) || "").trim()
        : "";

      if ((!token || !orderId)) {
        var resumeUrlRaw = String(localStorage.getItem(ACTIVATION_RESUME_URL_KEY) || "").trim();
        if (resumeUrlRaw) {
          try {
            var parsed = new URL(resumeUrlRaw, window.location.origin);
            var urlOrderId = String(parsed.searchParams.get("order_id") || parsed.searchParams.get("orderId") || "").trim();
            var urlToken = String(parsed.searchParams.get("t") || "").trim();
            if (!orderId && urlOrderId) orderId = urlOrderId;
            if (!token && urlToken) token = urlToken;
          } catch (_) {
            // Ignore malformed URLs in storage.
          }
        }
      }

      if (!orderId || !token) {
        clearStoredActivationResumeContext(orderId);
        return { orderId: "", token: "" };
      }

      return { orderId: orderId, token: token };
    } catch (_) {
      return { orderId: "", token: "" };
    }
  }

  function buildActivationResumeUrl(orderId, token) {
    var path = isEnPage() ? "/en/redeem-start.html" : "/redeem-start.html";
    var url = new URL(path, window.location.origin);
    url.searchParams.set("order_id", String(orderId || "").trim());
    url.searchParams.set("t", String(token || "").trim());
    return url.toString();
  }

  function canShowResumePrompt() {
    var path = getPathLower();
    return !(path.includes("redeem-start.html") || path.includes("success.html") || path.includes("fail.html"));
  }

  function resolveActivationResumeUrl() {
    if (!canShowResumePrompt()) return "";
    var ctx = readStoredActivationResumeContext();
    if (!ctx.orderId || !ctx.token) return "";
    return buildActivationResumeUrl(ctx.orderId, ctx.token);
  }

  function clearLegacyResumeShortcut() {
    var nodes = document.querySelectorAll(".gptishka-resume-activation");
    nodes.forEach(function (node) {
      node.remove();
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function createWidget() {
    if (document.getElementById(WIDGET_ID)) return null;

    var en = isEnPage();
    var text = en
      ? {
          rootLabel: "Support mascot",
          supportAria: "Open support in Telegram",
          panelTitle: "Need help?",
          panelText: "Write to support, we will help you with activation.",
          panelMeta: "Average response: ~5 minutes",
          panelCta: "Write in Telegram",
          resumeLead: "Looks like you forgot to finish activation.",
          resumeCta: "Resume activation",
          resumeAria: "Resume order activation"
        }
      : {
          rootLabel: "Кот-помощник",
          supportAria: "Открыть поддержку в Telegram",
          panelTitle: "Нужна помощь?",
          panelText: "Напишите нам в поддержку — поможем с подключением.",
          panelMeta: "Средний ответ: ~5 минут",
          panelCta: "Написать в Telegram",
          resumeLead: "Похоже, вы забыли завершить активацию.",
          resumeCta: "Продолжить активацию",
          resumeAria: "Продолжить активацию заказа"
        };

    var root = document.createElement("aside");
    root.id = WIDGET_ID;
    root.className = "support-widget";
    root.setAttribute("role", "complementary");
    root.setAttribute("aria-label", text.rootLabel);

    root.innerHTML =
      '<a class="support-widget__fab" href="' + SUPPORT_URL + '" target="_blank" rel="noopener noreferrer" aria-label="' + escapeHtml(text.supportAria) + '">' +
        '<span class="support-widget__fab-icon" aria-hidden="true">' +
          '<img class="support-widget__fab-mascot" src="/assets/img/assistant-cat-left.gif" alt="" width="112" height="168" loading="lazy" decoding="async" />' +
        '</span>' +
      '</a>' +
      '<div class="support-widget__float-stack" aria-hidden="true">' +
        '<a class="support-widget__resume-bubble" data-resume-bubble hidden></a>' +
        '<div class="support-widget__panel">' +
          '<h3 class="support-widget__title">' + escapeHtml(text.panelTitle) + '</h3>' +
          '<p class="support-widget__text">' + escapeHtml(text.panelText) + '</p>' +
          '<p class="support-widget__meta">' + escapeHtml(text.panelMeta) + '</p>' +
          '<a class="support-widget__cta" href="' + SUPPORT_URL + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(text.panelCta) + '</a>' +
        '</div>' +
      '</div>';

    var fab = root.querySelector(".support-widget__fab");
    var stack = root.querySelector(".support-widget__float-stack");
    var panel = root.querySelector(".support-widget__panel");
    var cta = root.querySelector(".support-widget__cta");
    var bubble = root.querySelector("[data-resume-bubble]");

    applyFallbackLayout();

    var panelTracked = false;
    var onPanelOpenTrack = function () {
      if (panelTracked) return;
      panelTracked = true;
      trackWidgetEvent("support_widget_open");
    };

    var openPanel = function () {
      root.classList.add("is-open");
      if (panel) panel.style.display = "block";
      onPanelOpenTrack();
    };

    var closePanel = function () {
      root.classList.remove("is-open");
      if (panel) panel.style.display = "none";
    };

    root.addEventListener("mouseenter", openPanel);
    root.addEventListener("mouseleave", closePanel);
    root.addEventListener("focusin", openPanel);
    root.addEventListener("focusout", function () {
      if (!root.contains(document.activeElement)) {
        closePanel();
      }
    });

    if (fab) {
      fab.addEventListener("click", function () {
        trackWidgetEvent("support_widget_click", { source: "mascot_fab" });
      });
    }

    if (cta) {
      cta.addEventListener("click", function () {
        trackWidgetEvent("support_widget_click", { source: "panel_cta" });
      });
    }

    var resumeUrl = resolveActivationResumeUrl();
    if (bubble && resumeUrl) {
      bubble.href = resumeUrl;
      bubble.hidden = false;
      bubble.classList.add("is-visible");
      bubble.setAttribute("aria-label", text.resumeAria);
      bubble.innerHTML =
        '<span class="support-widget__resume-text">' + escapeHtml(text.resumeLead) + '</span>' +
        '<span class="support-widget__resume-cta">' + escapeHtml(text.resumeCta) + '</span>';
      bubble.addEventListener("click", function () {
        trackWidgetEvent("resume_activation_click", {
          source: "mascot_prompt"
        });
      });
    }

    function applyFallbackLayout() {
      var isMobile = typeof window.matchMedia === "function"
        ? window.matchMedia("(max-width: 640px)").matches
        : window.innerWidth <= 640;

      root.style.position = "fixed";
      root.style.right = isMobile ? "10px" : "20px";
      root.style.bottom = isMobile ? "10px" : "20px";
      root.style.left = "auto";
      root.style.top = "auto";
      root.style.margin = "0";
      root.style.zIndex = "10050";
      root.style.width = isMobile ? "92px" : "112px";
      root.style.height = isMobile ? "140px" : "168px";
      root.style.pointerEvents = "auto";

      if (fab) {
        fab.style.position = "absolute";
        fab.style.right = "0";
        fab.style.bottom = "0";
        fab.style.width = isMobile ? "92px" : "112px";
        fab.style.height = isMobile ? "140px" : "168px";
      }

      if (stack) {
        stack.style.position = "absolute";
        stack.style.right = isMobile ? "78px" : "96px";
        stack.style.bottom = isMobile ? "14px" : "20px";
        stack.style.display = "grid";
        stack.style.gap = isMobile ? "8px" : "10px";
      }

      if (panel) {
        panel.style.position = "relative";
        panel.style.display = "none";
      }

      if (bubble) {
        bubble.style.position = "relative";
      }
    }

    return root;
  }

  function showWidget() {
    var widget = createWidget();
    if (!widget) return;

    document.body.appendChild(widget);

    var activate = function () {
      widget.classList.add("is-visible");
    };

    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(activate);
    }
    window.setTimeout(activate, 30);
  }

  function initSupportWidget() {
    if (!document.body) return;
    if (shouldSkipPage()) return;

    showWidget();
    clearLegacyResumeShortcut();

    var cleanupObserver = new MutationObserver(function () {
      clearLegacyResumeShortcut();
    });
    cleanupObserver.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(function () {
      cleanupObserver.disconnect();
    }, 20000);
  }

  window.gptishkaSupportWidget = {
    showNow: function () {
      showWidget();
    },
    resetSuppress: function () {
      // Legacy API: no suppression in mascot mode.
    },
    getSuppressState: function () {
      return {
        closeUntil: 0,
        clickUntil: 0
      };
    }
  };
  Object.freeze(window.gptishkaSupportWidget);

  if (hasForceShowFlag()) {
    window.console.info("[support-widget] force show mode is enabled via ?supportWidget=1");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSupportWidget);
  } else {
    initSupportWidget();
  }
})();
