// =========================
// PAGE TRANSITION - FIXED
// =========================

document.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.remove("is-leaving");
  syncPageTransitionOverlayOffset();
  initPageEnterTransition();
  initHomeGradientBackground();
  initPulseBeamButtons();
  initLinkPageTransitions();
  initProgressiveResourceWarmup();
  window.addEventListener("pageshow", () => {
    pageNavigationInProgress = false;
    document.documentElement.classList.remove("is-leaving");
    document.documentElement.classList.remove("is-entering");
    document.documentElement.classList.remove("is-entering-active");
    syncPageTransitionOverlayOffset();
  });

  const header = document.querySelector("header");
  if (header) {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        header.classList.toggle("is-scrolled", window.scrollY > 10);
        syncPageTransitionOverlayOffset(header);
        ticking = false;
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", () => syncPageTransitionOverlayOffset(header), { passive: true });
  } else {
    syncPageTransitionOverlayOffset();
  }

  initFaqAccordions();
  initLanguageSwitch();
  initActivationResumeShortcut();
  initReviewsSecurityBanner();
});

let pageNavigationInProgress = false;
const PAGE_TRANSITION_LEAVE_MS = 260;
const PAGE_TRANSITION_ENTER_MS = 480;
const PAGE_TRANSITION_CLEANUP_MS = PAGE_TRANSITION_ENTER_MS + 80;
const PAGE_TRANSITION_NAV_FLAG_KEY = "gptishka_nav_transition";
const WARMUP_START_DELAY_MS = 1600;
const WARMUP_STEP_DELAY_MS = 1200;
const WARMUP_MAX_ROUTES = 7;
const WARMUP_PRODUCTS_DELAY_MS = 4400;
const METRIKA_COUNTER_ID = 106969126;
const TOP_MAIL_COUNTER_ID = "3744660";
const prefetchedNavigationKeys = new Set();

function syncPageTransitionOverlayOffset(headerEl = null) {
  const header = headerEl || document.querySelector("header");
  let offsetPx = 0;
  if (header) {
    const rect = header.getBoundingClientRect();
    offsetPx = Math.max(0, Math.round(rect.bottom + 6));
  }
  document.documentElement.style.setProperty("--page-overlay-top", `${offsetPx}px`);
}

function markTransitionNavigationIntent() {
  try {
    sessionStorage.setItem(PAGE_TRANSITION_NAV_FLAG_KEY, "1");
  } catch (_) {
    // Ignore storage errors in strict privacy modes.
  }
}

function consumeTransitionNavigationIntent() {
  try {
    const value = sessionStorage.getItem(PAGE_TRANSITION_NAV_FLAG_KEY) === "1";
    if (value) {
      sessionStorage.removeItem(PAGE_TRANSITION_NAV_FLAG_KEY);
    }
    return value;
  } catch (_) {
    return false;
  }
}

function trackAnalyticsEvent(eventName, payload = {}) {
  const safeName = String(eventName || "").trim();
  if (!safeName) return;
  const safePayload = payload && typeof payload === "object" ? payload : {};

  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: `gptishka_${safeName}`,
      ...safePayload,
    });
  } catch (_) {
    // Ignore analytics transport errors.
  }

  if (typeof window.ym === "function") {
    try {
      window.ym(METRIKA_COUNTER_ID, "reachGoal", safeName, safePayload);
    } catch (_) {
      // Ignore analytics transport errors.
    }
  }

  if (Array.isArray(window._tmr)) {
    try {
      window._tmr.push({
        id: TOP_MAIL_COUNTER_ID,
        type: "reachGoal",
        goal: safeName,
      });
    } catch (_) {
      // Ignore analytics transport errors.
    }
  }
}

window.gptishkaTrackEvent = trackAnalyticsEvent;

function navigateWithPageTransition(targetHref, delayMs = PAGE_TRANSITION_LEAVE_MS) {
  const href = String(targetHref || "").trim();
  if (!href) return;
  if (pageNavigationInProgress) return;
  pageNavigationInProgress = true;
  markTransitionNavigationIntent();
  syncPageTransitionOverlayOffset();
  document.documentElement.classList.add("is-leaving");
  window.setTimeout(() => {
    window.location.href = href;
  }, delayMs);
}

function initPageEnterTransition() {
  if (!consumeTransitionNavigationIntent()) return;
  syncPageTransitionOverlayOffset();
  const root = document.documentElement;
  root.classList.add("is-entering");
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      root.classList.add("is-entering-active");
      window.setTimeout(() => {
        root.classList.remove("is-entering");
        root.classList.remove("is-entering-active");
      }, PAGE_TRANSITION_CLEANUP_MS);
    });
  });
}

function normalizePathname(pathname) {
  const path = String(pathname || "").trim() || "/";
  if (path === "/") return "/";
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

function shouldUsePageTransitionForHref(href, linkEl) {
  const rawHref = String(href || "").trim();
  if (!rawHref) return false;
  if (rawHref.startsWith("mailto:") || rawHref.startsWith("tel:") || rawHref.startsWith("javascript:")) return false;
  if (linkEl && linkEl.hasAttribute("data-no-transition")) return false;
  if (linkEl && (linkEl.hasAttribute("download") || String(linkEl.getAttribute("target") || "").toLowerCase() === "_blank")) return false;

  let targetUrl;
  try {
    targetUrl = new URL(rawHref, window.location.href);
  } catch (_) {
    return false;
  }

  if (targetUrl.origin !== window.location.origin) return false;

  const currentPath = normalizePathname(window.location.pathname);
  const targetPath = normalizePathname(targetUrl.pathname);
  const samePath = currentPath === targetPath;
  const sameSearch = targetUrl.search === window.location.search;
  const isSamePageAnchor = samePath && sameSearch && Boolean(targetUrl.hash);
  if (isSamePageAnchor) return false;
  if (targetUrl.hash) return false;

  return true;
}

function initLinkPageTransitions() {
  document.addEventListener("click", e => {
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const target = e.target instanceof Element ? e.target : null;
    const link = target ? target.closest("a[href]") : null;
    if (!(link instanceof HTMLAnchorElement)) return;

    const href = link.getAttribute("href");
    if (!shouldUsePageTransitionForHref(href, link)) return;

    e.preventDefault();
    const fastDelay = isPrefetchedNavigationTarget(link.href)
      ? Math.min(180, PAGE_TRANSITION_LEAVE_MS)
      : PAGE_TRANSITION_LEAVE_MS;
    navigateWithPageTransition(link.href, fastDelay);
  });
}

function runWhenIdle(callback, timeoutMs = 1400) {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => callback(), { timeout: timeoutMs });
    return;
  }
  window.setTimeout(callback, 220);
}

function normalizePrefetchNavigationKey(href) {
  try {
    const url = new URL(String(href || ""), window.location.href);
    if (url.origin !== window.location.origin) return "";
    return `${normalizePathname(url.pathname)}${url.search}`;
  } catch (_) {
    return "";
  }
}

function isPrefetchedNavigationTarget(href) {
  const key = normalizePrefetchNavigationKey(href);
  return key ? prefetchedNavigationKeys.has(key) : false;
}

function addDocumentPrefetch(href) {
  let targetUrl;
  try {
    targetUrl = new URL(String(href || ""), window.location.href);
  } catch (_) {
    return;
  }
  if (targetUrl.origin !== window.location.origin) return;
  targetUrl.hash = "";
  const key = normalizePrefetchNavigationKey(targetUrl.href);
  if (!key) return;
  const currentKey = normalizePrefetchNavigationKey(window.location.href);
  if (key === currentKey || prefetchedNavigationKeys.has(key)) return;
  prefetchedNavigationKeys.add(key);

  const prefetchPath = `${targetUrl.pathname}${targetUrl.search}`;
  const supportsLinkPrefetch = (() => {
    const link = document.createElement("link");
    return Boolean(link.relList && typeof link.relList.supports === "function" && link.relList.supports("prefetch"));
  })();

  if (supportsLinkPrefetch) {
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.as = "document";
    link.href = prefetchPath;
    document.head.appendChild(link);
    return;
  }

  fetch(targetUrl.href, { method: "GET", credentials: "same-origin", cache: "force-cache" }).catch(() => {});
}

function collectWarmupRoutes() {
  const isEnPage = String(window.location.pathname || "").toLowerCase().startsWith("/en/");
  const defaults = isEnPage
    ? ["/en/index.html", "/en/about.html", "/en/guarantee.html", "/en/contact.html", "/en/site-map.html"]
    : ["/index.html", "/about.html", "/guarantee.html", "/contact.html", "/site-map.html"];
  const fromNav = Array.from(document.querySelectorAll("header nav a[href]"))
    .map(link => link.getAttribute("href") || "")
    .filter(Boolean);

  const merged = [...defaults, ...fromNav];
  const uniq = [];
  const seen = new Set();
  for (const href of merged) {
    const key = normalizePrefetchNavigationKey(href);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniq.push(href);
    if (uniq.length >= WARMUP_MAX_ROUTES) break;
  }
  return uniq;
}

function canRunProgressiveWarmup() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return true;
  if (connection.saveData) return false;
  const effectiveType = String(connection.effectiveType || "").toLowerCase();
  if (effectiveType.includes("2g")) return false;
  return true;
}

function warmupProductsEndpoint() {
  const isEnPage = String(window.location.pathname || "").toLowerCase().startsWith("/en/");
  const lang = isEnPage ? "en" : "ru";
  fetch(`/api/public/products?lang=${lang}`, {
    method: "GET",
    credentials: "same-origin",
    cache: "force-cache",
  }).catch(() => {});
}

function initProgressiveResourceWarmup() {
  if (!document.head) return;
  if (!canRunProgressiveWarmup()) return;

  const queue = collectWarmupRoutes();
  if (!queue.length) return;

  let cursor = 0;
  const processNext = () => {
    if (cursor >= queue.length) return;
    if (document.visibilityState === "hidden") {
      window.setTimeout(processNext, 1400);
      return;
    }
    runWhenIdle(() => {
      addDocumentPrefetch(queue[cursor]);
      cursor += 1;
      window.setTimeout(processNext, WARMUP_STEP_DELAY_MS);
    });
  };

  window.setTimeout(processNext, WARMUP_START_DELAY_MS);
  window.setTimeout(() => {
    if (document.visibilityState !== "visible") return;
    warmupProductsEndpoint();
  }, WARMUP_PRODUCTS_DELAY_MS);
}

function initHomeGradientBackground() {
  const body = document.body;
  if (!body) return;
  const hasHeroRoot = Boolean(document.querySelector("[data-hero-react-root]"));
  if (!hasHeroRoot) return;

  const prefersReducedMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
  const hasFinePointer = window.matchMedia
    ? window.matchMedia("(pointer: fine)").matches
    : true;
  const isCompactViewport = window.matchMedia
    ? window.matchMedia("(max-width: 900px)").matches
    : window.innerWidth <= 900;

  // On mobile/coarse pointer/reduced motion we keep a static premium gradient only.
  if (prefersReducedMotion || !hasFinePointer || isCompactViewport) {
    body.classList.remove("home-gradient-page");
    body.classList.add("home-gradient-page-lite");
    return;
  }

  body.classList.remove("home-gradient-page-lite");
  body.classList.add("home-gradient-page");

  let bg = document.querySelector(".home-gradient-bg");
  if (!bg) {
    bg = document.createElement("div");
    bg.className = "home-gradient-bg";
    bg.setAttribute("aria-hidden", "true");
    bg.innerHTML = [
      '<span class="home-gradient-bg__layer home-gradient-bg__layer--1"></span>',
      '<span class="home-gradient-bg__layer home-gradient-bg__layer--2"></span>',
      '<span class="home-gradient-bg__layer home-gradient-bg__layer--3"></span>',
      '<span class="home-gradient-bg__layer home-gradient-bg__layer--4"></span>',
      '<span class="home-gradient-bg__layer home-gradient-bg__layer--5"></span>',
      '<span class="home-gradient-bg__pointer"></span>',
    ].join("");
    body.insertBefore(bg, body.firstChild);
  }

  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let rafId = 0;

  const pointerStrength = prefersReducedMotion ? 0.38 : 0.72;
  const pointerEase = prefersReducedMotion ? 0.1 : 0.18;

  const updatePointer = () => {
    currentX += (targetX - currentX) * pointerEase;
    currentY += (targetY - currentY) * pointerEase;
    bg.style.setProperty("--home-pointer-x", `${Math.round(currentX)}px`);
    bg.style.setProperty("--home-pointer-y", `${Math.round(currentY)}px`);
    if (Math.abs(targetX - currentX) > 0.2 || Math.abs(targetY - currentY) > 0.2) {
      rafId = window.requestAnimationFrame(updatePointer);
      return;
    }
    rafId = 0;
  };

  const queuePointerUpdate = () => {
    if (!rafId) {
      rafId = window.requestAnimationFrame(updatePointer);
    }
  };

  window.addEventListener(
    "pointermove",
    e => {
      if (document.visibilityState === "hidden") return;
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      targetX = (e.clientX - centerX) * pointerStrength;
      targetY = (e.clientY - centerY) * pointerStrength;
      queuePointerUpdate();
    },
    { passive: true }
  );

  window.addEventListener(
    "pointerleave",
    () => {
      targetX = 0;
      targetY = 0;
      queuePointerUpdate();
    },
    { passive: true }
  );
}

function initFaqAccordions() {
  const questions = Array.from(document.querySelectorAll(".faq-question"));
  if (!questions.length) return;
  questions.forEach(btn => {
    btn.addEventListener("click", () => {
      const item = btn.parentElement;
      if (!item) return;
      const nextState = !item.classList.contains("active");
      item.classList.toggle("active");
      if (nextState) {
        trackAnalyticsEvent("faq_open", {
          question: String(btn.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
        });
      }
    });
  });
}

function initPulseBeamButtons() {
  const root = document.body;
  if (!root) return;
  const prefersReducedMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
  const hasFinePointer = window.matchMedia
    ? window.matchMedia("(pointer: fine)").matches
    : true;
  const isDesktopViewport = window.matchMedia
    ? window.matchMedia("(min-width: 1025px)").matches
    : window.innerWidth >= 1025;
  if (prefersReducedMotion || !hasFinePointer || !isDesktopViewport) return;

  const targetSelector = [
    "a.btn",
    "button.btn",
    ".buy-btn",
    ".faq-chat-btn",
    ".redeem-btn-primary",
    ".product-preview-modal__pay",
    "#cartCheckoutBtn",
    "#headerCartPanelCheckoutBtn",
  ].join(", ");

  const skipSelector = [
    ".faq-question",
    ".payment-method-modal__close",
    ".support-widget__close",
    ".redeem-review-close",
    ".header-mini-remove-btn",
    ".cart-remove-btn",
  ].join(", ");

  const ensureBeamTarget = node => {
    if (!(node instanceof HTMLElement)) return;
    if (node.matches(skipSelector)) return;
    if (node.classList.contains("gptishka-resume-activation")) return;
    if (node.classList.contains("lp-pulse-beam-target")) return;

    node.classList.add("lp-pulse-beam-target");

    const hasBeamLayer = Array.from(node.children).some(
      child => child instanceof HTMLElement && child.classList.contains("lp-pulse-beams")
    );
    if (hasBeamLayer) return;

    const beamLayer = document.createElement("span");
    beamLayer.className = "lp-pulse-beams";
    beamLayer.setAttribute("aria-hidden", "true");
    node.insertBefore(beamLayer, node.firstChild);
  };

  const hydrateTargets = scope => {
    if (!(scope instanceof Element)) return;

    const matchesScope = scope.matches(targetSelector);
    const firstDescendant = matchesScope ? scope : scope.querySelector(targetSelector);
    if (!matchesScope && !firstDescendant) return;

    if (matchesScope) {
      ensureBeamTarget(scope);
    }

    scope.querySelectorAll(targetSelector).forEach(ensureBeamTarget);
  };

  hydrateTargets(root);

  const lazyHydrate = event => {
    const target = event.target instanceof Element ? event.target.closest(targetSelector) : null;
    if (target instanceof Element) {
      ensureBeamTarget(target);
    }
  };
  document.addEventListener("mouseover", lazyHydrate, { passive: true });
  document.addEventListener("focusin", lazyHydrate);
}

function initReviewsSecurityBanner() {
  const currentPath = String(window.location.pathname || "").toLowerCase();
  if (!currentPath.endsWith("/reviews.html") && !currentPath.endsWith("reviews.html")) return;

  const reviewsSection = document.querySelector(".reviews");
  if (!reviewsSection || reviewsSection.querySelector(".reviews-security-banner")) return;
  const isEnPage = currentPath.startsWith("/en/");

  const title = isEnPage
    ? "For client privacy, we fully mask personal emails in activation logs."
    : "В целях безопасности личных данных клиентов email в ленте активаций маскируется полностью.";
  const note = isEnPage
    ? "Do not share tokens, session keys, or payment screenshots in private messages. Use only official support contacts from the website."
    : "Не передавайте токены, сессионные ключи и чеки в личные сообщения. Используйте только официальные контакты поддержки с сайта.";
  const catLabel = isEnPage ? "Sad kitten" : "Грустный котёнок";

  const banner = document.createElement("aside");
  banner.className = "reviews-security-banner";
  banner.setAttribute("role", "note");
  banner.innerHTML = [
    `<div class="reviews-security-banner__cat" aria-label="${catLabel}">😿</div>`,
    '<div class="reviews-security-banner__body">',
    `  <p class="reviews-security-banner__title">${title}</p>`,
    `  <p class="reviews-security-banner__text">${note}</p>`,
    "</div>",
  ].join("");

  const header = reviewsSection.querySelector(".reviews-header");
  if (header && header.parentNode) {
    header.insertAdjacentElement("afterend", banner);
    return;
  }
  reviewsSection.prepend(banner);
}

function resolveLangTargetPath(targetLang) {
  const path = String(window.location.pathname || "/").trim();
  const cleanPath = path === "/" ? "/index.html" : path;
  const isEnPath = cleanPath.startsWith("/en/");

  if (targetLang === "en") {
    if (isEnPath) return cleanPath;
    return `/en${cleanPath}`;
  }

  if (targetLang === "ru") {
    if (!isEnPath) return cleanPath;
    const ruPath = cleanPath.replace(/^\/en/, "");
    return ruPath || "/index.html";
  }

  return cleanPath;
}

function initLanguageSwitch() {
  const langSwitch = document.getElementById("langSwitch");
  const langCurrent = document.getElementById("langCurrent");
  if (!langSwitch || !langCurrent) return;

  const langItems = Array.from(langSwitch.querySelectorAll(".lang-item[data-lang]"));
  if (!langItems.length) return;

  langCurrent.addEventListener("click", () => {
    langSwitch.classList.toggle("open");
  });

  langItems.forEach(item => {
    item.addEventListener("click", () => {
      const lang = String(item.dataset.lang || "").toLowerCase();
      if (lang !== "ru" && lang !== "en") return;
      const targetPath = resolveLangTargetPath(lang);
      const targetUrl = new URL(targetPath, window.location.origin);
      targetUrl.search = "";
      targetUrl.hash = "";
      navigateWithPageTransition(targetUrl.toString());
    });
  });

  document.addEventListener("click", e => {
    if (!langSwitch.contains(e.target)) {
      langSwitch.classList.remove("open");
    }
  });
}

const ACTIVATION_LAST_ORDER_ID_KEY = "gptishka_activation_order_id";
const ACTIVATION_ORDER_TOKEN_PREFIX = "gptishka_activation_order_token:";
const ACTIVATION_RESUME_URL_KEY = "gptishka_activation_resume_url";
const ACTIVATION_RESUME_SAVED_AT_KEY = "gptishka_activation_saved_at";
const ACTIVATION_RESUME_TTL_MS = 60 * 60 * 1000;

function clearStoredActivationResumeContext(orderId) {
  const safeOrderId = String(orderId || "").trim();
  try {
    const lastOrderId = safeOrderId || String(localStorage.getItem(ACTIVATION_LAST_ORDER_ID_KEY) || "").trim();
    if (lastOrderId) {
      localStorage.removeItem(`${ACTIVATION_ORDER_TOKEN_PREFIX}${lastOrderId}`);
    }
    localStorage.removeItem(ACTIVATION_LAST_ORDER_ID_KEY);
    localStorage.removeItem(ACTIVATION_RESUME_URL_KEY);
    localStorage.removeItem(ACTIVATION_RESUME_SAVED_AT_KEY);
  } catch (_) {
    // Ignore storage cleanup errors.
  }
}

function readStoredActivationResumeContext() {
  try {
    const savedAt = Number(localStorage.getItem(ACTIVATION_RESUME_SAVED_AT_KEY) || "0");
    if (!Number.isFinite(savedAt) || savedAt <= 0 || Date.now() - savedAt > ACTIVATION_RESUME_TTL_MS) {
      clearStoredActivationResumeContext();
      return { orderId: "", token: "" };
    }

    const orderId = String(localStorage.getItem(ACTIVATION_LAST_ORDER_ID_KEY) || "").trim();
    const token = orderId
      ? String(localStorage.getItem(`${ACTIVATION_ORDER_TOKEN_PREFIX}${orderId}`) || "").trim()
      : "";
    if (!orderId || !token) {
      clearStoredActivationResumeContext(orderId);
      return { orderId: "", token: "" };
    }

    return { orderId, token };
  } catch (_) {
    return { orderId: "", token: "" };
  }
}

function persistActivationResumeContext(orderId, token, activationUrl) {
  const safeOrderId = String(orderId || "").trim();
  let safeToken = String(token || "").trim();
  const safeActivationUrl = String(activationUrl || "").trim();
  if (!safeOrderId) return;

  if (!safeToken && safeActivationUrl) {
    try {
      const parsed = new URL(safeActivationUrl, window.location.origin);
      safeToken = String(parsed.searchParams.get("t") || "").trim();
    } catch (_) {
      // Ignore malformed activation URL.
    }
  }
  if (!safeToken) return;

  try {
    localStorage.setItem(ACTIVATION_LAST_ORDER_ID_KEY, safeOrderId);
    localStorage.setItem(`${ACTIVATION_ORDER_TOKEN_PREFIX}${safeOrderId}`, safeToken);
    localStorage.setItem(ACTIVATION_RESUME_SAVED_AT_KEY, String(Date.now()));
    localStorage.setItem(
      ACTIVATION_RESUME_URL_KEY,
      buildActivationResumeUrl(safeOrderId, safeToken)
    );
  } catch (_) {
    // Ignore storage write errors.
  }
}

function buildActivationResumeUrl(orderId, token) {
  const isEnPage = window.location.pathname.startsWith("/en/");
  const path = isEnPage ? "/en/redeem-start.html" : "/redeem-start.html";
  const url = new URL(path, window.location.origin);
  url.searchParams.set("order_id", String(orderId || "").trim());
  url.searchParams.set("t", String(token || "").trim());
  return url.toString();
}

function initActivationResumeShortcut() {
  const path = String(window.location.pathname || "").toLowerCase();
  if (path.includes("redeem-start.html") || path.includes("success.html")) return;
  const isEnPage = path.startsWith("/en/");

  const { orderId, token: orderToken } = readStoredActivationResumeContext();
  if (!orderId || !orderToken) return;

  const anchor = document.createElement("a");
  anchor.href = buildActivationResumeUrl(orderId, orderToken);
  anchor.className = "gptishka-resume-activation";
  anchor.textContent = isEnPage ? "Resume activation" : "Продолжить активацию";
  anchor.setAttribute("aria-label", isEnPage ? "Resume order activation" : "Продолжить активацию заказа");
  anchor.addEventListener("click", () => {
    trackAnalyticsEvent("resume_activation_click");
  });
  document.body.appendChild(anchor);
}
  
(() => {
  const CART_KEY = "gptishka_cart_v1";
  const CART_SELECTION_KEY = "selected_cart";
  const pricingGridEl = document.getElementById("pricingGrid");
  let cards = [];
  const cartListEl = document.getElementById("cartList");
  const cartEmptyEl = document.getElementById("cartEmpty");
  const cartTotalEl = document.getElementById("cartTotal");
  const cartCheckoutEl = document.getElementById("cartCheckoutBtn");
  const cartSectionEl = document.getElementById("cart");
  const headerCartEl = document.getElementById("headerCart");
  const headerCartTotalEl = document.getElementById("headerCartTotal");
  const headerCartCountEl = document.getElementById("headerCartCount");
  const headerCartPanelEl = document.getElementById("headerCartPanel");
  const headerCartPanelListEl = document.getElementById("headerCartPanelList");
  const headerCartPanelEmptyEl = document.getElementById("headerCartPanelEmpty");
  const headerCartPanelCountEl = document.getElementById("headerCartPanelCount");
  const headerCartPanelTotalEl = document.getElementById("headerCartPanelTotal");
  const headerCartPanelCheckoutBtnEl = document.getElementById("headerCartPanelCheckoutBtn");
  const headerCartPanelLinkEl = document.querySelector(".header-cart-panel__link");
  const headerCartPromoInputEl = document.getElementById("headerCartPromoInput");
  const headerCartPromoApplyEl = document.getElementById("headerCartPromoApply");
  const headerCartPromoMsgEl = document.getElementById("headerCartPromoMsg");
  const cartPromoInputEl = document.getElementById("cartPromoInput");
  const cartPromoApplyEl = document.getElementById("cartPromoApply");
  const cartPromoMsgEl = document.getElementById("cartPromoMsg");
  const headerCartEmailInputEl = document.getElementById("headerCartEmailInput");
  const cartEmailInputEl = document.getElementById("cartEmailInput");
  const cartPaymentMethodsEl = document.getElementById("cartPaymentMethods");
  const cartPaymentModalEl = document.getElementById("cartPaymentModal");
  const cartPaymentModalOptions = Array.from(
    document.querySelectorAll("[data-payment-method-modal-option]")
  );
  const cartPaymentModalCloseButtons = Array.from(
    document.querySelectorAll("[data-payment-modal-close]")
  );
  const isEnPage =
    String(document.documentElement.lang || "").toLowerCase().startsWith("en") ||
    window.location.pathname.startsWith("/en/");
  const numberLocale = isEnPage ? "en-US" : "ru-RU";
  const checkoutLandingPath = isEnPage ? "/en/index.html#pricing" : "/index.html#pricing";
  const TEXT = isEnPage
    ? {
        promo10: "10% discount",
        promo5: "5% discount",
        badgeBest: "Best choice",
        badgeNew: "New",
        badgeHit: "Hit",
        badgeSale: "Sale",
        badgePopular: "Popular",
        badgeLimited: "Limited",
        badgeGift: "Bonus",
        badgePro: "Pro",
        pillAutoIssue: "Auto-issue",
        pillInstant: "Instant",
        pillWarranty: "Warranty",
        productsUnavailable: "Products are temporarily unavailable",
        payNow: "Pay",
        qtyDec: "Decrease quantity",
        qtyInc: "Increase quantity",
        metaAuto: "Automatic",
        metaSecure: "Secure",
        metaSupport: "24/7 support",
        panelCount: count => `${count} items`,
        promoApplied: (label, discountLabel) => `${label} applied (-${discountLabel})`,
        promoInvalid: "Promo code not found",
        promoChecking: "Checking promo code...",
        promoAccepted: "Promo code accepted. Final amount will be locked at checkout.",
        remove: "Remove",
        paymentFallback: "Order payment",
        cartCheckoutDesc: "Cart checkout",
        cartSummaryPrefix: "Cart: ",
        emailPlaceholder: "Email for order details",
        invalidEmail: "Please enter a valid email",
        checkoutError: "Failed to start checkout. Please try again.",
        lavaUnavailable: "Lava is temporarily unavailable. Please choose Enot.io.",
        checkoutProductMissing: "The selected item is outdated in cart. Please re-add it from pricing.",
        multiCartCheckout: "Checkout is currently available one item at a time. Please pay items separately.",
        paymentMethodRequired: "Select a payment method",
        previewTitle: "Plan details",
        previewIncluded: "What's included",
        previewPay: "Pay for this plan",
        previewPayWithAmount: amountLabel => `Pay (${amountLabel})`,
        previewClose: "Close",
        previewNoDetails: "Details will appear here shortly.",
        cardPromoPlaceholder: "Promo code",
        previewEmailLabel: "Email for order details",
        previewPromoLabel: "Promo code",
        previewPromoApply: "Apply",
      }
    : {
        promo10: "Скидка 10%",
        promo5: "Скидка 5%",
        badgeBest: "Лучший выбор",
        badgeNew: "Новинка",
        badgeHit: "Хит",
        badgeSale: "Акция",
        badgePopular: "Популярно",
        badgeLimited: "Ограничено",
        badgeGift: "Бонус",
        badgePro: "Pro",
        pillAutoIssue: "Автовыдача",
        pillInstant: "Мгновенно",
        pillWarranty: "Гарантия",
        productsUnavailable: "Товары временно недоступны",
        payNow: "Оплатить",
        qtyDec: "Уменьшить количество",
        qtyInc: "Увеличить количество",
        metaAuto: "Автоматически",
        metaSecure: "Безопасно",
        metaSupport: "Поддержка 24/7",
        panelCount: count => `${count} поз.`,
        promoApplied: (label, discountLabel) => `${label} применена (-${discountLabel})`,
        promoInvalid: "Промокод не найден",
        promoChecking: "Проверяем промокод...",
        promoAccepted: "Промокод принят",
        remove: "Удалить",
        paymentFallback: "Оплата заказа",
        cartCheckoutDesc: "Оформление корзины",
        cartSummaryPrefix: "Корзина: ",
        emailPlaceholder: "Email для получения данных заказа",
        invalidEmail: "Введите корректный email",
        checkoutError: "Не удалось начать оплату. Попробуйте снова.",
        lavaUnavailable: "Lava временно недоступна. Выберите Enot.io.",
        checkoutProductMissing: "Товар в корзине устарел. Добавьте его заново из тарифов.",
        multiCartCheckout: "Сейчас оплата доступна по одному товару. Оплатите позиции по отдельности.",
        paymentMethodRequired: "Выберите способ оплаты",
        previewTitle: "Детали тарифа",
        previewIncluded: "Что входит",
        previewPay: "Оплатить этот тариф",
        previewPayWithAmount: amountLabel => `Оплатить (${amountLabel})`,
        previewClose: "Закрыть",
        previewNoDetails: "Описание появится в ближайшее время.",
        cardPromoPlaceholder: "Промокод",
        previewEmailLabel: "Email для получения данных заказа",
        previewPromoLabel: "Промокод",
        previewPromoApply: "Применить",
      };
  const PROMO_CODE_KEY = "gptishka_cart_promo_v1";
  const PROMO_CODE_TS_KEY = "gptishka_cart_promo_ts_v1";
  const PAYMENT_METHOD_KEY = "gptishka_checkout_payment_method_v1";
  const DEFAULT_PAYMENT_METHOD = "enot";
  const AVAILABLE_PAYMENT_METHODS = new Set(["enot", "lava"]);
  const PROMO_TTL_MS = 30 * 60 * 1000;
  const PRODUCTS_CACHE_TTL_MS = 60 * 1000;
  let clickTimer = null;
  let productsPayloadCache = null;
  let productsPayloadCacheTs = 0;
  let productsPayloadPendingPromise = null;
  let activePromoCode = "";
  let activePaymentMethod = DEFAULT_PAYMENT_METHOD;
  let promoValidationState = "idle"; // idle | checking | valid | invalid
  let promoDiscountAmount = 0;
  let promoValidationContextKey = "";
  let checkoutPendingRow = null;
  let checkoutPendingPromoCode = "";
  let checkoutInProgress = false;
  let productPreviewModalEl = null;
  let productPreviewContentEl = null;
  let productPreviewPayBtnEl = null;
  let productPreviewEmailInputEl = null;
  let productPreviewPromoInputEl = null;
  let productPreviewPromoApplyBtnEl = null;
  let productPreviewPromoMsgEl = null;
  let productPreviewPriceEl = null;
  let previewItem = null;

  function normalizePromoCodeInput(value) {
    const raw = String(value || "").trim().toUpperCase();
    if (!raw) return "";
    const firstToken = raw.split(/[\s,;+|]+/).filter(Boolean)[0] || "";
    return firstToken.slice(0, 40);
  }

  function normalizePaymentMethod(value) {
    const method = String(value || "").trim().toLowerCase();
    return AVAILABLE_PAYMENT_METHODS.has(method) ? method : DEFAULT_PAYMENT_METHOD;
  }

  function loadPaymentMethod() {
    try {
      return normalizePaymentMethod(localStorage.getItem(PAYMENT_METHOD_KEY) || DEFAULT_PAYMENT_METHOD);
    } catch (_) {
      return DEFAULT_PAYMENT_METHOD;
    }
  }

  function savePaymentMethod(value) {
    const normalized = normalizePaymentMethod(value);
    activePaymentMethod = normalized;
    try {
      localStorage.setItem(PAYMENT_METHOD_KEY, normalized);
    } catch (_) {
      // Ignore storage write errors.
    }
    return normalized;
  }

  function getSelectedPaymentMethod() {
    if (!cartPaymentMethodsEl) return activePaymentMethod;
    const checked = cartPaymentMethodsEl.querySelector('input[name="cartPaymentMethod"]:checked');
    const selected = normalizePaymentMethod(checked ? checked.value : activePaymentMethod);
    return savePaymentMethod(selected);
  }

  function syncPaymentMethodUi() {
    const selected = normalizePaymentMethod(activePaymentMethod);

    if (cartPaymentMethodsEl) {
      const options = Array.from(cartPaymentMethodsEl.querySelectorAll("[data-payment-method-option]"));
      options.forEach(option => {
        const input = option.querySelector('input[name="cartPaymentMethod"]');
        if (!input) return;
        const optionMethod = normalizePaymentMethod(input.value);
        const isActive = optionMethod === selected;
        input.checked = isActive;
        option.classList.toggle("is-active", isActive);
      });
    }

    cartPaymentModalOptions.forEach(option => {
      const optionMethod = normalizePaymentMethod(option.getAttribute("data-payment-method-modal-option") || "");
      const isActive = optionMethod === selected;
      option.classList.toggle("is-active", isActive);
      option.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function closePaymentMethodModal() {
    if (!cartPaymentModalEl) return;
    cartPaymentModalEl.hidden = true;
    cartPaymentModalEl.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-payment-modal-open");
  }

  function openPaymentMethodModal() {
    if (!cartPaymentModalEl) return;
    syncPaymentMethodUi();
    cartPaymentModalEl.hidden = false;
    cartPaymentModalEl.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-payment-modal-open");
  }

  function resetPendingCheckout() {
    checkoutPendingRow = null;
    checkoutPendingPromoCode = "";
  }

  function prepareCheckoutRow() {
    const rows = loadCart().filter(row => row && row.lineId && row.product && toInt(row.qty) > 0);
    if (!rows.length) return null;
    if (rows.length !== 1) {
      alert(TEXT.multiCartCheckout);
      return null;
    }
    return rows[0];
  }

  function beginCheckoutFlow() {
    if (checkoutInProgress) return;
    const row = prepareCheckoutRow();
    if (!row) return;
    trackAnalyticsEvent("checkout_start", {
      source: "cart",
      product: String(row.product || "").slice(0, 120),
      amount: Math.max(0, toAmount(row.price)),
    });

    if (!cartPaymentModalEl || !cartPaymentModalOptions.length) {
      persistCartSelection(undefined, activePromoCode, activePaymentMethod);
      const currentPath = String(window.location.pathname || "").trim();
      if (currentPath !== checkoutLandingPath) {
        window.location.href = checkoutLandingPath;
        return;
      }
      alert(TEXT.checkoutError);
      return;
    }

    checkoutPendingRow = row;
    checkoutPendingPromoCode = activePromoCode;
    openPaymentMethodModal();
  }

  function startCheckoutWithMethod(method) {
    if (checkoutInProgress) return;
    const pendingRow = checkoutPendingRow;
    if (!pendingRow) return;

    const selectedMethod = savePaymentMethod(method);
    syncPaymentMethodUi();
    closePaymentMethodModal();
    trackAnalyticsEvent("payment_method_selected", {
      source: "modal",
      method: selectedMethod,
    });

    checkoutInProgress = true;
    startBackendCheckout(pendingRow, pendingRow.qty, checkoutPendingPromoCode, selectedMethod)
      .catch(error => {
        alert(resolveCheckoutErrorMessage(error));
      })
      .finally(() => {
        checkoutInProgress = false;
        resetPendingCheckout();
      });
  }

  function resolveCheckoutErrorMessage(error) {
    const raw = String(error && error.message ? error.message : "").trim();
    if (!raw) return TEXT.checkoutError;
    if (/lava payment gateway is not configured/i.test(raw) || /lava webhook secret is not configured/i.test(raw)) {
      return TEXT.lavaUnavailable;
    }
    return raw;
  }

  function mapCheckoutValidationField(fieldName) {
    const key = String(fieldName || "").trim().toLowerCase();
    if (!key) return "";
    if (key === "email") return isEnPage ? "Email" : "Email";
    if (key === "plan_id" || key === "planid" || key === "product_id" || key === "productid") {
      return isEnPage ? "Product" : "Товар";
    }
    if (key === "payment_method" || key === "paymentmethod") {
      return isEnPage ? "Payment method" : "Способ оплаты";
    }
    if (key === "promo_code" || key === "promocode") {
      return isEnPage ? "Promo code" : "Промокод";
    }
    return fieldName;
  }

  function extractCheckoutApiErrorMessage(payload) {
    if (!payload || typeof payload !== "object") return "";

    const message = String(payload.message || payload.error || "").trim();
    const details = payload.details && typeof payload.details === "object" ? payload.details : null;
    const fieldErrors = details && details.fieldErrors && typeof details.fieldErrors === "object" ? details.fieldErrors : null;

    if (fieldErrors) {
      const invalidFields = Object.keys(fieldErrors).filter(key => {
        const value = fieldErrors[key];
        return Array.isArray(value) ? value.some(Boolean) : Boolean(value);
      });
      if (invalidFields.length) {
        const labels = invalidFields.map(mapCheckoutValidationField).filter(Boolean);
        if (labels.length) {
          return isEnPage ? `Invalid fields: ${labels.join(", ")}` : `Проверьте поля: ${labels.join(", ")}`;
        }
      }
    }

    return message;
  }

  function toInt(value) {
    const parsed = Number.parseInt(String(value || "").replace(/[^\d-]/g, ""), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function toAmount(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const normalized = String(value || "")
      .replace(/\s+/g, "")
      .replace(/,/g, ".")
      .replace(/[^\d.-]/g, "");
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatAmount(value) {
    const amount = Math.max(0, toAmount(value));
    const hasFraction = Math.abs(amount % 1) > 0.000001;
    return amount.toLocaleString(numberLocale, {
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: 2,
    });
  }

  function formatRub(value) {
    return formatAmount(value) + " RUB";
  }

  function formatPriceByCurrency(value, currency) {
    const amount = Math.max(0, toAmount(value));
    const c = String(currency || "RUB").toUpperCase();
    const symbol = c === "RUB" ? "RUB" : c;
    return formatAmount(amount) + " " + symbol;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function setActivePromoCode(code, options = {}) {
    const normalized = normalizePromoCodeInput(code);
    const skipValidation = Boolean(options && options.skipValidation);
    activePromoCode = normalized;
    savePromoCode(normalized);
    if (headerCartPromoInputEl) headerCartPromoInputEl.value = normalized;
    if (cartPromoInputEl) cartPromoInputEl.value = normalized;

    if (productPreviewPromoInputEl && document.activeElement !== productPreviewPromoInputEl) {
      productPreviewPromoInputEl.value = normalized;
    }

    if (skipValidation) return;

    if (!normalized) {
      promoValidationState = "idle";
      promoDiscountAmount = 0;
      promoValidationContextKey = "";
      renderCart();
      return;
    }

    void validatePromoCodeViaBackend(normalized);
  }

  function getCardPromoCode(card) {
    return normalizePromoCodeInput(activePromoCode);
  }

  function alignToHashTarget(behavior = "auto") {
    const hash = String(window.location.hash || "").trim();
    if (!hash || hash === "#") return;

    const targetId = decodeURIComponent(hash.slice(1));
    if (!targetId) return;

    const target = document.getElementById(targetId);
    if (!target) return;

    target.scrollIntoView({ behavior, block: "start" });
  }

  function refreshCards() {
    cards = Array.from(document.querySelectorAll(".price-card[data-product]"));
  }

  function resolveBadge(itemBadge, tags) {
    const direct = String(itemBadge || "").toLowerCase();
    const allowed = new Set(["best", "new", "hit", "sale", "popular", "limited", "gift", "pro"]);
    if (allowed.has(direct)) return direct;
    if (Array.isArray(tags)) {
      const fromTags = tags
        .map((tag) => String(tag || "").toLowerCase())
        .find((tag) => tag.startsWith("badge:"));
      if (fromTags) {
        const value = fromTags.split(":")[1] || "";
        if (allowed.has(value)) return value;
      }
    }
    return "";
  }

  function resolveDeliveryType(itemDeliveryType, itemDeliveryMethod, tags) {
    const methodRaw = String(itemDeliveryMethod || "").trim();
    if (methodRaw === "2") return "credentials";
    if (methodRaw === "1") return "activation";

    const fromItem = String(itemDeliveryType || "").trim().toLowerCase();
    if (fromItem === "credentials" || fromItem === "manual") return "credentials";
    if (fromItem === "activation" || fromItem === "token") return "activation";
    if (Array.isArray(tags)) {
      const fromTags = tags
        .map(tag => String(tag || "").trim().toLowerCase())
        .find(tag => tag.startsWith("delivery:"));
      if (fromTags) {
        const value = fromTags.split(":")[1] || "";
        if (value === "credentials" || value === "manual") return "credentials";
      }
    }
    return "activation";
  }

  function parseDescriptionLines(description) {
    return String(description || "")
      .split(/\r?\n/)
      .map(v => v.trim())
      .filter(Boolean);
  }

  function parseDescriptionModel(description) {
    const lines = parseDescriptionLines(description);
    const visibleLines = [];

    lines.forEach(line => {
      const mediaMatch = line.match(/^media\s*:\s*(image|video)\s*:\s*(.+)$/i);
      if (mediaMatch) {
        return;
      }

      const captionMatch = line.match(/^media-caption\s*:\s*(.+)$/i);
      if (captionMatch) {
        return;
      }

      visibleLines.push(line);
    });

    return {
      lines: visibleLines,
      plainText: visibleLines.join("\n"),
    };
  }

  function buildPreviewDescriptionMarkup(lines, className = "product-preview-modal__list") {
    const safeLines = Array.isArray(lines) ? lines.filter(Boolean) : [];
    if (!safeLines.length) {
      return '<p class="product-preview-modal__empty">' + escapeHtml(TEXT.previewNoDetails) + "</p>";
    }

    return (
      '<ul class="' + escapeHtml(className) + '">' +
      safeLines.map(line => '<li>' + escapeHtml(line) + "</li>").join("") +
      "</ul>"
    );
  }

  function renderProductPreviewPrice(basePrice, finalPrice, currency) {
    if (!productPreviewPriceEl) return;
    const baseAmount = Math.max(0, toAmount(basePrice));
    const finalAmount = Math.max(0, toAmount(finalPrice));
    const baseLabel = formatPriceByCurrency(baseAmount, currency);
    const finalLabel = formatPriceByCurrency(finalAmount, currency);
    const hasDiscount = finalAmount < baseAmount - 0.000001;

    if (!hasDiscount) {
      productPreviewPriceEl.textContent = baseLabel;
      return;
    }

    productPreviewPriceEl.innerHTML =
      '<span class="product-preview-modal__price-old">' +
      escapeHtml(baseLabel) +
      '</span><span class="product-preview-modal__price-current">' +
      escapeHtml(finalLabel) +
      "</span>";
  }

  function renderProductCardPrice(productId, basePrice, finalPrice, currency) {
    const targetProductId = String(productId || "").trim();
    if (!targetProductId) return;

    if (!cards || !cards.length) refreshCards();
    const card = cards.find(node => String(node.getAttribute("data-product-id") || "").trim() === targetProductId);
    if (!card) return;

    const priceEl = card.querySelector(".price");
    if (!priceEl) return;

    const baseAmount = Math.max(0, toAmount(basePrice));
    const finalAmount = Math.max(0, toAmount(finalPrice));
    const baseLabel = formatPriceByCurrency(baseAmount, currency);
    const finalLabel = formatPriceByCurrency(finalAmount, currency);
    const hasDiscount = finalAmount < baseAmount - 0.000001;

    card.classList.toggle("has-promo-price", hasDiscount);
    if (!hasDiscount) {
      priceEl.textContent = baseLabel;
      return;
    }

    priceEl.innerHTML =
      '<span class="price-card__price-old">' +
      escapeHtml(baseLabel) +
      '</span><span class="price-card__price-current">' +
      escapeHtml(finalLabel) +
      "</span>";
  }

  function renderProductPreviewPayButton(finalPrice, currency) {
    if (!productPreviewPayBtnEl) return;
    const amountLabel = formatPriceByCurrency(Math.max(0, toAmount(finalPrice)), currency);
    productPreviewPayBtnEl.textContent = TEXT.previewPayWithAmount(amountLabel);
  }

  async function applyPreviewPromoCode(code) {
    if (!previewItem) return;
    const normalized = normalizePromoCodeInput(code);
    const productId = String(previewItem.productId || "").trim();
    const basePrice = Math.max(0, toAmount(previewItem.price));
    const currency = String(previewItem.currency || "RUB").trim() || "RUB";

    setActivePromoCode(normalized, { skipValidation: true });

    if (!normalized) {
      promoValidationState = "idle";
      promoDiscountAmount = 0;
      promoValidationContextKey = "";
      renderProductPreviewPrice(basePrice, basePrice, currency);
      renderProductPreviewPayButton(basePrice, currency);
      renderProductCardPrice(productId, basePrice, basePrice, currency);
      if (productPreviewPromoMsgEl) {
        productPreviewPromoMsgEl.textContent = "";
        applyPromoMessageState(productPreviewPromoMsgEl, "idle");
      }
      renderCart();
      return;
    }

    if (!productId) {
      renderProductPreviewPrice(basePrice, basePrice, currency);
      renderProductPreviewPayButton(basePrice, currency);
      if (productPreviewPromoMsgEl) {
        productPreviewPromoMsgEl.textContent = TEXT.promoAccepted + ". " + formatPriceByCurrency(basePrice, currency);
        applyPromoMessageState(productPreviewPromoMsgEl, "valid");
      }
      renderCart();
      return;
    }

    if (productPreviewPromoMsgEl) {
      productPreviewPromoMsgEl.textContent = TEXT.promoChecking;
      applyPromoMessageState(productPreviewPromoMsgEl, "checking");
    }

    try {
      const response = await fetch("/api/promo/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: normalized,
          productId,
          quantity: 1,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      const isValid = Boolean(response.ok && payload && payload.valid);
      if (isValid) {
        const discountAmount = Math.max(0, toAmount(payload.discountAmount));
        const finalPrice = Math.max(0, toAmount(payload.finalPrice || basePrice - discountAmount));
        trackAnalyticsEvent("promo_validate_success", {
          source: "preview",
          code: normalized.slice(0, 32),
          discount: discountAmount,
          product_id: productId,
        });
        promoValidationState = "valid";
        promoDiscountAmount = discountAmount;
        promoValidationContextKey = [normalized, productId, "1"].join("|");
        renderProductPreviewPrice(basePrice, finalPrice, currency);
        renderProductPreviewPayButton(finalPrice, currency);
        renderProductCardPrice(productId, basePrice, finalPrice, currency);
        if (productPreviewPromoMsgEl) {
          productPreviewPromoMsgEl.textContent =
            TEXT.promoAccepted + (discountAmount > 0 ? " (-" + formatRub(discountAmount) + ")" : "") + ". " + formatPriceByCurrency(finalPrice, currency);
          applyPromoMessageState(productPreviewPromoMsgEl, "valid");
        }
      } else {
        trackAnalyticsEvent("promo_validate_fail", {
          source: "preview",
          code: normalized.slice(0, 32),
          product_id: productId,
        });
        promoValidationState = "invalid";
        promoDiscountAmount = 0;
        promoValidationContextKey = [normalized, productId, "1"].join("|");
        renderProductPreviewPrice(basePrice, basePrice, currency);
        renderProductPreviewPayButton(basePrice, currency);
        renderProductCardPrice(productId, basePrice, basePrice, currency);
        if (productPreviewPromoMsgEl) {
          productPreviewPromoMsgEl.textContent = TEXT.promoInvalid;
          applyPromoMessageState(productPreviewPromoMsgEl, "invalid");
        }
      }
    } catch (_) {
      trackAnalyticsEvent("promo_validate_fail", {
        source: "preview",
        code: normalized.slice(0, 32),
        product_id: productId,
      });
      promoValidationState = "invalid";
      promoDiscountAmount = 0;
      promoValidationContextKey = [normalized, productId, "1"].join("|");
      renderProductPreviewPrice(basePrice, basePrice, currency);
      renderProductPreviewPayButton(basePrice, currency);
      renderProductCardPrice(productId, basePrice, basePrice, currency);
      if (productPreviewPromoMsgEl) {
        productPreviewPromoMsgEl.textContent = TEXT.promoInvalid;
        applyPromoMessageState(productPreviewPromoMsgEl, "invalid");
      }
    }

    renderCart();
  }

  function closeProductPreviewModal() {
    if (!productPreviewModalEl) return;
    productPreviewModalEl.hidden = true;
    productPreviewModalEl.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-product-modal-open");
    productPreviewEmailInputEl = null;
    productPreviewPromoInputEl = null;
    productPreviewPromoApplyBtnEl = null;
    productPreviewPromoMsgEl = null;
    productPreviewPriceEl = null;
    previewItem = null;
  }

  function continueCheckoutFromPreview() {
    if (!previewItem || checkoutInProgress) return;

    const promoFromModal = normalizePromoCodeInput(
      productPreviewPromoInputEl ? productPreviewPromoInputEl.value : (previewItem.promoCode || activePromoCode)
    );
    setActivePromoCode(promoFromModal, { skipValidation: true });

    if (!cartPaymentModalEl || !cartPaymentModalOptions.length) {
      const directItem = previewItem;
      closeProductPreviewModal();
      checkoutInProgress = true;
      startBackendCheckout(directItem, 1, promoFromModal, activePaymentMethod)
        .catch(error => {
          alert(resolveCheckoutErrorMessage(error));
        })
        .finally(() => {
          checkoutInProgress = false;
          resetPendingCheckout();
        });
      return;
    }

    checkoutPendingRow = previewItem;
    checkoutPendingPromoCode = promoFromModal;
    closeProductPreviewModal();
    openPaymentMethodModal();
  }

  function ensureProductPreviewModal() {
    if (productPreviewModalEl) return;

    productPreviewModalEl = document.getElementById("productPreviewModal");
    if (!productPreviewModalEl) {
      const modal = document.createElement("div");
      modal.id = "productPreviewModal";
      modal.className = "product-preview-modal";
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      modal.innerHTML = [
        '<div class="product-preview-modal__backdrop" data-product-preview-close></div>',
        '<div class="product-preview-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="productPreviewModalTitle">',
        '  <button type="button" class="product-preview-modal__close" aria-label="' + escapeHtml(TEXT.previewClose) + '" data-product-preview-close>&times;</button>',
        '  <div class="product-preview-modal__content" id="productPreviewContent"></div>',
        '  <div class="product-preview-modal__actions">',
        '    <button type="button" class="btn product-preview-modal__pay" id="productPreviewPayBtn">' + escapeHtml(TEXT.previewPay) + "</button>",
        "  </div>",
        "</div>",
      ].join("");
      document.body.appendChild(modal);
      productPreviewModalEl = modal;
    }

    productPreviewContentEl = document.getElementById("productPreviewContent");
    productPreviewPayBtnEl = document.getElementById("productPreviewPayBtn");

    const closeButtons = Array.from(productPreviewModalEl.querySelectorAll("[data-product-preview-close]"));
    closeButtons.forEach(btn => {
      btn.addEventListener("click", closeProductPreviewModal);
    });

    if (productPreviewPayBtnEl) {
      productPreviewPayBtnEl.addEventListener("click", continueCheckoutFromPreview);
    }
  }

  function openProductPreviewModal(item) {
    if (!item) return;
    ensureProductPreviewModal();
    if (!productPreviewModalEl || !productPreviewContentEl) return;
    trackAnalyticsEvent("plan_preview_open", {
      product: String(item.product || item.title || "").slice(0, 120),
      amount: Math.max(0, toAmount(item.price)),
    });

    const model = parseDescriptionModel(item.description || "");
    const modalDescriptionModel = parseDescriptionModel(item.modalDescription || model.plainText || "");

    productPreviewContentEl.innerHTML = [
      '<div class="product-preview-modal__head">',
      '<h3 class="product-preview-modal__title" id="productPreviewModalTitle">' + escapeHtml(item.title || item.product || TEXT.previewTitle) + "</h3>",
      '<div class="product-preview-modal__price" id="productPreviewPrice">' + escapeHtml(formatPriceByCurrency(item.price, item.currency)) + "</div>",
      "</div>",
      '<section class="product-preview-modal__description">',
      buildPreviewDescriptionMarkup(modalDescriptionModel.lines, "product-preview-modal__description-list"),
      "</section>",
      '<section class="product-preview-modal__checkout">',
      '<label class="product-preview-modal__field-label" for="productPreviewEmailInput">' + escapeHtml(TEXT.previewEmailLabel) + "</label>",
      '<input type="email" class="product-preview-modal__field-input" id="productPreviewEmailInput" placeholder="' + escapeHtml(TEXT.emailPlaceholder) + '" autocomplete="email" />',
      '<label class="product-preview-modal__field-label" for="productPreviewPromoInput">' + escapeHtml(TEXT.previewPromoLabel) + "</label>",
      '<div class="product-preview-modal__promo-row">',
      '<input type="text" class="product-preview-modal__field-input" id="productPreviewPromoInput" placeholder="' + escapeHtml(TEXT.cardPromoPlaceholder) + '" autocomplete="off" inputmode="text" maxlength="40" />',
      '<button type="button" class="product-preview-modal__promo-apply" id="productPreviewPromoApplyBtn">' + escapeHtml(TEXT.previewPromoApply) + "</button>",
      "</div>",
      '<p class="product-preview-modal__promo-msg" id="productPreviewPromoMsg"></p>',
      "</section>",
    ].join("");

    previewItem = {
      ...item,
      description: model.plainText,
      modalDescription: modalDescriptionModel.plainText,
      deliveryType: item.deliveryType || "activation",
    };

    productPreviewEmailInputEl = document.getElementById("productPreviewEmailInput");
    productPreviewPromoInputEl = document.getElementById("productPreviewPromoInput");
    productPreviewPromoApplyBtnEl = document.getElementById("productPreviewPromoApplyBtn");
    productPreviewPromoMsgEl = document.getElementById("productPreviewPromoMsg");
    productPreviewPriceEl = document.getElementById("productPreviewPrice");

    const storedEmail = String(localStorage.getItem("checkout_email") || "").trim().toLowerCase();
    if (productPreviewEmailInputEl) {
      productPreviewEmailInputEl.value = storedEmail;
      productPreviewEmailInputEl.addEventListener("input", () => {
        const value = String(productPreviewEmailInputEl.value || "").trim().toLowerCase();
        if (!isValidEmail(value)) return;
        localStorage.setItem("checkout_email", value);
      });
    }

    const cardPromoCode = normalizePromoCodeInput(item.promoCode || "");
    const effectivePromo = cardPromoCode || normalizePromoCodeInput(activePromoCode);
    if (productPreviewPromoInputEl) {
      productPreviewPromoInputEl.value = effectivePromo;
      productPreviewPromoInputEl.addEventListener("input", () => {
        const value = normalizePromoCodeInput(productPreviewPromoInputEl.value || "");
        if (productPreviewPromoInputEl.value !== value) productPreviewPromoInputEl.value = value;
      });
      productPreviewPromoInputEl.addEventListener("keydown", e => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        applyPreviewPromoCode(productPreviewPromoInputEl.value || "");
      });
    }
    if (productPreviewPromoApplyBtnEl) {
      productPreviewPromoApplyBtnEl.addEventListener("click", () => {
        applyPreviewPromoCode(productPreviewPromoInputEl ? productPreviewPromoInputEl.value : "");
      });
    }
    renderProductPreviewPrice(previewItem.price, previewItem.price, previewItem.currency);
    renderProductPreviewPayButton(previewItem.price, previewItem.currency);
    if (effectivePromo) {
      applyPreviewPromoCode(effectivePromo);
    } else if (productPreviewPromoMsgEl) {
      productPreviewPromoMsgEl.textContent = "";
      applyPromoMessageState(productPreviewPromoMsgEl, "idle");
    }

    productPreviewModalEl.hidden = false;
    productPreviewModalEl.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-product-modal-open");
  }

  function buildProductCard(item, index) {
    const product = String(item.product || item.id || "product_" + index).trim();
    const title = String(item.title || "Product").trim();
      const description = String(item.description || "").trim();
      const descriptionModel = parseDescriptionModel(description);
      const modalDescriptionModel = parseDescriptionModel(String(item.modalDescription || descriptionModel.plainText).trim());
      const descriptionLines = descriptionModel.lines;
    const durationLineRegex = /^(срок|duration)\s*:/i;
    const durationLine = descriptionLines.find(line => durationLineRegex.test(line)) || "";
    const nonDurationLines = descriptionLines.filter(line => !durationLineRegex.test(line));
    const category = String(item.category || "").trim();
    const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];
    const displayTags = tags.filter(tag => !String(tag).startsWith("badge:"));
    const term = category || (displayTags[0] ? displayTags[0].toUpperCase() : "DIGITAL");
    const sub = displayTags.length ? displayTags.slice(0, 3).join(" • ") : String(nonDurationLines[0] || description).slice(0, 90);
    const topHighlights = nonDurationLines.slice(0, 5);
    const topHighlightsHtml = topHighlights
      .map(line => '<div class="sub-top-line">' + escapeHtml(line) + "</div>")
      .join("");
    const topHighlightsBlock = topHighlights.length ? '<div class="sub sub-top-list">' + topHighlightsHtml + "</div>" : "";
    const price = Math.max(0, toAmount(item.price));
    const currency = String(item.currency || "RUB").toUpperCase();
    const deliveryType = resolveDeliveryType(item.deliveryType, item.deliveryMethod, tags);
    const badgeType = resolveBadge(item.badge, tags);
    const badgeLabelByType = {
      best: TEXT.badgeBest,
      new: TEXT.badgeNew,
      hit: TEXT.badgeHit,
      sale: TEXT.badgeSale,
      popular: TEXT.badgePopular,
      limited: TEXT.badgeLimited,
      gift: TEXT.badgeGift,
      pro: TEXT.badgePro,
    };
    const badge = badgeType
      ? '<span class="badge ' + escapeHtml(badgeType) + '">' + escapeHtml(badgeLabelByType[badgeType] || TEXT.badgeBest) + "</span>"
      : "";
    const featureSource = nonDurationLines.slice(5);
    const features = featureSource
      .slice(0, 3)
      .map(v => {
        const normalized = String(v || "").toLowerCase();
        const isDuration = normalized.startsWith("продолжительность") || normalized.startsWith("duration");
        const liClass = isDuration ? "feature-line feature-duration" : "feature-line";
        return '<li class="' + liClass + '">&#10003; ' + escapeHtml(v) + "</li>";
      })
      .join("");
    const list = features ? '<ul class="price-card-features">' + features + "</ul>" : "";
    const durationMarkup = durationLine ? '<div class="price-duration">&#10003; ' + escapeHtml(durationLine) + "</div>" : "";

    return (
      '<div class="price-card' + (badgeType === "best" ? " featured" : "") + '"' +
      ' data-product="' + escapeHtml(product) + '"' +
      ' data-product-id="' + escapeHtml(String(item.id || "")) + '"' +
      ' data-title="' + escapeHtml(title) + '"' +
      ' data-sub="' + escapeHtml(sub) + '"' +
      ' data-term="' + escapeHtml(term) + '"' +
      ' data-description="' + escapeHtml(descriptionModel.plainText) + '"' +
      ' data-modal-description="' + escapeHtml(modalDescriptionModel.plainText) + '"' +
      ' data-price="' + escapeHtml(price) + '"' +
      ' data-currency="' + escapeHtml(currency) + '"' +
      ' data-delivery-type="' + escapeHtml(deliveryType) + '">' +
      badge +
      "<h3>" + escapeHtml(title) + "</h3>" +
      '<div class="term">' + escapeHtml(term) + "</div>" +
      topHighlightsBlock +
      '<div class="price">' + escapeHtml(formatPriceByCurrency(price, currency)) + "</div>" +
      durationMarkup +
      list +
      '<div class="price-actions">' +
      '<button type="button" class="buy-btn pay-now-btn" data-product="' + escapeHtml(product) + '" data-sub="' + escapeHtml(sub) + '" data-title="' + escapeHtml(title) + '" data-term="' + escapeHtml(term) + '" data-price="' + escapeHtml(price) + '" data-currency="' + escapeHtml(currency) + '">' + escapeHtml(TEXT.payNow) + "</button>" +
      "</div>" +
      '<div class="meta"><span>&#10003; ' + escapeHtml(TEXT.metaAuto) + "</span><span>&#10003; " + escapeHtml(TEXT.metaSecure) + "</span><span>&#10003; " + escapeHtml(TEXT.metaSupport) + "</span></div>" +
      "</div>"
    );
  }

  async function fetchProductsPayload(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && productsPayloadCache && now - productsPayloadCacheTs < PRODUCTS_CACHE_TTL_MS) {
      return productsPayloadCache;
    }
    if (!forceRefresh && productsPayloadPendingPromise) {
      return productsPayloadPendingPromise;
    }

    productsPayloadPendingPromise = fetch("/api/public/products?lang=" + (isEnPage ? "en" : "ru"), {
      cache: "no-store",
    })
      .then(response => {
        if (!response.ok) throw new Error("Products API not available");
        return response.json();
      })
      .then(payload => {
        const normalizedPayload =
          payload && typeof payload === "object" ? payload : { items: [] };
        productsPayloadCache = normalizedPayload;
        productsPayloadCacheTs = Date.now();
        return normalizedPayload;
      })
      .finally(() => {
        productsPayloadPendingPromise = null;
      });

    return productsPayloadPendingPromise;
  }

  async function loadPricingCards() {
    if (!pricingGridEl) {
      refreshCards();
      return;
    }

    try {
      const payload = await fetchProductsPayload();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      reconcileCartProductIds(items);

      if (!items.length) {
        pricingGridEl.innerHTML = '<div class="price-card"><h3>' + escapeHtml(TEXT.productsUnavailable) + "</h3></div>";
        refreshCards();
        return;
      }

      pricingGridEl.innerHTML = items.map((item, idx) => buildProductCard(item, idx)).join("");
      refreshCards();
      syncCards();
      renderCart();
      alignToHashTarget("auto");
    } catch (_) {
      refreshCards();
      syncCards();
      renderCart();
      alignToHashTarget("auto");
    }
  }

  function submitWebMoneyPayment(amount, description) {
    const numericAmount = Math.max(0, toAmount(amount));
    if (!numericAmount) return;

    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/payment/webmoney/pay.php";

    const amountInput = document.createElement("input");
    amountInput.type = "hidden";
    amountInput.name = "amount";
    amountInput.value = String(numericAmount);

    const descInput = document.createElement("input");
    descInput.type = "hidden";
    descInput.name = "description";
    descInput.value = String(description || TEXT.paymentFallback).slice(0, 240);

    form.appendChild(amountInput);
    form.appendChild(descInput);
    document.body.appendChild(form);
    form.submit();
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
  }

  function syncCheckoutEmailInputs() {
    const stored = String(localStorage.getItem("checkout_email") || "").trim().toLowerCase();
    if (headerCartEmailInputEl && !String(headerCartEmailInputEl.value || "").trim()) {
      headerCartEmailInputEl.value = stored;
    }
    if (cartEmailInputEl && !String(cartEmailInputEl.value || "").trim()) {
      cartEmailInputEl.value = stored;
    }
    if (productPreviewEmailInputEl && !String(productPreviewEmailInputEl.value || "").trim()) {
      productPreviewEmailInputEl.value = stored;
    }
  }

  function markEmailInvalid(inputEl) {
    if (!inputEl) return;
    inputEl.classList.add("is-invalid");
    inputEl.focus();
    setTimeout(() => inputEl.classList.remove("is-invalid"), 1400);
  }

  function pickEmailCandidate() {
    const values = [
      String(productPreviewEmailInputEl ? productPreviewEmailInputEl.value : "").trim().toLowerCase(),
      String(headerCartEmailInputEl ? headerCartEmailInputEl.value : "").trim().toLowerCase(),
      String(cartEmailInputEl ? cartEmailInputEl.value : "").trim().toLowerCase(),
      String(localStorage.getItem("checkout_email") || "").trim().toLowerCase(),
    ].filter(Boolean);
    return values[0] || "";
  }

  function getCheckoutEmail() {
    const email = pickEmailCandidate();
    if (!isValidEmail(email)) {
      markEmailInvalid(productPreviewEmailInputEl);
      markEmailInvalid(headerCartEmailInputEl);
      markEmailInvalid(cartEmailInputEl);
      alert(TEXT.invalidEmail);
      return "";
    }

    localStorage.setItem("checkout_email", email);
    if (productPreviewEmailInputEl) productPreviewEmailInputEl.value = email;
    if (headerCartEmailInputEl) headerCartEmailInputEl.value = email;
    if (cartEmailInputEl) cartEmailInputEl.value = email;
    return email;
  }

  async function startBackendCheckout(item, qty, promoCode, paymentMethod) {
    const checkoutItem = await ensureCheckoutItemProductId(item);
    if (!checkoutItem || !checkoutItem.productId) {
      throw new Error(TEXT.checkoutProductMissing);
    }

    const selectedPaymentMethod = normalizePaymentMethod(paymentMethod || getSelectedPaymentMethod());

    const email = getCheckoutEmail();
    if (!email) {
      alert(TEXT.invalidEmail);
      return;
    }

    const productId = String(checkoutItem.productId || "").trim();
    const normalizedPromoCode = normalizePromoCodeInput(promoCode || "");

    const payload = {
      email,
      plan_id: productId,
      planId: productId,
      product_id: productId,
      productId: productId,
      qty: 1,
      quantity: 1,
      promo_code: normalizedPromoCode || undefined,
      promoCode: normalizedPromoCode || undefined,
      payment_method: selectedPaymentMethod,
      paymentMethod: selectedPaymentMethod,
    };

    const response = await fetch("/api/payments/" + encodeURIComponent(selectedPaymentMethod) + "/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const raw = await response.text();
    const data = safeParse(raw, {});
    if (!response.ok || !data.pay_url) {
      let rawError = extractCheckoutApiErrorMessage(data);
      if (!rawError) {
        const plain = String(raw || "").replace(/\s+/g, " ").trim();
        if (plain && plain.length <= 220 && !/^<!doctype/i.test(plain)) {
          rawError = plain;
        }
      }
      if (selectedPaymentMethod === "lava" && /not configured/i.test(rawError)) {
        throw new Error(TEXT.lavaUnavailable);
      }
      throw new Error(rawError || TEXT.checkoutError);
    }

    persistActivationResumeContext(
      String(data.order_id || ""),
      String(data.activation_token || ""),
      String(data.activation_url || "")
    );

    const checkoutUrl = String(data.pay_url);
    trackAnalyticsEvent("checkout_redirect", {
      method: selectedPaymentMethod,
      product_id: productId,
      amount: Math.max(0, toAmount(checkoutItem.price)),
    });
    window.location.href = checkoutUrl;
  }

  function safeParse(raw, fallback) {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function clearLegacyCartArtifacts() {
    try {
      localStorage.removeItem(CART_KEY);
      localStorage.removeItem(CART_SELECTION_KEY);
    } catch (_) {
      // Ignore storage cleanup errors.
    }
  }

  function normalizeCartRow(source, fallbackProduct = "") {
    if (!source || typeof source !== "object") return null;
    const product = String(source.product || fallbackProduct || "").trim();
    if (!product) return null;

    const lineId = String(source.lineId || source.id || ("lot_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10))).trim();
    const qty = 1;

    return {
      lineId,
      product,
      productId: String(source.productId || "").trim(),
      title: String(source.title || product).trim(),
      term: String(source.term || "").trim(),
      sub: String(source.sub || "").trim(),
      price: Math.max(0, toAmount(source.price)),
      currency: String(source.currency || "RUB").trim() || "RUB",
      qty,
    };
  }

  function loadCart() {
    try {
      const parsed = safeParse(localStorage.getItem(CART_KEY) || "[]", []);
      if (Array.isArray(parsed)) {
        const rows = parsed.map(row => normalizeCartRow(row)).filter(Boolean);
        if (rows.length !== parsed.length) saveCart(rows);
        return rows;
      }

      if (parsed && typeof parsed === "object") {
        const legacyRows = Object.entries(parsed)
          .map(([product, row]) => normalizeCartRow(row, product))
          .filter(Boolean);
        if (legacyRows.length) saveCart(legacyRows);
        return legacyRows;
      }

      return [];
    } catch (_) {
      return [];
    }
  }

  function saveCart(cart) {
    const rows = Array.isArray(cart) ? cart.map(row => normalizeCartRow(row)).filter(Boolean) : [];
    const singleRowCart = rows.length ? [rows[rows.length - 1]] : [];
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(singleRowCart));
    } catch (_) {
      // Ignore storage write errors.
    }
  }

  function loadPromoCode() {
    try {
      return normalizePromoCodeInput(localStorage.getItem(PROMO_CODE_KEY) || "");
    } catch (_) {
      return "";
    }
  }

  function savePromoCode(code) {
    const normalized = normalizePromoCodeInput(code);
    try {
      if (normalized) {
        localStorage.setItem(PROMO_CODE_KEY, normalized);
        localStorage.setItem(PROMO_CODE_TS_KEY, String(Date.now()));
      } else {
        localStorage.removeItem(PROMO_CODE_KEY);
        localStorage.removeItem(PROMO_CODE_TS_KEY);
      }
    } catch (_) {
      // Ignore storage write errors.
    }
  }

  function loadPromoTimestamp() {
    try {
      const raw = Number(localStorage.getItem(PROMO_CODE_TS_KEY) || 0);
      return Number.isFinite(raw) && raw > 0 ? raw : 0;
    } catch (_) {
      return 0;
    }
  }

  function hasCartItems() {
    return loadCart().some(row => row && row.lineId && row.product && toInt(row.qty) > 0);
  }

  function isPromoExpiredForUnpaidCart() {
    if (!activePromoCode) return false;
    if (!hasCartItems()) return false;
    const savedAt = loadPromoTimestamp();
    if (!savedAt) return false;
    return Date.now() - savedAt >= PROMO_TTL_MS;
  }

  function clearPromoCodeState() {
    activePromoCode = "";
    promoValidationState = "idle";
    promoDiscountAmount = 0;
    promoValidationContextKey = "";
    savePromoCode("");
    if (headerCartPromoInputEl) headerCartPromoInputEl.value = "";
    if (cartPromoInputEl) cartPromoInputEl.value = "";
  }

  function calculateDiscount(total, code) {
    const hasCode = String(code || "").trim().length > 0;
    if (!hasCode || promoValidationState !== "valid") return 0;
    const base = Math.max(0, toAmount(total));
    const discount = Math.max(0, toAmount(promoDiscountAmount));
    return Math.min(base, Number(discount.toFixed(2)));
  }

  async function validatePromoCodeViaBackend(code) {
    const normalized = normalizePromoCodeInput(code);
    if (!normalized) {
      promoValidationState = "idle";
      promoDiscountAmount = 0;
      promoValidationContextKey = "";
      renderCart();
      return;
    }

    const rows = loadCart().filter(row => row && row.lineId && row.product && toInt(row.qty) > 0);
    const first = rows[0];
    if (!first || !first.productId) {
      promoValidationState = "idle";
      promoDiscountAmount = 0;
      promoValidationContextKey = "";
      renderCart();
      return;
    }
    const qty = Math.max(1, toInt(first.qty) || 1);
    promoValidationContextKey = [normalized, String(first.productId || ""), qty].join("|");

    promoValidationState = "checking";
    renderCart();

    try {
      const response = await fetch("/api/promo/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: normalized,
          productId: first.productId,
          quantity: qty,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload && payload.valid) {
        promoValidationState = "valid";
        promoDiscountAmount = Math.max(0, toAmount(payload.discountAmount));
        trackAnalyticsEvent("promo_validate_success", {
          source: "cart",
          code: normalized.slice(0, 32),
          discount: promoDiscountAmount,
          product_id: String(first.productId || ""),
        });
      } else {
        promoValidationState = "invalid";
        promoDiscountAmount = 0;
        trackAnalyticsEvent("promo_validate_fail", {
          source: "cart",
          code: normalized.slice(0, 32),
          product_id: String(first.productId || ""),
        });
      }
    } catch (_) {
      promoValidationState = "invalid";
      promoDiscountAmount = 0;
      trackAnalyticsEvent("promo_validate_fail", {
        source: "cart",
        code: normalized.slice(0, 32),
        product_id: String(first.productId || ""),
      });
    }

    renderCart();
  }

  function applyPromoMessageState(el, state) {
    if (!el) return;
    el.classList.remove("is-error", "is-success");
    if (state === "invalid") el.classList.add("is-error");
    if (state === "valid") el.classList.add("is-success");
  }

  function getCardItem(card) {
    if (!card) return null;
    const product = String(card.getAttribute("data-product") || "").trim();
    if (!product) return null;

    const h3 = card.querySelector("h3");
    const term = card.querySelector(".term");
    const sub = card.querySelector(".sub");
    const priceNode = card.querySelector(".price");

    const item = {
      product,
      productId: String(card.getAttribute("data-product-id") || "").trim(),
      title: String(card.getAttribute("data-title") || (h3 ? h3.innerText : "")).replace(/\s+/g, " ").trim(),
      term: String(card.getAttribute("data-term") || (term ? term.innerText : "")).replace(/\s+/g, " ").trim(),
      sub: String(card.getAttribute("data-sub") || (sub ? sub.innerText : "")).replace(/\s+/g, " ").trim(),
      promoCode: getCardPromoCode(card),
      description: String(card.getAttribute("data-description") || "").trim(),
      modalDescription: String(card.getAttribute("data-modal-description") || "").trim(),
      price: toAmount(card.getAttribute("data-price") || (priceNode ? priceNode.innerText : "")),
      currency: String(card.getAttribute("data-currency") || "RUB").trim() || "RUB",
      deliveryType: String(card.getAttribute("data-delivery-type") || "activation").trim() || "activation",
    };

    if (!item.description) {
      const topLines = Array.from(card.querySelectorAll(".sub-top-line"))
        .map(line => String(line.textContent || "").trim())
        .filter(Boolean);
      item.description = topLines.join("\n");
    }
    if (!item.modalDescription) {
      item.modalDescription = item.description;
    }

    return item;
  }

  function normalizeLookup(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function buildProductLookup(items) {
    const byProduct = new Map();
    const byTitle = new Map();
    if (!Array.isArray(items)) return { byProduct, byTitle };

    items.forEach(item => {
      const id = String(item?.id || "").trim();
      if (!id) return;

      const productKey = normalizeLookup(item?.product);
      if (productKey && !byProduct.has(productKey)) byProduct.set(productKey, id);

      const titleKey = normalizeLookup(item?.title);
      if (titleKey && !byTitle.has(titleKey)) byTitle.set(titleKey, id);
    });

    return { byProduct, byTitle };
  }

  function reconcileCartProductIds(items) {
    const lookup = buildProductLookup(items);
    const cart = loadCart();
    if (!cart.length) return;

    let changed = false;
    const next = cart.map(row => {
      if (!row || row.productId) return row;
      const matchedId =
        lookup.byProduct.get(normalizeLookup(row.product)) ||
        lookup.byTitle.get(normalizeLookup(row.title));
      if (!matchedId) return row;
      changed = true;
      return { ...row, productId: matchedId };
    });

    if (changed) saveCart(next);
  }

  function isValidCheckoutProductId(value) {
    return /^[a-z0-9]{10,}$/i.test(String(value || "").trim());
  }

  async function ensureCheckoutItemProductId(item) {
    if (!item) return null;
    const currentId = String(item.productId || "").trim();
    if (isValidCheckoutProductId(currentId)) return { ...item, productId: currentId };

    const cardItems = cards.map(card => getCardItem(card)).filter(Boolean);
    const cardLookup = buildProductLookup(cardItems);
    const directCardId =
      cardLookup.byProduct.get(normalizeLookup(item.product)) ||
      cardLookup.byTitle.get(normalizeLookup(item.title));
    if (isValidCheckoutProductId(directCardId)) {
      return { ...item, productId: directCardId };
    }

    try {
      const payload = await fetchProductsPayload();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      const lookup = buildProductLookup(items);
      const resolvedId =
        lookup.byProduct.get(normalizeLookup(item.product)) ||
        lookup.byTitle.get(normalizeLookup(item.title));
      return isValidCheckoutProductId(resolvedId) ? { ...item, productId: resolvedId } : item;
    } catch (_) {
      return item;
    }
  }

  function getQty(product) {
    const normalizedProduct = String(product || "").trim();
    if (!normalizedProduct) return 0;

    const rows = loadCart();
    return rows.reduce((sum, row) => {
      if (!row || row.product !== normalizedProduct) return sum;
      return sum + Math.max(1, toInt(row.qty));
    }, 0);
  }

  function getCardQty(product) {
    const normalizedProduct = String(product || "").trim();
    if (!normalizedProduct) return 1;
    return 1;
  }

  function addCartLot(item, qty) {
    if (!item || !item.product) return;
    const normalizedQty = 1;
    const nextItem = normalizeCartRow({
      lineId: "lot_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10),
      product: item.product,
      productId: item.productId,
      title: item.title,
      term: item.term,
      sub: item.sub,
      price: item.price,
      currency: item.currency || "RUB",
      qty: normalizedQty,
    });
    if (!nextItem) return;
    saveCart([nextItem]);
    renderCart();
  }

  function setLotQty(lineId, qty) {
    const normalizedLineId = String(lineId || "").trim();
    if (!normalizedLineId) return;

    const nextQty = Math.max(0, toInt(qty));
    const cart = loadCart();
    const index = cart.findIndex(row => row && row.lineId === normalizedLineId);
    if (index < 0) return;

    if (nextQty === 0) {
      cart.splice(index, 1);
    } else {
      cart[index] = {
        ...cart[index],
        qty: 1,
      };
    }

    saveCart(cart);
    renderCart();
  }

  function removeLot(lineId) {
    setLotQty(lineId, 0);
  }

  function syncCard(card) {
    const item = getCardItem(card);
    if (!item) return;

    const qty = getCardQty(item.product);
    const stepper = card.querySelector(".qty-stepper");
    if (stepper) stepper.hidden = true;
  }

  function syncCards() {
    cards.forEach(syncCard);
  }

  function bumpHeaderCart() {
    if (!headerCartEl) return;
    headerCartEl.classList.remove("bump");
    void headerCartEl.offsetWidth;
    headerCartEl.classList.add("bump");
  }

  function animateAddToCart(card) {
    if (!card || !headerCartEl) return;

    const from = card.getBoundingClientRect();
    const to = headerCartEl.getBoundingClientRect();
    const dot = document.createElement("div");
    dot.className = "cart-fly-dot";
    dot.style.left = `${from.left + from.width * 0.5 - 6}px`;
    dot.style.top = `${from.top + 24}px`;
    document.body.appendChild(dot);

    const dx = to.left + to.width * 0.5 - (from.left + from.width * 0.5);
    const dy = to.top + to.height * 0.5 - (from.top + 24);

    const anim = dot.animate(
      [
        { transform: "translate(0, 0) scale(1)", opacity: 0.95 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0.05 },
      ],
      {
        duration: 560,
        easing: "cubic-bezier(0.2, 0.7, 0.2, 1)",
      }
    );

    anim.onfinish = () => {
      dot.remove();
      bumpHeaderCart();
    };
  }

  function closeHeaderCartPanel() {
    if (!headerCartPanelEl) return;
    headerCartPanelEl.classList.remove("open");
    headerCartPanelEl.setAttribute("aria-hidden", "true");
  }

  function openHeaderCartPanel() {
    if (!headerCartPanelEl) return;
    headerCartPanelEl.classList.add("open");
    headerCartPanelEl.setAttribute("aria-hidden", "false");
  }

  function renderHeaderCartPanel(rows, total) {
    if (!headerCartPanelEl || !headerCartPanelListEl || !headerCartPanelEmptyEl || !headerCartPanelCountEl || !headerCartPanelTotalEl || !headerCartPanelCheckoutBtnEl) {
      return;
    }

    const count = rows.reduce((sum, row) => sum + Math.max(1, toInt(row.qty)), 0);
    const discount = calculateDiscount(total, activePromoCode);
    const finalTotal = Math.max(0, Number((total - discount).toFixed(2)));

    headerCartPanelCountEl.textContent = TEXT.panelCount(count);
    headerCartPanelTotalEl.textContent = formatRub(finalTotal);
    headerCartPanelCheckoutBtnEl.disabled = !rows.length;
    headerCartPanelCheckoutBtnEl.setAttribute("aria-disabled", rows.length ? "false" : "true");
    headerCartPanelEmptyEl.style.display = rows.length ? "none" : "block";

    if (!rows.length) {
      headerCartPanelListEl.innerHTML = "";
      if (headerCartPromoMsgEl) {
        headerCartPromoMsgEl.textContent = "";
        applyPromoMessageState(headerCartPromoMsgEl, "idle");
      }
      if (cartPromoMsgEl) {
        cartPromoMsgEl.textContent = "";
        applyPromoMessageState(cartPromoMsgEl, "idle");
      }
      return;
    }

    const promoMsg = !activePromoCode
      ? ""
      : promoValidationState === "checking"
      ? TEXT.promoChecking
      : promoValidationState === "valid"
      ? TEXT.promoAccepted + (discount > 0 ? " (-" + formatRub(discount) + ")" : "")
      : promoValidationState === "invalid"
      ? TEXT.promoInvalid
      : "";
    if (headerCartPromoMsgEl) {
      headerCartPromoMsgEl.textContent = promoMsg;
      applyPromoMessageState(headerCartPromoMsgEl, promoValidationState);
    }
    if (cartPromoMsgEl) {
      cartPromoMsgEl.textContent = promoMsg;
      applyPromoMessageState(cartPromoMsgEl, promoValidationState);
    }

    headerCartPanelListEl.innerHTML = rows
      .map(row => {
        const qty = 1;
        const price = Math.max(0, toAmount(row.price));
        return (
          '<article class="header-mini-item" data-line-id="' + escapeHtml(row.lineId) + '">' +
          '<div class="header-mini-item__top">' +
          '<div>' +
          '<div class="header-mini-item__title">' + escapeHtml(row.title || row.product) + "</div>" +
          '<div class="header-mini-item__price">' + escapeHtml(formatRub(price)) + " x " + qty + "</div>" +
          "</div>" +
          '<button type="button" class="header-mini-remove-btn">x</button>' +
          "</div>" +
          "</article>"
        );
      })
      .join("");
  }

  function renderCart() {
    if (isPromoExpiredForUnpaidCart()) {
      clearPromoCodeState();
    }

    const rows = loadCart().filter(row => row && row.lineId && row.product && toInt(row.qty) > 0);
    const first = rows[0];
    const firstQty = first ? Math.max(1, toInt(first.qty) || 1) : 0;
    const nextPromoContextKey =
      activePromoCode && first && first.productId
        ? [activePromoCode, String(first.productId || ""), firstQty].join("|")
        : "";
    if (nextPromoContextKey !== promoValidationContextKey) {
      promoValidationState = "idle";
      promoDiscountAmount = 0;
      promoValidationContextKey = "";
    }

    let total = 0;
    rows.forEach(row => {
      total += Math.max(0, toAmount(row.price)) * Math.max(1, toInt(row.qty));
    });

    const discount = calculateDiscount(total, activePromoCode);
    const headerTotal = Math.max(0, Number((total - discount).toFixed(2)));

    if (headerCartTotalEl) headerCartTotalEl.textContent = formatRub(headerTotal);
    if (headerCartCountEl) {
      const count = rows.reduce((sum, row) => sum + Math.max(1, toInt(row.qty)), 0);
      headerCartCountEl.textContent = String(count);
    }
    renderHeaderCartPanel(rows, total);

    if (cartTotalEl) cartTotalEl.textContent = formatRub(headerTotal);
    if (cartCheckoutEl) {
      cartCheckoutEl.setAttribute("aria-disabled", rows.length ? "false" : "true");
      cartCheckoutEl.disabled = !rows.length;
    }
    if (cartEmptyEl) cartEmptyEl.style.display = rows.length ? "none" : "block";

    if (!cartListEl) return;

    if (!rows.length) {
      cartListEl.innerHTML = "";
      if (cartPromoMsgEl) {
        cartPromoMsgEl.textContent = "";
        applyPromoMessageState(cartPromoMsgEl, "idle");
      }
      try {
        localStorage.removeItem(CART_SELECTION_KEY);
      } catch (_) {
        // Ignore storage write errors.
      }
      return;
    }

    if (cartPromoMsgEl) {
      const promoMsg = !activePromoCode
        ? ""
        : promoValidationState === "checking"
        ? TEXT.promoChecking
        : promoValidationState === "valid"
        ? TEXT.promoAccepted + (discount > 0 ? " (-" + formatRub(discount) + ")" : "")
        : promoValidationState === "invalid"
        ? TEXT.promoInvalid
        : "";
      cartPromoMsgEl.textContent = promoMsg;
      applyPromoMessageState(cartPromoMsgEl, promoValidationState);
    }

    cartListEl.innerHTML = rows
      .map(row => {
        const qty = 1;
        const itemTotal = Math.max(0, toAmount(row.price)) * qty;
        return (
          '<article class="cart-item" data-line-id="' +
          escapeHtml(row.lineId) +
          '">' +
          '<div class="cart-item__info">' +
          '<div class="cart-item__name">' +
          escapeHtml(row.title || row.product) +
          "</div>" +
          '<div class="cart-item__meta">' +
          escapeHtml((row.term ? row.term + " • " : "") + formatRub(toAmount(row.price)) + " x " + qty + " = " + formatRub(itemTotal)) +
          "</div>" +
          "</div>" +
          '<div class="cart-item__controls">' +
          '<button type="button" class="cart-remove-btn">' + escapeHtml(TEXT.remove) + "</button>" +
          "</div>" +
          "</article>"
        );
      })
      .join("");
  }

  function persistCartSelection(overrideTotal, promoCode, paymentMethod) {
    const rows = loadCart().filter(row => row && row.lineId && row.product && toInt(row.qty) > 0);
    if (!rows.length) return;

    const selectedPaymentMethod = normalizePaymentMethod(paymentMethod || activePaymentMethod);
    const total = overrideTotal !== undefined
      ? Math.max(0, toAmount(overrideTotal))
      : rows.reduce((sum, row) => sum + Math.max(0, toAmount(row.price)) * Math.max(1, toInt(row.qty)), 0);
    try {
      localStorage.setItem(
        CART_SELECTION_KEY,
        JSON.stringify({
          items: rows,
          total,
          promoCode: promoCode || null,
          paymentMethod: selectedPaymentMethod,
          currency: "RUB",
        })
      );
    } catch (_) {
      // Ignore storage write errors.
    }
  }

  document.addEventListener("click", e => {
    const payNowBtn = e.target.closest && e.target.closest(".pay-now-btn");
    if (payNowBtn) {
      e.preventDefault();
      const card = payNowBtn.closest(".price-card");
      const item = getCardItem(card);
      if (!item) return;
      const promoCode = getCardPromoCode(card);
      item.promoCode = promoCode;
      openProductPreviewModal(item);
      return;
    }

    const priceCard = e.target.closest && e.target.closest(".price-card[data-product]");
    if (priceCard && pricingGridEl && pricingGridEl.contains(priceCard)) {
      const interactive = e.target.closest("button, a, input, textarea, select, label");
      if (!interactive) {
        const item = getCardItem(priceCard);
        if (item) {
          const promoCode = getCardPromoCode(priceCard);
          item.promoCode = promoCode;
          openProductPreviewModal(item);
          return;
        }
      }
      return;
    }

    const headerMiniItem = e.target.closest && e.target.closest(".header-mini-item");
    if (headerMiniItem) {
      const lineId = String(headerMiniItem.getAttribute("data-line-id") || "").trim();
      if (!lineId) return;
      const cart = loadCart();
      const row = cart.find(item => item && item.lineId === lineId);
      if (!row) return;

      const removeMiniBtn = e.target.closest(".header-mini-remove-btn");
      if (removeMiniBtn) {
        removeLot(lineId);
        return;
      }

    }

    if (headerCartPromoApplyEl && (e.target === headerCartPromoApplyEl || e.target.closest("#headerCartPromoApply"))) {
      const raw = normalizePromoCodeInput(headerCartPromoInputEl ? headerCartPromoInputEl.value : "");
      setActivePromoCode(raw);
      if (cartPromoInputEl && cartPromoInputEl.value !== activePromoCode) cartPromoInputEl.value = activePromoCode;
      return;
    }

    if (cartPromoApplyEl && (e.target === cartPromoApplyEl || e.target.closest("#cartPromoApply"))) {
      const raw = normalizePromoCodeInput(cartPromoInputEl ? cartPromoInputEl.value : "");
      setActivePromoCode(raw);
      if (headerCartPromoInputEl && headerCartPromoInputEl.value !== activePromoCode) headerCartPromoInputEl.value = activePromoCode;
      return;
    }

    if (headerCartPanelCheckoutBtnEl && (e.target === headerCartPanelCheckoutBtnEl || e.target.closest("#headerCartPanelCheckoutBtn"))) {
      if (headerCartPanelCheckoutBtnEl.getAttribute("aria-disabled") === "true") return;
      beginCheckoutFlow();
      return;
    }

    const cartItem = e.target.closest && e.target.closest(".cart-item");
    if (!cartItem) return;
    const lineId = String(cartItem.getAttribute("data-line-id") || "").trim();
    if (!lineId) return;
    const cart = loadCart();
    const row = cart.find(item => item && item.lineId === lineId);
    if (!row) return;

    const removeBtn = e.target.closest(".cart-remove-btn");
    if (removeBtn) {
      removeLot(lineId);
      return;
    }

  });

  if (cartCheckoutEl) {
    cartCheckoutEl.addEventListener("click", e => {
      if (cartCheckoutEl.getAttribute("aria-disabled") === "true") {
        e.preventDefault();
        return;
      }

      beginCheckoutFlow();
    });
  }

  activePromoCode = loadPromoCode();
  activePaymentMethod = loadPaymentMethod();
  syncPaymentMethodUi();
  if (activePromoCode && !loadPromoTimestamp()) {
    savePromoCode(activePromoCode);
  }
  if (isPromoExpiredForUnpaidCart()) {
    clearPromoCodeState();
  }
  if (headerCartPromoInputEl) headerCartPromoInputEl.value = activePromoCode;
  if (cartPromoInputEl) cartPromoInputEl.value = activePromoCode;
  syncCheckoutEmailInputs();
  clearLegacyCartArtifacts();

  loadPricingCards();

  if (headerCartEl) {
    headerCartEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
        window.location.href = checkoutLandingPath;
        return;
      }

      clickTimer = setTimeout(() => {
        clickTimer = null;
        if (!headerCartPanelEl) return;
        const isOpen = headerCartPanelEl.classList.contains("open");
        if (isOpen) closeHeaderCartPanel();
        else openHeaderCartPanel();
      }, 220);
    });
  }

  if (headerCartPanelLinkEl) {
    headerCartPanelLinkEl.addEventListener("click", e => {
      e.preventDefault();
      window.location.href = checkoutLandingPath;
    });
  }

  if (headerCartPromoInputEl) {
    headerCartPromoInputEl.addEventListener("input", () => {
      const value = normalizePromoCodeInput(headerCartPromoInputEl.value || "");
      if (headerCartPromoInputEl.value !== value) headerCartPromoInputEl.value = value;
      if (cartPromoInputEl && cartPromoInputEl.value !== value) cartPromoInputEl.value = value;
    });
    headerCartPromoInputEl.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      setActivePromoCode(normalizePromoCodeInput(headerCartPromoInputEl.value || ""));
      if (cartPromoInputEl && cartPromoInputEl.value !== activePromoCode) cartPromoInputEl.value = activePromoCode;
    });
  }

  if (cartPromoInputEl) {
    cartPromoInputEl.addEventListener("input", () => {
      const value = normalizePromoCodeInput(cartPromoInputEl.value || "");
      if (cartPromoInputEl.value !== value) cartPromoInputEl.value = value;
      if (headerCartPromoInputEl && headerCartPromoInputEl.value !== value) headerCartPromoInputEl.value = value;
    });
    cartPromoInputEl.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      setActivePromoCode(normalizePromoCodeInput(cartPromoInputEl.value || ""));
      if (headerCartPromoInputEl && headerCartPromoInputEl.value !== activePromoCode) headerCartPromoInputEl.value = activePromoCode;
    });
  }

  if (cartPaymentMethodsEl) {
    cartPaymentMethodsEl.addEventListener("change", event => {
      const target = event.target;
      if (!target || target.name !== "cartPaymentMethod") return;
      savePaymentMethod(target.value);
      syncPaymentMethodUi();
    });
  }

  cartPaymentModalOptions.forEach(option => {
    option.addEventListener("click", () => {
      const method = option.getAttribute("data-payment-method-modal-option");
      if (!method) return;
      startCheckoutWithMethod(method);
    });
  });

  cartPaymentModalCloseButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      resetPendingCheckout();
      closePaymentMethodModal();
    });
  });

  [headerCartEmailInputEl, cartEmailInputEl].forEach(inputEl => {
    if (!inputEl) return;
    if (!String(inputEl.getAttribute("placeholder") || "").trim()) {
      inputEl.setAttribute("placeholder", TEXT.emailPlaceholder);
    }
    inputEl.addEventListener("input", () => {
      const value = String(inputEl.value || "").trim().toLowerCase();
      if (isValidEmail(value)) {
        localStorage.setItem("checkout_email", value);
        if (headerCartEmailInputEl && headerCartEmailInputEl !== inputEl) headerCartEmailInputEl.value = value;
        if (cartEmailInputEl && cartEmailInputEl !== inputEl) cartEmailInputEl.value = value;
      }
    });
  });

  document.addEventListener("click", (e) => {
    if (!headerCartPanelEl || !headerCartEl) return;
    if (!headerCartPanelEl.contains(e.target) && !headerCartEl.contains(e.target)) {
      closeHeaderCartPanel();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closeHeaderCartPanel();
    resetPendingCheckout();
    closePaymentMethodModal();
    closeProductPreviewModal();
  });

  window.addEventListener("gptishka:cart-cleared", () => {
    clearPromoCodeState();
    renderCart();
    syncCards();
  });

  window.setInterval(() => {
    if (document.visibilityState === "hidden") return;
    if (!isPromoExpiredForUnpaidCart()) return;
    clearPromoCodeState();
    renderCart();
  }, 60 * 1000);

  window.addEventListener("hashchange", () => {
    alignToHashTarget("smooth");
  });

  window.gptishkaCart = {
    getQty,
    getCardQty,
    getCardItem,
    persistCartSelection,
  };
})();

// Telegram reviews prefetch removed by request.

// Persist selected product for the payment page (fallback if query params are lost).
document.addEventListener("click", e => {
  const a = e.target.closest && e.target.closest("a.buy-btn");
  if (!a) return;

  try {
    const url = new URL(a.getAttribute("href"), window.location.href);
    const product = a.getAttribute("data-product") || url.searchParams.get("product") || a.getAttribute("data-plan") || url.searchParams.get("plan");

    const payload = {
      product,
      title: a.getAttribute("data-title") || null,
      sub: a.getAttribute("data-sub") || null,
      term: a.getAttribute("data-term") || null,
      price: a.getAttribute("data-price") || null,
      currency: a.getAttribute("data-currency") || null,
      qty: 1,
      total_price: null,
    };

    // If attributes are missing, try extracting data from the pricing card markup.
    const card = a.closest && a.closest(".price-card");
    if (card) {
      if (!payload.title) {
        const h3 = card.querySelector("h3");
        if (h3) payload.title = (h3.innerText || "").replace(/\s+/g, " ").trim();
      }
      if (!payload.term) {
        const term = card.querySelector(".term");
        if (term) payload.term = (term.innerText || "").replace(/\s+/g, " ").trim();
      }
      if (!payload.sub) {
        const sub = card.querySelector(".sub");
        if (sub) payload.sub = (sub.innerText || "").replace(/\s+/g, " ").trim();
      }
      if (!payload.price) {
        const price = card.querySelector(".price");
        if (price) payload.price = (price.innerText || "").replace(/[^\d.,-]/g, "");
      }
      if (!payload.currency) {
        payload.currency = "RUB";
      }

      if (window.gptishkaCart && typeof window.gptishkaCart.getCardQty === "function") {
        const item = window.gptishkaCart.getCardItem(card);
        if (item && item.product) {
          const fromCard = window.gptishkaCart.getCardQty(item.product);
          payload.qty = fromCard > 0 ? fromCard : 1;
        }
      }
    }

    const numericPrice = toAmount(payload.price);
    if (Number.isFinite(numericPrice) && numericPrice > 0) {
      payload.total_price = String(Number((numericPrice * payload.qty).toFixed(2)));
    }

    if (product) localStorage.setItem("selected_product", JSON.stringify(payload));
  } catch (_) {
    // Non-critical: ignore storage/url parsing failures.
  }
}, true);

// Live ticker with masked activation events and split counters.
(() => {
  const API_STATS_URL = "/api/stats";
  const API_HEARTBEAT_URL = "/api/heartbeat";
  const STATS_REFRESH_MS = 15000;
  const HEARTBEAT_MS = 20000;
  const SESSION_KEY = "gptishka_session_id";

  const pathname = String(window.location.pathname || "/").toLowerCase();
  if (pathname.startsWith("/admin")) return;
  const isEnPage = pathname.startsWith("/en/");
  const numberLocale = isEnPage ? "en-US" : "ru-RU";
  const TEXT = isEnPage
    ? {
        totalLabel: "total activations",
        emptyTicker: "Activation feed is updating...",
      }
    : {
        totalLabel: "всего активаций",
        emptyTicker: "Лента активаций обновляется...",
      };

  let tickerTrack = null;
  let totalValueEl = null;
  let isInitialized = false;
  let heartbeatTimerId = 0;
  let statsTimerId = 0;

  function ensureSessionId() {
    try {
      const existing = localStorage.getItem(SESSION_KEY);
      if (existing) return existing;
      const generated =
        "s_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2, 10);
      localStorage.setItem(SESSION_KEY, generated);
      return generated;
    } catch (_) {
      return "s_" + Date.now().toString(36);
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function createTicker() {
    if (document.getElementById("siteTicker")) return;
    const header = document.querySelector("header");
    if (!header) return;

    const ticker = document.createElement("div");
    ticker.id = "siteTicker";
    ticker.className = "site-ticker";
    ticker.setAttribute("role", "status");
    ticker.setAttribute("aria-live", "polite");
    ticker.innerHTML = [
      '<div class="site-ticker__marquee">',
      '  <div class="site-ticker__track" id="siteTickerTrack"></div>',
      "</div>",
      '<div class="site-ticker__stats">',
      `  <span class="site-ticker__stat"><span class="site-ticker__stat-label">${escapeHtml(TEXT.totalLabel)}:</span> <strong id="siteTickerSales">0</strong></span>`,
      "</div>",
    ].join("");

    header.insertBefore(ticker, header.firstChild);

    tickerTrack = document.getElementById("siteTickerTrack");
    totalValueEl = document.getElementById("siteTickerSales");
  }

  function normalizeTickerEntries(stats) {
    if (Array.isArray(stats?.tickerEntries) && stats.tickerEntries.length) {
      return stats.tickerEntries
        .map(entry => {
          const email = String(entry?.email || "").trim();
          if (!email) return null;
          return email;
        })
        .filter(Boolean);
    }

    if (Array.isArray(stats?.lastBuyers) && stats.lastBuyers.length) {
      return stats.lastBuyers
        .map(email => String(email || "").trim())
        .filter(Boolean);
    }

    return [];
  }

  function renderTicker(entries) {
    if (!tickerTrack) return;

    const safeEntries = entries.length
      ? entries
      : [TEXT.emptyTicker];
    const baseItems = safeEntries.map(email => (
      `<span class="site-ticker__item">${escapeHtml(email)}</span>`
    ));

    const separator = '<span class="site-ticker__sep">•</span>';
    const joined = baseItems.join(separator);
    const repeated = new Array(4).fill(joined).join(separator);

    tickerTrack.innerHTML =
      '<div class="site-ticker__loop">' +
      repeated +
      "</div>" +
      '<div class="site-ticker__loop" aria-hidden="true">' +
      repeated +
      "</div>";
  }

  function formatNumber(value) {
    const num = Number(value || 0);
    if (!Number.isFinite(num)) return "0";
    return num.toLocaleString(numberLocale);
  }

  function renderCounters(stats) {
    const total = Number(stats?.sales || 0);
    if (totalValueEl) totalValueEl.textContent = formatNumber(total);
  }

  async function fetchAndRenderStats() {
    try {
      const response = await fetch(API_STATS_URL, { cache: "no-store" });
      if (!response.ok) return;
      const stats = await response.json();
      renderCounters(stats);
      renderTicker(normalizeTickerEntries(stats));
    } catch (_) {
      // Keep last successful values if API is unavailable.
    }
  }

  async function sendHeartbeat(sessionId) {
    try {
      await fetch(API_HEARTBEAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          path: window.location.pathname,
        }),
        keepalive: true,
      });
    } catch (_) {
      // Silent fallback when backend is not available.
    }
  }

  function stopTickerPolling() {
    if (heartbeatTimerId) {
      window.clearInterval(heartbeatTimerId);
      heartbeatTimerId = 0;
    }
    if (statsTimerId) {
      window.clearInterval(statsTimerId);
      statsTimerId = 0;
    }
  }

  function startTickerPolling(sessionId) {
    stopTickerPolling();
    heartbeatTimerId = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      sendHeartbeat(sessionId);
    }, HEARTBEAT_MS);
    statsTimerId = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      fetchAndRenderStats();
    }, STATS_REFRESH_MS);
  }

  function initLiveTicker() {
    if (isInitialized) return;
    isInitialized = true;

    createTicker();
    renderTicker([]);

    const sessionId = ensureSessionId();
    sendHeartbeat(sessionId);
    fetchAndRenderStats();
    startTickerPolling(sessionId);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      sendHeartbeat(sessionId);
      fetchAndRenderStats();
      startTickerPolling(sessionId);
    });
    window.addEventListener("beforeunload", stopTickerPolling, { once: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLiveTicker);
  } else {
    initLiveTicker();
  }
})();

