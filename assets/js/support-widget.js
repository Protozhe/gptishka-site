(function () {
  var WIDGET_ID = "gptishka-support-widget";
  var SUPPORT_URL = "https://t.me/aiiisupport";
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
  var SUPPORT_WIDGET_ACTIVATION_SAVED_AT_KEY = "gptishka_activation_saved_at";
  var ACTIVATION_RESUME_COLLAPSED_PREFIX = "gptishka_activation_resume_collapsed:";
  var ACTIVATION_RESUME_TTL_MS = 365 * 24 * 60 * 60 * 1000;

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
    if (getPathLower().startsWith("/en/")) return true;
    try {
      return new URLSearchParams(window.location.search).get("lang") === "en";
    } catch (_e) {
      return false;
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

  function shouldSkipPage() {
    var currentPath = getPathLower();
    if (!currentPath) return false;
    return HIDE_PATHS.indexOf(currentPath) !== -1;
  }

  function clearStoredActivationResumeContext(orderId) {
    var safeOrderId = String(orderId || "").trim();
    var lastOrderId = safeOrderId;
    try {
      lastOrderId = safeOrderId || String(localStorage.getItem(ACTIVATION_LAST_ORDER_ID_KEY) || "").trim();
      if (lastOrderId) {
        localStorage.removeItem(ACTIVATION_ORDER_TOKEN_PREFIX + lastOrderId);
      }
      localStorage.removeItem(ACTIVATION_LAST_ORDER_ID_KEY);
      localStorage.removeItem(ACTIVATION_RESUME_URL_KEY);
      localStorage.removeItem(SUPPORT_WIDGET_ACTIVATION_SAVED_AT_KEY);
    } catch (_) {
      // localStorage may be blocked in privacy mode.
    }
    if (!lastOrderId) return;
    try {
      sessionStorage.removeItem(ACTIVATION_RESUME_COLLAPSED_PREFIX + lastOrderId);
    } catch (_) {
      // sessionStorage may be blocked in privacy mode.
    }
  }

  function isActivationResumeCollapsed(orderId) {
    var safeOrderId = String(orderId || "").trim();
    if (!safeOrderId) return false;
    try {
      return sessionStorage.getItem(ACTIVATION_RESUME_COLLAPSED_PREFIX + safeOrderId) === "1";
    } catch (_) {
      return false;
    }
  }

  function setActivationResumeCollapsed(orderId, collapsed) {
    var safeOrderId = String(orderId || "").trim();
    if (!safeOrderId) return;
    try {
      if (collapsed) {
        sessionStorage.setItem(ACTIVATION_RESUME_COLLAPSED_PREFIX + safeOrderId, "1");
      } else {
        sessionStorage.removeItem(ACTIVATION_RESUME_COLLAPSED_PREFIX + safeOrderId);
      }
    } catch (_) {
      // sessionStorage may be blocked in privacy mode.
    }
  }

  function readStoredActivationResumeContext() {
    try {
      var savedAt = Number(localStorage.getItem(SUPPORT_WIDGET_ACTIVATION_SAVED_AT_KEY) || "0");
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

  function isActivationCompleted(payload) {
    var deliveryMode = String(payload && payload.deliveryMode || "").trim().toLowerCase();
    var status = String(payload && payload.status || "").trim().toLowerCase();
    return deliveryMode === "activation" ? status === "success" : true;
  }

  function verifyActivationPending(orderId, token) {
    var safeOrderId = String(orderId || "").trim();
    var safeToken = String(token || "").trim();
    if (!safeOrderId || !safeToken) {
      return Promise.resolve(false);
    }

    var endpoint = "/api/orders/" + encodeURIComponent(safeOrderId) + "/activation?t=" + encodeURIComponent(safeToken);
    return fetch(endpoint, { cache: "no-store" })
      .then(function (response) {
        if (response.status === 409) {
          // VPN-only / credentials orders do not require token activation.
          clearStoredActivationResumeContext(safeOrderId);
          return false;
        }
        if (!response.ok) {
          // If backend is temporarily unavailable, keep reminder visible.
          return true;
        }
        return response.json().catch(function () {
          return {};
        }).then(function (payload) {
          if (isActivationCompleted(payload)) {
            clearStoredActivationResumeContext(safeOrderId);
            return false;
          }
          return true;
        });
      })
      .catch(function () {
        return true;
      });
  }

  function clearLegacyResumeShortcut() {
    var nodes = document.querySelectorAll(".gptishka-resume-activation");
    nodes.forEach(function (node) {
      node.remove();
    });
  }

  function removeLegacyResumeShortcutInside(rootNode) {
    if (!(rootNode instanceof Element)) return;
    if (rootNode.classList && rootNode.classList.contains("gptishka-resume-activation")) {
      rootNode.remove();
      return;
    }
    var nested = rootNode.querySelectorAll(".gptishka-resume-activation");
    if (!nested.length) return;
    nested.forEach(function (node) {
      node.remove();
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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
          resumeLead: "Account is not activated yet. Return to order activation.",
          resumeCta: "Go to activation",
          resumeAria: "Go to order activation"
        }
      : {
          rootLabel: "Кот-помощник",
          panelTitle: "Нужна помощь?",
          panelText: "Напишите нам в поддержку — поможем с подключением.",
          panelMeta: "Средний ответ: ~5 минут",
          panelCta: "Написать в Telegram",
          resumeLead: "Аккаунт еще не активирован. Вернитесь к активации по заказу.",
          resumeCta: "Перейти к активации",
          resumeAria: "Перейти к активации заказа"
        };
    var resumeCancelLabel = en ? "Hide" : "Скрыть";
    var resumeCancelAria = en ? "Dismiss activation reminder" : "Скрыть напоминание об активации";
    var resumeRestoreAria = en ? "Open activation reminder" : "Развернуть напоминание об активации";

    var root = document.createElement("aside");
    root.id = WIDGET_ID;
    root.className = "support-widget";
    root.setAttribute("role", "complementary");
    root.setAttribute("aria-label", text.rootLabel);

    root.innerHTML =
      '<div class="support-widget__mascot" aria-hidden="true">' +
        '<img class="support-widget__mascot-image" src="/assets/img/assistant-cat-left-placeholder.webp?v=20260721-mascot-placeholder-webp1" data-animation-src="/assets/img/assistant-cat-left.webp?v=20260721-mascot-webp1" alt="" width="112" height="168" loading="lazy" decoding="async" fetchpriority="low" />' +
      '</div>' +
      '<div class="support-widget__resume-bubble" data-resume-bubble hidden>' +
        '<span class="support-widget__resume-text" data-resume-text></span>' +
        '<div class="support-widget__resume-actions">' +
          '<a class="support-widget__resume-link" data-resume-continue></a>' +
          '<button class="support-widget__resume-cancel" type="button" data-resume-cancel></button>' +
        '</div>' +
      '</div>' +
      '<button class="support-widget__resume-restore" type="button" data-resume-restore hidden aria-label="' + escapeHtml(resumeRestoreAria) + '" title="' + escapeHtml(resumeRestoreAria) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
          '<path d="M7 3.75h7.6L19 8.15v11.1a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5.75a2 2 0 0 1 2-2Z"></path>' +
          '<path d="M14 3.75v4.4h4.4M8.3 12h7.4M8.3 15.5h5.1"></path>' +
        '</svg>' +
        '<span class="support-widget__resume-restore-dot" aria-hidden="true"></span>' +
      '</button>' +
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
    var resumeText = root.querySelector("[data-resume-text]");
    var resumeContinue = root.querySelector("[data-resume-continue]");
    var resumeCancel = root.querySelector("[data-resume-cancel]");
    var resumeRestore = root.querySelector("[data-resume-restore]");
    var mascotImage = root.querySelector(".support-widget__mascot-image");
    var animationSrc = mascotImage ? String(mascotImage.getAttribute("data-animation-src") || "").trim() : "";
    var animationRequested = false;
    var animationLoaded = false;
    var bubbleClosedBottom = "166px";
    var bubbleFaqBottom = 404;
    var faqIsVisible = false;

    var setBubbleBottom = function (isOpen) {
      if (!bubble || bubble.hidden) return;
      var faqBottom = faqIsVisible && window.innerWidth > 980 ? bubbleFaqBottom : 0;
      if (!isOpen || !panel) {
        bubble.style.setProperty(
          "bottom",
          faqBottom ? faqBottom + "px" : bubbleClosedBottom,
          "important"
        );
        return;
      }

      var panelStyles = window.getComputedStyle(panel);
      var panelHeight = Math.max(panel.getBoundingClientRect().height, panel.scrollHeight);
      var panelBottom = Number.parseFloat(panelStyles.bottom) || 18;
      var openBottom = Math.max(Math.ceil(panelBottom + panelHeight + 16), faqBottom);
      bubble.style.setProperty("bottom", openBottom + "px", "important");
    };

    applyFallbackLayout();

    var faqSection = document.getElementById("faq");
    if (faqSection && typeof window.IntersectionObserver === "function") {
      var faqObserver = new IntersectionObserver(
        function (entries) {
          faqIsVisible = entries.some(function (entry) {
            return entry.isIntersecting && entry.intersectionRatio > 0.08;
          });
          setBubbleBottom(root.classList.contains("is-open"));
        },
        { threshold: [0, 0.08, 0.25] }
      );
      faqObserver.observe(faqSection);
    }

    var shouldAnimateMascot = function () {
      try {
        if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          return false;
        }
      } catch (_) {
        // Ignore media query runtime issues.
      }
      try {
        if (
          document.body &&
          document.body.classList.contains("low-visual-budget")
        ) {
          return false;
        }
      } catch (_) {
        // Ignore runtime/classlist issues.
      }
      try {
        var memoryGb = Number(navigator.deviceMemory || 0);
        var cpuCores = Number(navigator.hardwareConcurrency || 0);
        if ((memoryGb > 0 && memoryGb <= 6) || (cpuCores > 0 && cpuCores <= 4)) {
          return false;
        }
      } catch (_) {
        // Ignore device capability API issues.
      }
      try {
        var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (conn) {
          if (conn.saveData) return false;
          var type = String(conn.effectiveType || "").toLowerCase();
          if (type === "2g" || type === "slow-2g") return false;
        }
      } catch (_) {
        // Ignore connection API issues.
      }
      return true;
    };

    var loadAnimatedMascot = function () {
      if (!mascotImage || !animationSrc || animationLoaded) return;
      animationLoaded = true;
      mascotImage.src = animationSrc;
      mascotImage.removeAttribute("data-animation-src");
    };

    if (mascotImage && animationSrc) {
      mascotImage.addEventListener("error", function () {
        // If the PNG placeholder is missing, immediately load the animation.
        if (String(mascotImage.src || "").indexOf("assistant-cat-left.webp") === -1) {
          loadAnimatedMascot();
        }
      });
    }

    var requestAnimatedMascot = function (delay) {
      if (animationRequested || !shouldAnimateMascot()) return;
      animationRequested = true;
      var doLoad = function () {
        loadAnimatedMascot();
      };
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(doLoad, { timeout: 2600 });
        return;
      }
      window.setTimeout(doLoad, Math.max(0, Number(delay || 1400)));
    };

    var panelTracked = false;
    var onPanelOpenTrack = function () {
      if (panelTracked) return;
      panelTracked = true;
      trackWidgetEvent("support_widget_open");
    };

    var closeTimer = 0;
    var clearCloseTimer = function () {
      if (!closeTimer) return;
      window.clearTimeout(closeTimer);
      closeTimer = 0;
    };

    var openPanel = function () {
      clearCloseTimer();
      root.classList.add("is-open");
      if (panel) panel.style.display = "block";
      setBubbleBottom(true);
      onPanelOpenTrack();
    };

    var closePanel = function () {
      clearCloseTimer();
      root.classList.remove("is-open");
      if (panel) panel.style.display = "none";
      setBubbleBottom(false);
    };

    var requestClosePanel = function () {
      clearCloseTimer();
      closeTimer = window.setTimeout(function () {
        closeTimer = 0;
        if (panel && panel.matches(":hover")) return;
        closePanel();
      }, 90);
    };

    if (mascot) {
      mascot.addEventListener("mouseenter", function () {
        requestAnimatedMascot(260);
        openPanel();
      });
      mascot.addEventListener("mouseleave", requestClosePanel);
    }

    if (panel) {
      panel.addEventListener("mouseenter", function () {
        requestAnimatedMascot(120);
        openPanel();
      });
      panel.addEventListener("mouseleave", requestClosePanel);
      panel.addEventListener("focusin", openPanel);
      panel.addEventListener("focusout", function () {
        if (!panel.contains(document.activeElement)) {
          requestClosePanel();
        }
      });
    }

    if (cta) {
      cta.addEventListener("click", function () {
        trackWidgetEvent("support_widget_click", { source: "panel_cta" });
      });
    }

    var resumeUrl = resolveActivationResumeUrl();
    if (bubble && resumeText && resumeContinue && resumeCancel && resumeRestore) {
      var activeResumeUrl = "";
      var activeResumeOrderId = "";

      var hideResumePrompt = function (showRestore) {
        bubble.classList.remove("is-visible");
        bubble.hidden = true;
        resumeRestore.hidden = !showRestore;
        resumeRestore.classList.toggle("is-visible", Boolean(showRestore));
      };

      var showResumePrompt = function (url) {
        var safeUrl = String(url || "").trim();
        if (!safeUrl) {
          activeResumeUrl = "";
          hideResumePrompt(false);
          return;
        }
        activeResumeUrl = safeUrl;
        resumeText.textContent = text.resumeLead;
        resumeContinue.textContent = text.resumeCta;
        resumeContinue.href = safeUrl;
        resumeContinue.setAttribute("aria-label", text.resumeAria);
        resumeCancel.textContent = resumeCancelLabel;
        resumeCancel.setAttribute("aria-label", resumeCancelAria);
        resumeRestore.hidden = true;
        resumeRestore.classList.remove("is-visible");
        bubble.hidden = false;
        bubble.classList.add("is-visible");
        setBubbleBottom(root.classList.contains("is-open"));
      };

      resumeContinue.addEventListener("click", function () {
        trackWidgetEvent("resume_activation_click", {
          source: "mascot_prompt"
        });
      });

      resumeCancel.addEventListener("click", function (event) {
        event.preventDefault();
        setActivationResumeCollapsed(activeResumeOrderId, true);
        hideResumePrompt(true);
        trackWidgetEvent("resume_activation_dismiss", {
          source: "mascot_prompt",
          behavior: "collapsed"
        });
      });

      resumeRestore.addEventListener("click", function (event) {
        event.preventDefault();
        setActivationResumeCollapsed(activeResumeOrderId, false);
        showResumePrompt(activeResumeUrl || resolveActivationResumeUrl());
        trackWidgetEvent("resume_activation_restore", {
          source: "mascot_icon"
        });
      });

      if (resumeUrl) {
        var ctx = readStoredActivationResumeContext();
        activeResumeOrderId = ctx.orderId;
        verifyActivationPending(ctx.orderId, ctx.token).then(function (shouldShowPrompt) {
          if (!shouldShowPrompt) {
            hideResumePrompt(false);
            return;
          }
          activeResumeUrl = resolveActivationResumeUrl();
          if (isActivationResumeCollapsed(activeResumeOrderId)) {
            hideResumePrompt(true);
            return;
          }
          showResumePrompt(activeResumeUrl);
        });
      } else {
        hideResumePrompt(false);
      }
    }

    // Performance guard:
    // Do not auto-load the animated WebP; load it only on explicit user interaction.

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
        panel.style.bottom = isMobile ? "16px" : "22px";
        panel.style.display = "none";
      }

      if (bubble) {
        bubble.style.position = "absolute";
        bubble.style.right = isMobile ? "12px" : "18px";
        bubbleClosedBottom = isMobile ? "148px" : "166px";
        bubbleOpenBottom = isMobile ? "246px" : "280px";
        setBubbleBottom(root.classList.contains("is-open"));
      }

      if (resumeRestore) {
        resumeRestore.style.position = "absolute";
        resumeRestore.style.right = isMobile ? "14px" : "20px";
        resumeRestore.style.bottom = isMobile ? "138px" : "150px";
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

    var cleanupObserver = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i += 1) {
        var record = records[i];
        if (!record || !record.addedNodes || !record.addedNodes.length) continue;
        for (var j = 0; j < record.addedNodes.length; j += 1) {
          removeLegacyResumeShortcutInside(record.addedNodes[j]);
        }
      }
    });
    cleanupObserver.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(function () {
      cleanupObserver.disconnect();
    }, 20000);
  }

  var supportWidgetInitStarted = false;
  function startSupportWidgetInit() {
    if (supportWidgetInitStarted) return;
    supportWidgetInitStarted = true;
    initSupportWidget();
  }

  function scheduleSupportWidgetInit() {
    if (hasForceShowFlag()) {
      startSupportWidgetInit();
      return;
    }

    var interactionEvents = ["pointerdown", "keydown", "touchstart", "scroll"];
    var detached = false;
    var timeoutId = 0;

    var detach = function () {
      if (detached) return;
      detached = true;
      for (var i = 0; i < interactionEvents.length; i += 1) {
        window.removeEventListener(interactionEvents[i], onInteraction, { passive: true });
      }
      if (timeoutId) {
        window.clearTimeout(timeoutId);
        timeoutId = 0;
      }
    };

    var onInteraction = function () {
      detach();
      startSupportWidgetInit();
    };

    for (var i = 0; i < interactionEvents.length; i += 1) {
      window.addEventListener(interactionEvents[i], onInteraction, { passive: true });
    }

    timeoutId = window.setTimeout(function () {
      detach();
      startSupportWidgetInit();
    }, 8000);
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleSupportWidgetInit);
  } else {
    scheduleSupportWidgetInit();
  }
})();
