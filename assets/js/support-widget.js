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
      '<div class="support-widget__mascot" aria-hidden="true">' +
        '<img class="support-widget__mascot-image" src="/assets/img/assistant-cat-left.gif" alt="" width="112" height="168" loading="lazy" decoding="async" />' +
      '</div>' +
      '<a class="support-widget__resume-bubble" data-resume-bubble hidden></a>' +
      '<div class="support-widget__panel">' +
        '<h3 class="support-widget__title">' + escapeHtml(text.panelTitle) + '</h3>' +
        '<p class="support-widget__text">' + escapeHtml(text.panelText) + '</p>' +
        '<p class="support-widget__meta">' + escapeHtml(text.panelMeta) + '</p>' +
        '<a class="support-widget__cta" href="' + SUPPORT_URL + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(text.panelCta) + '</a>' +
      '</div>';

    var mascot = root.querySelector(".support-widget__mascot");
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

      if (mascot) {
        mascot.style.position = "absolute";
        mascot.style.right = "0";
        mascot.style.bottom = "0";
        mascot.style.width = isMobile ? "92px" : "112px";
        mascot.style.height = isMobile ? "140px" : "168px";
      }

      if (panel) {
        panel.style.position = "absolute";
        panel.style.right = isMobile ? "78px" : "96px";
        panel.style.bottom = isMobile ? "14px" : "20px";
        panel.style.display = "none";
      }

      if (bubble) {
        bubble.style.position = "absolute";
        bubble.style.right = isMobile ? "12px" : "18px";
        bubble.style.bottom = isMobile ? "124px" : "152px";
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
