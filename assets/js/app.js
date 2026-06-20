// =========================
// PAGE TRANSITION - FIXED
// =========================

document.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.remove("is-leaving");
  const enteredWithTransition = initPageEnterTransition();
  runWhenIdle(() => {
    if (document.visibilityState === "hidden") return;
    initHomeGradientBackground();
  }, 1800);
  runWhenIdle(() => {
    if (document.visibilityState === "hidden") return;
    initPulseBeamButtons();
  }, 2200);
  initLinkPageTransitions();
  initProgressiveResourceWarmup();
  window.addEventListener("pageshow", () => {
    pageNavigationInProgress = false;
    document.documentElement.classList.remove("is-leaving");
    document.documentElement.classList.remove("is-entering");
    document.documentElement.classList.remove("is-entering-active");
  });

  const header = document.querySelector("header");
  if (header) {
    header.classList.add("is-nav-warmup");
    window.setTimeout(() => {
      header.classList.remove("is-nav-warmup");
    }, 700);

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        header.classList.toggle("is-scrolled", window.scrollY > 10);
        ticking = false;
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  initFaqAccordions();
  initLanguageSwitch();
  initActivationResumeShortcut();
  initReviewsSecurityBanner();
  initSoftProgressivePageReveal(enteredWithTransition);
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
  document.documentElement.classList.add("is-leaving");
  window.setTimeout(() => {
    window.location.href = href;
  }, delayMs);
}

function initPageEnterTransition() {
  const isTransitionNavigation = consumeTransitionNavigationIntent();
  if (!isTransitionNavigation) return false;
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
  return true;
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

function initSoftProgressivePageReveal(shouldRun) {
  if (!shouldRun) return;
  const page = document.querySelector("main.page");
  if (!page) return;
  if (page.dataset.softRevealInit === "1") return;
  page.dataset.softRevealInit = "1";

  const prefersReducedMotion = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
  if (prefersReducedMotion) return;

  const root = document.documentElement;
  const baseDelay = root.classList.contains("is-entering") ? 120 : 40;
  const sectionNodes = Array.from(page.children)
    .filter(node => node && node.nodeType === 1)
    .filter(node => !node.hasAttribute("data-no-soft-reveal"));

  if (!sectionNodes.length) return;

  sectionNodes.forEach((node, index) => {
    node.classList.add("soft-reveal-item");
    const cappedIndex = Math.min(index, 6);
    node.style.setProperty("--soft-reveal-delay", `${baseDelay + cappedIndex * 70}ms`);
  });

  const revealNow = node => {
    if (!node || node.classList.contains("is-soft-visible")) return;
    node.classList.add("is-soft-visible");
  };

  const foldLimit = Math.max(420, Math.round(window.innerHeight * 0.95));
  let immediateShown = 0;
  sectionNodes.forEach(node => {
    if (immediateShown >= 4) return;
    const rect = node.getBoundingClientRect();
    if (rect.top <= foldLimit) {
      revealNow(node);
      immediateShown += 1;
    }
  });

  if (!("IntersectionObserver" in window)) {
    sectionNodes.forEach((node, index) => {
      window.setTimeout(() => revealNow(node), baseDelay + index * 90);
    });
    return;
  }

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const node = entry.target;
        revealNow(node);
        observer.unobserve(node);
      });
    },
    {
      threshold: 0.12,
      rootMargin: "0px 0px -10% 0px",
    }
  );

  sectionNodes.forEach(node => {
    if (node.classList.contains("is-soft-visible")) return;
    observer.observe(node);
  });

  window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
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
    ? ["/en/", "/en/about.html", "/en/guarantee.html", "/en/contact.html", "/en/site-map.html"]
    : ["/", "/about.html", "/guarantee.html", "/contact.html", "/site-map.html"];
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
  const visualBudget = String(body.dataset.visualBudget || "").toLowerCase();

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
  // Keep heavy animated background only for explicitly rich devices.
  if (visualBudget !== "rich" || prefersReducedMotion || !hasFinePointer || isCompactViewport) {
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
  const visualBudget = String(root.dataset.visualBudget || "").toLowerCase();
  const prefersReducedMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
  const hasFinePointer = window.matchMedia
    ? window.matchMedia("(pointer: fine)").matches
    : true;
  const isDesktopViewport = window.matchMedia
    ? window.matchMedia("(min-width: 1025px)").matches
    : window.innerWidth >= 1025;
  if (visualBudget !== "rich" || prefersReducedMotion || !hasFinePointer || !isDesktopViewport) return;

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
  const cleanPath = path === "/" ? "/" : path;
  const isEnPath = cleanPath.startsWith("/en/");

  if (targetLang === "en") {
    if (isEnPath) return cleanPath === "/en/index.html" ? "/en/" : cleanPath;
    if (cleanPath === "/" || cleanPath === "/index.html") return "/en/";
    return `/en${cleanPath}`;
  }

  if (targetLang === "ru") {
    if (!isEnPath) return cleanPath === "/index.html" ? "/" : cleanPath;
    const ruPath = cleanPath.replace(/^\/en/, "");
    if (!ruPath || ruPath === "/index.html") return "/";
    return ruPath;
  }

  return cleanPath === "/index.html" ? "/" : cleanPath;
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
const ACTIVATION_RESUME_TTL_MS = 365 * 24 * 60 * 60 * 1000;

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
  try {
  const CART_KEY = "gptishka_cart_v1";
  const CART_SELECTION_KEY = "selected_cart";
  const pricingGridEl = document.getElementById("pricingGrid");
  const servicePageRootEl = document.querySelector("[data-service-page]");
  const servicePlansGridEl = document.getElementById("servicePlansGrid");
  const servicePlanFiltersEl = document.getElementById("servicePlanFilters");
  const serviceDeliveryFiltersEl = document.getElementById("serviceDeliveryFilters");
  const serviceDurationFiltersEl = document.getElementById("serviceDurationFilters");
  const serviceMinPriceEl = document.getElementById("serviceMinPrice");
  const servicePlansCountEl = document.getElementById("servicePlansCount");
  const serviceConstructorPriceEl = document.getElementById("serviceConstructorPrice");
  let servicePageItems = [];
  let dynamicServicePagePayload = null;
  const servicePageState = {
    plan: "all",
    delivery: "all",
    duration: "all",
  };
  const CHATGPT_ORDER_MODAL_PLAN_KEYS = new Set(["go", "plus", "pro-5x", "pro-20x"]);
  const CLAUDE_ORDER_MODAL_PLAN_KEYS = new Set(["pro", "claude"]);
  const GROK_ORDER_MODAL_PLAN_KEYS = new Set(["1m", "2m", "6m", "12m"]);
  const VPN_ORDER_MODAL_PLAN_KEYS = new Set(["1m", "2m", "6m", "12m"]);
  const AI_ORDER_MODAL_SERVICE_KEYS = new Set(["chatgpt", "claude", "grok", "vpn"]);
  const AI_ORDER_MODAL_SERVICE_CONFIG = {
    chatgpt: {
      displayName: "ChatGPT",
      fallbackTitle: "ChatGPT Go",
      fallbackPlan: "go",
      logo: "/assets/img/services/chatgpt-card.png",
    },
    claude: {
      displayName: "Claude",
      fallbackTitle: "Claude Pro",
      fallbackPlan: "pro",
      logo: "/assets/img/services/claude-card.png?v=20260618-claude-logo2",
    },
    grok: {
      displayName: "SuperGrok",
      fallbackTitle: "SuperGrok",
      fallbackPlan: "1m",
      logo: "/assets/img/services/grok-card.png?v=20260618-grok-logo4",
    },
    vpn: {
      displayName: "GPTishka VPN",
      fallbackTitle: "GPTishka VPN",
      fallbackPlan: "1m",
      logo: "/assets/img/services/vpn-card.png?v=20260620-vpn-card1",
    },
  };
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
  const checkoutLandingPath = isEnPage ? "/en/#pricing" : "/#pricing";
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
  const CHATGPT_GO_ORDER_KEY = "gptishka_chatgpt_go_order_v1";
  const CHATGPT_GO_ORDER_TTL_MS = 20 * 60 * 1000;
  const DEFAULT_PAYMENT_METHOD = "enot";
  const AVAILABLE_PAYMENT_METHODS = new Set(["enot", "lava"]);
  const PROMO_TTL_MS = 30 * 60 * 1000;
  const PRODUCTS_CACHE_TTL_MS = 15 * 1000;
  const PRODUCTS_FETCH_TIMEOUT_MS = 8000;
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
  let chatGptGoOrderCheckoutInProgress = false;
  let chatGptGoOrderModalEl = null;
  let chatGptGoOrderContentEl = null;
  let chatGptGoOrderLastFocusedElement = null;

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

    resetPaymentMethodModalUi();
  }

  function resetPaymentMethodModalUi() {
    cartPaymentModalOptions.forEach(option => {
      option.classList.remove("is-active");
      option.setAttribute("aria-pressed", "false");
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
    resetPaymentMethodModalUi();
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
    return formatAmount(amount) + "\u00A0" + symbol;
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
    cards = Array.from(document.querySelectorAll(".price-card[data-product], .product-showcase-card[data-product]"));
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
    const fromItem = String(itemDeliveryType || "").trim().toLowerCase();
    if (
      fromItem === "manual_login" ||
      fromItem === "manual-login" ||
      fromItem === "with_login" ||
      fromItem === "with-login" ||
      fromItem === "customer-login" ||
      fromItem === "customer_login" ||
      fromItem === "client-login" ||
      fromItem === "client_login"
    ) return "manual_login";

    if (Array.isArray(tags)) {
      const hasManualLoginTag = tags
        .map(tag => String(tag || "").trim().toLowerCase())
        .some(tag => tag === "delivery:manual_login" || tag === "delivery:manual-login");
      if (hasManualLoginTag) return "manual_login";
    }

    const methodRaw = String(itemDeliveryMethod || "").trim();
    if (methodRaw === "5") return "support";
    if (methodRaw === "4") return "support";
    if (methodRaw === "3") return "vpn";
    if (methodRaw === "2") return "credentials";
    if (methodRaw === "1") return "activation";

    if (
      fromItem === "support" ||
      fromItem === "support_claude" ||
      fromItem === "support-claude" ||
      fromItem === "manual_support" ||
      fromItem === "manual-support"
    ) return "support";
    if (fromItem === "vpn" || fromItem === "vless" || fromItem === "xray" || fromItem === "reality") return "vpn";
    if (fromItem === "credentials" || fromItem === "manual") return "credentials";
    if (fromItem === "activation" || fromItem === "token") return "activation";
    if (Array.isArray(tags)) {
      const fromTags = tags
        .map(tag => String(tag || "").trim().toLowerCase())
        .find(tag => tag.startsWith("delivery:"));
      if (fromTags) {
        const value = fromTags.split(":")[1] || "";
        if (
          value === "support" ||
          value === "support_claude" ||
          value === "support-claude" ||
          value === "manual_support" ||
          value === "manual-support"
        ) return "support";
        if (value === "vpn" || value === "vless" || value === "xray" || value === "reality") return "vpn";
        if (value === "credentials" || value === "manual") return "credentials";
      }
    }
    return "activation";
  }

  const CARD_TEXT_ALIGN_TAG_RE = /^align:(title|description|price|duration|features|meta):(left|center|right)$/i;

  function readCardTextAlignConfig(tags) {
    const result = {
      title: "left",
      description: "left",
      price: "left",
      duration: "left",
      features: "left",
      meta: "left",
    };
    if (!Array.isArray(tags)) return result;
    tags.forEach(tag => {
      const match = String(tag || "").trim().toLowerCase().match(CARD_TEXT_ALIGN_TAG_RE);
      if (!match) return;
      const block = match[1];
      const align = match[2];
      if (align === "center" || align === "right" || align === "left") {
        result[block] = align;
      }
    });
    return result;
  }

  function isTechnicalProductTag(tag) {
    const normalized = String(tag || "").trim().toLowerCase();
    if (!normalized) return true;
    return (
      normalized.startsWith("badge:") ||
      normalized.startsWith("delivery:") ||
      normalized.startsWith("bundle:") ||
      normalized.startsWith("vpn:") ||
      normalized.startsWith("vpn_users:") ||
      normalized.startsWith("vpn-users:") ||
      normalized.startsWith("users:") ||
      normalized.startsWith("align:")
    );
  }

  function parseDescriptionLines(description) {
    return String(description || "")
      .split(/\r?\n/)
      .map(v => v.trim())
      .filter(Boolean);
  }

  function normalizeDescriptionRaw(description) {
    return String(description || "").replace(/\r/g, "").trim();
  }

  function parseDescriptionModel(description) {
    const rawText = normalizeDescriptionRaw(description);
    const lines = parseDescriptionLines(rawText);
    const visibleLines = [];
    const mediaItems = [];
    let lastMediaIndex = -1;

    lines.forEach(line => {
      const mediaMatch = line.match(/^media\s*:\s*(image|video)\s*:\s*(.+)$/i);
      if (mediaMatch) {
        const mediaType = String(mediaMatch[1] || "").trim().toLowerCase();
        const mediaUrl = String(mediaMatch[2] || "").trim();
        if (mediaUrl) {
          mediaItems.push({
            type: mediaType === "video" ? "video" : "image",
            url: mediaUrl,
            caption: "",
          });
          lastMediaIndex = mediaItems.length - 1;
        }
        return;
      }

      const captionMatch = line.match(/^media-caption\s*:\s*(.+)$/i);
      if (captionMatch) {
        const caption = String(captionMatch[1] || "").trim();
        if (caption && lastMediaIndex >= 0 && mediaItems[lastMediaIndex]) {
          mediaItems[lastMediaIndex].caption = caption;
        }
        return;
      }

      visibleLines.push(line);
    });

    return {
      lines: visibleLines,
      media: mediaItems,
      plainText: visibleLines.join("\n"),
      rawText,
    };
  }

  function sanitizePreviewMediaUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";

    try {
      const parsed = new URL(raw, window.location.origin);
      const protocol = String(parsed.protocol || "").toLowerCase();
      if (protocol !== "http:" && protocol !== "https:") return "";
      return parsed.toString();
    } catch (_) {
      return "";
    }
  }

  function toYouTubeEmbedUrl(url) {
    const raw = sanitizePreviewMediaUrl(url);
    if (!raw) return "";

    try {
      const parsed = new URL(raw);
      const host = String(parsed.hostname || "").toLowerCase().replace(/^www\./, "");
      let videoId = "";
      if (host === "youtu.be") {
        videoId = parsed.pathname.replace(/^\/+/, "").split("/")[0] || "";
      } else if (host === "youtube.com" || host === "m.youtube.com") {
        if (parsed.pathname === "/watch") {
          videoId = parsed.searchParams.get("v") || "";
        } else if (parsed.pathname.startsWith("/shorts/")) {
          videoId = parsed.pathname.split("/")[2] || "";
        } else if (parsed.pathname.startsWith("/embed/")) {
          videoId = parsed.pathname.split("/")[2] || "";
        }
      }
      if (!/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) return "";
      return "https://www.youtube.com/embed/" + videoId;
    } catch (_) {
      return "";
    }
  }

  function buildPreviewMediaMarkup(mediaItems) {
    if (!Array.isArray(mediaItems) || !mediaItems.length) return "";

    return mediaItems
      .map(item => {
        const type = String(item?.type || "").toLowerCase() === "video" ? "video" : "image";
        const url = sanitizePreviewMediaUrl(item?.url);
        if (!url) return "";
        const caption = String(item?.caption || "").trim();
        const captionMarkup = caption ? '<p class="product-preview-modal__media-caption">' + escapeHtml(caption) + "</p>" : "";

        if (type === "image") {
          return (
            '<figure class="product-preview-modal__media">' +
            '<img src="' + escapeHtml(url) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />' +
            captionMarkup +
            "</figure>"
          );
        }

        const embedUrl = toYouTubeEmbedUrl(url);
        if (embedUrl) {
          return (
            '<figure class="product-preview-modal__media">' +
            '<div class="product-preview-modal__video-frame">' +
            '<iframe src="' + escapeHtml(embedUrl) + '" title="Video preview" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>' +
            "</div>" +
            captionMarkup +
            "</figure>"
          );
        }

        return (
          '<figure class="product-preview-modal__media">' +
          '<video controls playsinline preload="metadata" src="' + escapeHtml(url) + '"></video>' +
          captionMarkup +
          "</figure>"
        );
      })
      .filter(Boolean)
      .join("");
  }

  function buildPreviewDescriptionMarkup(modelOrLines, className = "product-preview-modal__list") {
    const model =
      modelOrLines && typeof modelOrLines === "object" && !Array.isArray(modelOrLines)
        ? modelOrLines
        : { lines: Array.isArray(modelOrLines) ? modelOrLines : [], media: [] };
    const safeLines = Array.isArray(model.lines) ? model.lines.filter(Boolean) : [];
    const mediaMarkup = buildPreviewMediaMarkup(model.media);

    if (!safeLines.length && !mediaMarkup) {
      return '<p class="product-preview-modal__empty">' + escapeHtml(TEXT.previewNoDetails) + "</p>";
    }

    const listMarkup = safeLines.length
      ? '<ul class="' + escapeHtml(className) + '">' + safeLines.map(line => '<li>' + escapeHtml(line) + "</li>").join("") + "</ul>"
      : "";

    return listMarkup + mediaMarkup;
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
          activationVariant: String(previewItem.activationVariant || "").trim() || undefined,
          deliveryMethod: String(form.getAttribute("data-delivery-key") || "").trim(),
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
    const previewTitle = String(item.title || item.product || TEXT.previewTitle).replace(/\s+/g, " ").trim();
    const previewBadgeType = resolveBadge(item.badge, []);
    const previewBadgeLabelByType = {
      best: TEXT.badgeBest,
      new: TEXT.badgeNew,
      hit: TEXT.badgeHit,
      sale: TEXT.badgeSale,
      popular: TEXT.badgePopular,
      limited: TEXT.badgeLimited,
      gift: TEXT.badgeGift,
      pro: TEXT.badgePro,
    };
    const previewBadgeMarkup = previewBadgeType
      ? '<span class="product-preview-modal__term product-preview-modal__term--badge ' + escapeHtml(previewBadgeType) + '">' + escapeHtml(previewBadgeLabelByType[previewBadgeType] || TEXT.badgeBest) + "</span>"
      : "";

    productPreviewContentEl.innerHTML = [
      '<div class="product-preview-modal__head">',
      previewBadgeMarkup,
      '<h3 class="product-preview-modal__title" id="productPreviewModalTitle">' + escapeHtml(previewTitle) + "</h3>",
      '<div class="product-preview-modal__price" id="productPreviewPrice">' + escapeHtml(formatPriceByCurrency(item.price, item.currency)) + "</div>",
      "</div>",
      '<section class="product-preview-modal__description">',
      buildPreviewDescriptionMarkup(modalDescriptionModel, "product-preview-modal__description-list"),
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
      modalDescription: modalDescriptionModel.rawText || modalDescriptionModel.plainText,
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

  function normalizeProductDurationLabel(value) {
    const raw = String(value || "").replace(/\s+/g, " ").trim();
    if (!raw) return "";
    return raw.replace(/^[^:]{1,24}\s*:\s*/u, "").trim();
  }

  function isDurationLikeLine(value) {
    const raw = String(value || "").replace(/\s+/g, " ").trim();
    if (!raw) return false;
    const safe = normalizeProductDurationLabel(raw).toLowerCase();
    return /^(?:\d+\s*)(?:month|months|mo|yr|yrs|year|years|месяц|месяца|месяцев|мес\.?|год|года|лет|г\.)$/iu.test(safe);
  }

  function splitProductTitleParts(title, durationFallback) {
    const rawTitle = String(title || "").replace(/\r/g, "").trim();
    const fallbackDuration = normalizeProductDurationLabel(durationFallback);
    const titleLines = rawTitle
      .split("\n")
      .map((line) => String(line || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);

    if (!titleLines.length) {
      return { mainLines: [], period: fallbackDuration };
    }

    let period = "";
    let mainLines = titleLines.slice();

    if (titleLines.length > 1 && isDurationLikeLine(titleLines[titleLines.length - 1])) {
      period = normalizeProductDurationLabel(titleLines[titleLines.length - 1]);
      mainLines = titleLines.slice(0, -1);
    } else if (titleLines.length === 1) {
      const single = titleLines[0];
      const trailingDurationMatch = single.match(/(\d+\s*(?:month|months|mo|yr|yrs|year|years|месяц|месяца|месяцев|мес\.?|год|года|лет|г\.))\s*$/iu);
      if (trailingDurationMatch && trailingDurationMatch.index !== undefined) {
        const head = single.slice(0, trailingDurationMatch.index).replace(/[–—\-,:/|]+$/u, "").trim();
        period = normalizeProductDurationLabel(trailingDurationMatch[1]);
        mainLines = head ? [head] : [single];
      }
    }

    if (!mainLines.length) {
      mainLines = titleLines.slice(0, 1);
    }

    return {
      mainLines,
      period: period || fallbackDuration,
    };
  }

  function buildProductTitleChunks(mainLine) {
    const normalized = String(mainLine || "").replace(/\s+/g, " ").trim();
    if (!normalized) return [];

    const plusParts = normalized
      .split(/\s*\+\s*/u)
      .map(part => String(part || "").trim())
      .filter(Boolean);

    if (plusParts.length <= 1) return [normalized];
    return plusParts.map((part, index) => (index === 0 ? part : `+ ${part}`));
  }

  function normalizeProductTitleMainLine(mainLine) {
    return String(mainLine || "")
      .replace(/\s+/g, " ")
      .replace(/\s*[-\u2013\u2014]+\s*$/u, "")
      .trim();
  }

  function resolveProductTitleScaleClass(maxLength, maxChunksPerLine, lineCount) {
    // Keep combined product names (e.g. "ChatGPT Plus + VPN") comfortably inside the card
    // so left/center/right alignment remains visually distinct.
    if (maxLength >= 36 || maxChunksPerLine >= 5) return "is-x-tight";
    if (maxLength >= 28 || maxChunksPerLine >= 4 || lineCount >= 3) return "is-tight";
    if (maxLength >= 18 || maxChunksPerLine >= 2) return "is-compact";
    return "is-normal";
  }

  function buildProductTitleDisplay(title, durationFallback) {
    const parts = splitProductTitleParts(title, durationFallback);
    const lines = parts.mainLines
      .map((line) => {
        const normalizedLine = normalizeProductTitleMainLine(line);
        const chunks = buildProductTitleChunks(normalizedLine);
        const text = chunks.length ? chunks.join(" ") : normalizedLine;
        return {
          text,
          chunks: chunks.length ? chunks : [text],
        };
      })
      .filter(line => Boolean(line.text));
    const fallbackTitleText = String(title || "").replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
    const safeLines = lines.length ? lines : [{ text: fallbackTitleText, chunks: [fallbackTitleText] }];
    const maxLength = safeLines.reduce((max, line) => Math.max(max, line.text.length), 0);
    const maxChunksPerLine = safeLines.reduce((max, line) => Math.max(max, line.chunks.length), 0);
    const safePeriod = String(parts.period || "").trim();

    return {
      lines: safeLines,
      period: safePeriod,
      scaleClass: resolveProductTitleScaleClass(maxLength, maxChunksPerLine, safeLines.length),
      ariaLabel: [...safeLines.map(line => line.text), safePeriod].filter(Boolean).join(" "),
    };
  }

  function getVisualConfig(item) {
    const visual = item && typeof item.visual === "object" ? item.visual : {};
    const fallbackTheme = getFallbackVisualTheme(item);
    return {
      cardTitle: String(visual.cardTitle || item?.title || item?.product || "").trim(),
      cardDescription: String(visual.cardDescription || item?.description || "").trim(),
      imageUrl: String(visual.imageUrl || "").trim(),
      imageAlt: String(visual.imageAlt || visual.cardTitle || item?.title || "").trim(),
      hoverImageUrl: String(visual.hoverImageUrl || "").trim(),
      hoverImageAlt: String(visual.hoverImageAlt || visual.cardTitle || item?.title || "").trim(),
      backgroundType: String(visual.backgroundType || fallbackTheme.backgroundType || "solid").trim().toLowerCase(),
      backgroundColor: String(visual.backgroundColor || fallbackTheme.backgroundColor || "#111111").trim(),
      backgroundGradient: String(visual.backgroundGradient || fallbackTheme.backgroundGradient || "").trim(),
      buttonText: String(visual.buttonText || TEXT.payNow).trim(),
      buttonStyle: String(visual.buttonStyle || "primary").trim(),
      isVisible: visual.isVisible !== false,
    };
  }

  function getShowcaseInitials(title) {
    const words = String(title || "")
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .split(/\s+/)
      .map(word => word.trim())
      .filter(Boolean);
    if (!words.length) return "AI";
    return words.slice(0, 2).map(word => word[0] || "").join("").toUpperCase();
  }

  function getShowcaseCardBackground(visual) {
    if (visual.backgroundType === "gradient" && visual.backgroundGradient) return visual.backgroundGradient;
    if (visual.backgroundType === "image" && visual.imageUrl) {
      return "linear-gradient(180deg, rgba(0,0,0,.10), rgba(0,0,0,.62)), url('" + visual.imageUrl.replace(/'/g, "%27") + "') center/cover";
    }
    return visual.backgroundColor || "#111111";
  }

  function truncateShowcaseText(value, maxLength) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text || text.length <= maxLength) return text;
    return text.slice(0, Math.max(0, maxLength - 1)).trim() + "…";
  }

  function buildShowcaseProductCard(item, index) {
    const product = String(item.product || item.slug || item.id || "product_" + index).trim();
    const productId = String(item.id || "").trim();
    const rawTitle = String(item.title || product || "Product").trim();
    const visual = getVisualConfig(item);
    if (!visual.isVisible) return "";

    const title = visual.cardTitle || rawTitle;
    const description = truncateShowcaseText(visual.cardDescription || item.description || "", 110);
    const modalDescriptionRaw = String(item.modalDescription || item.description || visual.cardDescription || "").trim();
    const category = String(item.category || "").trim();
    const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];
    const displayTags = tags.filter(tag => !isTechnicalProductTag(tag));
    const term = category || (displayTags[0] ? displayTags[0].toUpperCase() : "DIGITAL");
    const sub = description || String(item.description || "").slice(0, 90);
    const price = Math.max(0, toAmount(item.price));
    const currency = String(item.currency || "RUB").toUpperCase();
    const deliveryType = resolveDeliveryType(item.deliveryType, item.deliveryMethod, tags);
    const badgeType = resolveBadge(item.badge, tags);
    const background = getShowcaseCardBackground(visual);
    const primaryImageUrl = visual.imageUrl || visual.hoverImageUrl;
    const hasHoverImage = Boolean(visual.imageUrl && visual.hoverImageUrl);
    const imageMarkup = primaryImageUrl
      ? '<img class="product-showcase-card__image product-showcase-card__image--primary" src="' + escapeHtml(primaryImageUrl) + '" alt="' + escapeHtml(visual.imageAlt || title) + '" loading="lazy" decoding="async">' +
        (hasHoverImage ? '<img class="product-showcase-card__image product-showcase-card__image--hover" src="' + escapeHtml(visual.hoverImageUrl) + '" alt="' + escapeHtml(visual.hoverImageAlt || visual.imageAlt || title) + '" loading="lazy" decoding="async">' : "")
      : '<div class="product-showcase-card__image-placeholder">' + escapeHtml(getShowcaseInitials(title)) + "</div>";
    const badge = badgeType ? '<span class="product-showcase-card__badge">' + escapeHtml(badgeType) + "</span>" : "";

    return (
      '<article class="product-showcase-card" style="--showcase-card-bg:' + escapeHtml(background) + '"' +
      ' data-product="' + escapeHtml(product) + '"' +
      ' data-product-id="' + escapeHtml(productId) + '"' +
      ' data-title="' + escapeHtml(rawTitle) + '"' +
      ' data-sub="' + escapeHtml(sub) + '"' +
      ' data-term="' + escapeHtml(term) + '"' +
      ' data-description="' + escapeHtml(item.description || visual.cardDescription || "") + '"' +
      ' data-modal-description="' + escapeHtml(encodeURIComponent(modalDescriptionRaw)) + '"' +
      ' data-price="' + escapeHtml(price) + '"' +
      ' data-currency="' + escapeHtml(currency) + '"' +
      ' data-delivery-type="' + escapeHtml(deliveryType) + '"' +
      ' data-activation-variant="' + escapeHtml(item.activationVariant || "") + '"' +
      ' data-badge="' + escapeHtml(badgeType || "") + '">' +
        '<div class="product-showcase-card__imageWrap' + (hasHoverImage ? " has-hover" : "") + '">' + imageMarkup + badge + "</div>" +
        '<div class="product-showcase-card__body">' +
          '<h3 class="product-showcase-card__title">' + escapeHtml(title) + "</h3>" +
          '<p class="product-showcase-card__description sub">' + escapeHtml(description) + "</p>" +
          '<div class="product-showcase-card__price price">' + escapeHtml((isEnPage ? "from " : "от ") + formatPriceByCurrency(price, currency)) + "</div>" +
          '<button type="button" class="product-showcase-card__button pay-now-btn" data-product="' + escapeHtml(product) + '" data-sub="' + escapeHtml(sub) + '" data-title="' + escapeHtml(rawTitle) + '" data-term="' + escapeHtml(term) + '" data-price="' + escapeHtml(price) + '" data-currency="' + escapeHtml(currency) + '">' + escapeHtml(visual.buttonText || TEXT.payNow) + "</button>" +
        "</div>" +
      "</article>"
    );
  }

  function buildProductCard(item, index) {
    const product = String(item.product || item.id || "product_" + index).trim();
    const title = String(item.title || "Product").trim();
      const description = String(item.description || "").trim();
      const descriptionModel = parseDescriptionModel(description);
      const modalDescriptionRaw = String(item.modalDescription || descriptionModel.plainText).trim();
      const modalDescriptionModel = parseDescriptionModel(modalDescriptionRaw);
      const descriptionLines = descriptionModel.lines;
    const durationLineRegex = /^(срок|duration)\s*:/i;
    const durationLine = descriptionLines.find(line => durationLineRegex.test(line)) || "";
    const titleDisplay = buildProductTitleDisplay(title, durationLine);
    const category = String(item.category || "").trim();
    const normalizedCategoryLabel = normalizeProductCategoryLabel(category).toLowerCase();
    const isChatgptSubscriptionsCategory =
      normalizedCategoryLabel.includes("подпис") || normalizedCategoryLabel.includes("subscription");
    const titleLinesMarkup = titleDisplay.lines
      .map((line) => (
        '<span class="price-card__title-mainline">' +
        '<span class="price-card__title-main ' + titleDisplay.scaleClass + '">' +
        escapeHtml(line.text) +
        "</span>" +
        "</span>"
      ))
      .join("");
    const titlePeriodMarkup = titleDisplay.period && !isChatgptSubscriptionsCategory
      ? '<span class="price-card__title-period">' + escapeHtml(titleDisplay.period) + "</span>"
      : "";
    const titleMarkup =
      '<h3 class="price-card__title" aria-label="' + escapeHtml(titleDisplay.ariaLabel || title) + '">' +
      titleLinesMarkup +
      titlePeriodMarkup +
      "</h3>";
    const nonDurationLines = descriptionLines.filter(line => !durationLineRegex.test(line));
    const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];
    const cardTextAlign = readCardTextAlignConfig(tags);
    const displayTags = tags.filter(tag => !isTechnicalProductTag(tag));
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
      '<div class="price-card' + (badgeType === "best" ? " featured" : "") + (isChatgptSubscriptionsCategory ? " price-card--subscriptions" : "") + '"' +
      ' data-product="' + escapeHtml(product) + '"' +
      ' data-product-id="' + escapeHtml(String(item.id || "")) + '"' +
      ' data-title="' + escapeHtml(title) + '"' +
      ' data-sub="' + escapeHtml(sub) + '"' +
      ' data-term="' + escapeHtml(term) + '"' +
      ' data-description="' + escapeHtml(descriptionModel.plainText) + '"' +
      ' data-modal-description="' + escapeHtml(encodeURIComponent(modalDescriptionRaw)) + '"' +
      ' data-price="' + escapeHtml(price) + '"' +
      ' data-currency="' + escapeHtml(currency) + '"' +
      ' data-delivery-type="' + escapeHtml(deliveryType) + '"' +
      ' data-activation-variant="' + escapeHtml(item.activationVariant || "") + '"' +
      ' data-badge="' + escapeHtml(badgeType || "") + '"' +
      ' data-align-title="' + escapeHtml(cardTextAlign.title) + '"' +
      ' data-align-description="' + escapeHtml(cardTextAlign.description) + '"' +
      ' data-align-price="' + escapeHtml(cardTextAlign.price) + '"' +
      ' data-align-duration="' + escapeHtml(cardTextAlign.duration) + '"' +
      ' data-align-features="' + escapeHtml(cardTextAlign.features) + '"' +
      ' data-align-meta="' + escapeHtml(cardTextAlign.meta) + '">' +
      badge +
      titleMarkup +
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PRODUCTS_FETCH_TIMEOUT_MS);
    const lang = isEnPage ? "en" : "ru";

    async function fetchJson(url, options = {}) {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error("Products API not available");
      return response.json();
    }

    function normalizePayload(payload) {
      const source = payload && typeof payload === "object" ? payload : {};
      if (Array.isArray(source.sections)) {
        const byId = new Map();
        const sections = source.sections
          .map(section => {
            const products = (Array.isArray(section?.products) ? section.products : [])
              .filter(item => getVisualConfig(item).isVisible);
            products.forEach(item => {
              const id = String(item?.id || item?.product || item?.slug || "").trim();
              const variant = String(item?.activationVariant || "").trim();
              const key = variant ? `${id}:${variant}` : id;
              if (key && !byId.has(key)) byId.set(key, item);
            });
            return { ...section, products };
          })
          .filter(section => Array.isArray(section.products) && section.products.length);
        return { ...source, sections, items: Array.from(byId.values()) };
      }
      const sourceItems = Array.isArray(source.items)
        ? source.items
        : (Array.isArray(source.products) ? source.products : []);
      const items = sourceItems.filter(item => getVisualConfig(item).isVisible);
      return { ...source, items };
    }

    productsPayloadPendingPromise = fetchJson("/api/public/showcase?lang=" + lang + "&target=homepage", {
        cache: "no-store",
        signal: controller.signal,
      })
      .catch(() => fetchJson("/api/public/products?lang=" + lang, { cache: "no-store" }))
      .then(payload => {
        const normalizedPayload = normalizePayload(payload);
        productsPayloadCache = normalizedPayload;
        productsPayloadCacheTs = Date.now();
        return normalizedPayload;
      })
      .finally(() => {
        clearTimeout(timeoutId);
        productsPayloadPendingPromise = null;
      });

    return productsPayloadPendingPromise;
  }

  function normalizeProductCategoryLabel(value) {
    const raw = String(value || "").trim();
    const fallback = isEnPage ? "ChatGPT Subscriptions" : "Подписки ChatGPT";
    if (!raw) return fallback;

    const normalized = raw.toLowerCase();
    const isAiCategory =
      normalized === "ai" ||
      normalized === "ai subscriptions" ||
      normalized === "подписки ии" ||
      normalized === "нейросети" ||
      normalized.includes("нейросет");
    const isSubscriptionsCategory =
      normalized === "subscriptions" ||
      normalized === "subscription" ||
      normalized === "подписки" ||
      normalized === "подписка" ||
      normalized === "chatgpt subscriptions" ||
      normalized === "подписки chatgpt";

    if (isAiCategory) return isEnPage ? "AI Subscriptions" : "Нейросети";
    return isSubscriptionsCategory ? fallback : raw;
  }

  function categorySortScore(categoryLabel) {
    const normalized = String(categoryLabel || "").trim().toLowerCase();
    if (!normalized) return 1;
    if (normalized.includes("нейросет") || normalized.includes("ai")) return 0;
    if (normalized.includes("подпис")) return 0;
    if (normalized.includes("subscription")) return 0;
    if (normalized.includes("vpn")) return 2;
    return 1;
  }

  function getProductSearchText(item) {
    const tags = Array.isArray(item?.tags) ? item.tags.join(" ") : "";
    return [
      item?.product,
      item?.slug,
      item?.title,
      item?.category,
      tags,
    ]
      .map(value => String(value || "").trim().toLowerCase())
      .filter(Boolean)
      .join(" ");
  }

  function getNormalizedProductTags(item) {
    return Array.isArray(item?.tags)
      ? item.tags.map(tag => String(tag || "").trim().toLowerCase()).filter(Boolean)
      : [];
  }

  function isStandaloneVpnProduct(item) {
    const tags = getNormalizedProductTags(item);
    const deliveryType = resolveDeliveryType(item?.deliveryType, item?.deliveryMethod, tags);
    if (deliveryType === "vpn") return true;
    if (tags.includes("delivery:vpn")) return true;

    const productKeys = [item?.product, item?.slug]
      .map(value => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    if (productKeys.some(value => /^(gptishka[-_]?vpn|vpn|vless|xray|reality)([-_]|$)/.test(value))) return true;

    const category = String(item?.category || "").trim().toLowerCase();
    return category === "vpn" || category === "vless" || category.includes("vpn-");
  }

  function getFallbackVisualTheme(item) {
    const text = getProductSearchText(item);
    if (text.includes("chatgpt") || text.includes("openai")) {
      if (text.includes("pro")) {
        return {
          backgroundType: "gradient",
          backgroundColor: "#111827",
          backgroundGradient: "linear-gradient(135deg, #0f172a 0%, #312e81 54%, #7c3aed 100%)",
        };
      }
      if (text.includes("go")) {
        return {
          backgroundType: "gradient",
          backgroundColor: "#064e3b",
          backgroundGradient: "linear-gradient(135deg, #172554 0%, #047857 52%, #22c55e 100%)",
        };
      }
      return {
        backgroundType: "gradient",
        backgroundColor: "#052e16",
        backgroundGradient: "linear-gradient(135deg, #111827 0%, #065f46 54%, #16a34a 100%)",
      };
    }
    if (text.includes("supergrok") || text.includes("grok")) {
      return {
        backgroundType: "gradient",
        backgroundColor: "#0f172a",
        backgroundGradient: "linear-gradient(135deg, #020617 0%, #1e3a8a 52%, #2563eb 100%)",
      };
    }
    if (text.includes("claude")) {
      return {
        backgroundType: "gradient",
        backgroundColor: "#3b2418",
        backgroundGradient: "linear-gradient(135deg, #1c1917 0%, #92400e 54%, #f97316 100%)",
      };
    }
    if (text.includes("vpn")) {
      return {
        backgroundType: "gradient",
        backgroundColor: "#06142f",
        backgroundGradient: "linear-gradient(135deg, #020617 0%, #0b2a5f 52%, #1d4ed8 100%)",
      };
    }
    return {
      backgroundType: "gradient",
      backgroundColor: "#111827",
      backgroundGradient: "linear-gradient(135deg, #111827 0%, #334155 100%)",
    };
  }

  function getAiServiceConfig(item) {
    const text = getProductSearchText(item);
    if (!text) return null;
    if (text.includes("chatgpt") || text.includes("openai")) {
      return {
        key: "chatgpt",
        name: "ChatGPT",
        icon: "GPT",
        description: isEnPage
          ? "Plus, GO and Pro plans for work, study and everyday tasks."
          : "Тарифы Plus, GO и Pro для работы, учебы и любых задач.",
        theme: "chatgpt",
        sort: 10,
      };
    }
    if (text.includes("claude")) {
      return {
        key: "claude",
        name: "Claude",
        icon: "CL",
        description: isEnPage
          ? "Claude Pro activation for text, analysis and code."
          : "Claude Pro для текста, анализа и кода.",
        theme: "claude",
        sort: 20,
      };
    }
    if (text.includes("supergrok") || text.includes("grok")) {
      return {
        key: "grok",
        name: "SuperGrok",
        icon: "GX",
        description: isEnPage
          ? "SuperGrok plans with fast activation on your account."
          : "Тарифы SuperGrok с быстрой активацией на ваш аккаунт.",
        theme: "grok",
        sort: 30,
      };
    }
    if (isStandaloneVpnProduct(item)) {
      return {
        key: "vpn",
        name: "GPTishka VPN",
        icon: "VPN",
        description: isEnPage
          ? "VLESS Reality VPN access with automatic key delivery after payment."
          : "VPN-доступ VLESS Reality с автоматической выдачей ключа после оплаты.",
        theme: "vpn",
        sort: 40,
      };
    }
    return null;
  }

  function getAiPlanSortScore(item, serviceKey) {
    const text = getProductSearchText(item);
    if (serviceKey === "chatgpt") {
      if (text.includes("go")) return 10;
      if (text.includes("plus")) return 20;
      if (text.includes("pro-5x") || text.includes("pro 5x") || text.includes("5x")) return 30;
      if (text.includes("pro-20x") || text.includes("pro 20x") || text.includes("20x")) return 40;
      if (text.includes("pro")) return 50;
    }
    if (serviceKey === "grok") {
      if (text.includes("1-month") || text.includes("1 month") || text.includes("1 мес")) return 10;
      if (text.includes("2-month") || text.includes("2 month") || text.includes("2 мес")) return 20;
    }
    if (serviceKey === "vpn") {
      return getServiceDurationSortScore(getServiceDurationKey(item));
    }
    return Math.max(0, toAmount(item?.price));
  }

  function sortAiServiceProducts(serviceKey, items) {
    return (Array.isArray(items) ? items.slice() : []).sort((a, b) => {
      const scoreDiff = getAiPlanSortScore(a, serviceKey) - getAiPlanSortScore(b, serviceKey);
      if (scoreDiff !== 0) return scoreDiff;
      return String(a?.title || "").localeCompare(String(b?.title || ""), isEnPage ? "en" : "ru");
    });
  }

  function getFallbackShowcaseSortScore(item) {
    const text = getProductSearchText(item);
    if (text.includes("chatgpt") || text.includes("openai")) {
      return 100 + getAiPlanSortScore(item, "chatgpt");
    }
    if (text.includes("supergrok") || text.includes("grok")) {
      return 200 + getAiPlanSortScore(item, "grok");
    }
    if (text.includes("claude")) {
      return 300 + (text.includes("pro") ? 10 : 20);
    }
    if (text.includes("vpn")) {
      if (text.includes("1 месяц") || text.includes("1 month") || text.includes("30")) return 500;
      if (text.includes("6 месяцев") || text.includes("6 month") || text.includes("180")) return 510;
      if (text.includes("12 месяцев") || text.includes("12 month") || text.includes("365")) return 520;
      return 550;
    }
    return 900 + Math.max(0, toAmount(item?.price));
  }

  function sortFallbackShowcaseProducts(items) {
    return (Array.isArray(items) ? items.slice() : []).sort((a, b) => {
      const scoreDiff = getFallbackShowcaseSortScore(a) - getFallbackShowcaseSortScore(b);
      if (scoreDiff !== 0) return scoreDiff;
      return String(a?.title || "").localeCompare(String(b?.title || ""), isEnPage ? "en" : "ru");
    });
  }

  function getAiServiceGroups(items) {
    const map = new Map();
    (Array.isArray(items) ? items : []).forEach((item) => {
      const service = getAiServiceConfig(item);
      if (!service) return;
      if (!map.has(service.key)) map.set(service.key, { service, items: [] });
      map.get(service.key).items.push(item);
    });
    return Array.from(map.values())
      .map(group => ({
        ...group,
        items: sortAiServiceProducts(group.service.key, group.items),
      }))
      .sort((a, b) => a.service.sort - b.service.sort);
  }

  function normalizeAiServiceKey(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return "";
    if (normalized === "supergrok" || normalized === "grok" || normalized === "xai") return "grok";
    if (normalized === "vpn" || normalized === "vless" || normalized === "xray" || normalized === "reality" || normalized.includes("gptishka vpn")) return "vpn";
    if (normalized.includes("chatgpt") || normalized.includes("openai")) return "chatgpt";
    if (normalized.includes("claude")) return "claude";
    if (normalized.includes("grok")) return "grok";
    if (normalized.includes("vpn") || normalized.includes("vless")) return "vpn";
    return normalized;
  }

  function getServicePageKey() {
    if (!servicePageRootEl) return "";
    const explicitKey = normalizeAiServiceKey(servicePageRootEl.getAttribute("data-service-page"));
    if (explicitKey) return explicitKey;
    return normalizeAiServiceKey(String(location.pathname || "").replace(/^\/+|\/+$/g, ""));
  }

  function isServiceConstructorPage() {
    return Boolean(servicePageRootEl && String(servicePageRootEl.getAttribute("data-service-layout") || "").trim() === "constructor");
  }

  async function fetchServicePageConfig(serviceKey) {
    const key = String(serviceKey || "").trim() || String(location.pathname || "").replace(/^\/+|\/+$/g, "");
    if (!key) return null;
    try {
      const response = await fetch("/api/public/service-pages/" + encodeURIComponent(key) + "?lang=" + lang, { cache: "no-store" });
      if (!response.ok) return null;
      return await response.json();
    } catch (_) {
      return null;
    }
  }

  function getServicePagePath(serviceKey) {
    const key = normalizeAiServiceKey(serviceKey);
    if (key === "chatgpt") return "/chatgpt";
    if (key === "claude") return "/claude";
    if (key === "grok") return "/supergrok";
    if (key === "vpn") return "/store/vpn";
    return isEnPage ? "/en/#pricing" : "/#pricing";
  }

  function applyServicePageTheme(payload) {
    if (!servicePageRootEl || !payload || !payload.theme) return;
    const theme = payload.theme;
    servicePageRootEl.dataset.serviceTheme = String(theme.theme || "custom");
    servicePageRootEl.style.setProperty("--service-accent", String(theme.accentColor || "#35f28f"));
    servicePageRootEl.style.setProperty(
      "--service-accent-gradient",
      String(theme.accentGradient || "linear-gradient(135deg,#35f28f,#18c878,#0f8f5c)")
    );
    servicePageRootEl.style.setProperty(
      "--service-dark-overlay",
      String(theme.darkOverlay || "linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.58))")
    );
    servicePageRootEl.style.setProperty(
      "--service-color-overlay",
      String(theme.colorOverlay || "linear-gradient(135deg,rgba(0,255,120,.28),rgba(0,130,80,.18),rgba(0,0,0,.20))")
    );
  }

  function applyServicePageContent(payload) {
    if (!servicePageRootEl || !payload || !payload.page) return;
    const page = payload.page;
    const key = normalizeAiServiceKey(page.serviceKey || page.slug || getServicePageKey());
    servicePageRootEl.setAttribute("data-service-page", key);

    const eyebrow = servicePageRootEl.querySelector(".service-hero__eyebrow");
    const title = servicePageRootEl.querySelector(".service-hero__content h1");
    const description = servicePageRootEl.querySelector(".service-hero__content p");
    const constructorBrand = servicePageRootEl.querySelector(".service-constructor-brand h2");
    const constructorBrandLabel = servicePageRootEl.querySelector(".service-constructor-brand span");
    const constructorDescriptionTitle = servicePageRootEl.querySelector(".service-constructor-description h3");
    const constructorDescriptionText = servicePageRootEl.querySelector(".service-constructor-description p");
    const video = servicePageRootEl.querySelector(".service-hero__video");

    if (eyebrow) eyebrow.textContent = page.heroEyebrow || (isEnPage ? "Plans" : "Тарифные планы");
    if (title) title.textContent = page.heroTitle || page.title || "GPTishka";
    if (description) description.textContent = page.heroDescription || "";
    if (constructorBrand) constructorBrand.textContent = page.constructorTitle || page.title || "GPTishka";
    if (constructorBrandLabel) constructorBrandLabel.textContent = page.heroEyebrow || (isEnPage ? "Plans" : "Тарифные планы");
    if (constructorDescriptionTitle) constructorDescriptionTitle.textContent = page.constructorTitle || page.title || "GPTishka";
    if (constructorDescriptionText) constructorDescriptionText.textContent = page.constructorDescription || page.heroDescription || "";

    if (video && page.heroVideoUrl) {
      video.hidden = false;
      video.innerHTML = '<source src="' + escapeHtml(page.heroVideoUrl) + '" type="video/mp4">';
      try {
        video.load();
      } catch (_) {}
    }

    if (payload.meta && payload.meta.title) document.title = payload.meta.title;
  }

  function renderDynamicServiceInfo(payload) {
    const section = document.querySelector("[data-service-info-section]");
    if (!section || !payload || !payload.page) return;
    const items = Array.isArray(payload.page.infoSections) ? payload.page.infoSections : [];
    if (!items.length) {
      section.innerHTML = "";
      section.hidden = true;
      return;
    }
    section.hidden = false;
    section.innerHTML =
      '<div class="service-section-title"><h2>' + escapeHtml(isEnPage ? "Features" : "Возможности") + "</h2><p>" +
      escapeHtml(payload.page.title || "") +
      "</p></div>" +
      '<div class="service-info-grid">' +
      items
        .map(
          item =>
            '<article class="service-info-card"><h3>' +
            escapeHtml(String(item?.title || "")) +
            "</h3><p>" +
            escapeHtml(String(item?.text || "")) +
            "</p></article>"
        )
        .join("") +
      "</div>";
  }

  function renderDynamicServiceFaq(payload) {
    const section = document.querySelector("[data-service-faq-section]");
    if (!section || !payload || !payload.page) return;
    const items = Array.isArray(payload.page.faqItems) ? payload.page.faqItems : [];
    if (!items.length) {
      section.innerHTML = "";
      section.hidden = true;
      return;
    }
    section.hidden = false;
    section.innerHTML =
      '<div class="service-section-title"><h2>' +
      escapeHtml(isEnPage ? "FAQ" : "Часто задаваемые вопросы") +
      "</h2><p>" +
      escapeHtml(isEnPage ? "Short answers to common questions" : "Короткие ответы на частые вопросы") +
      "</p></div>" +
      '<div class="service-faq-list">' +
      items
        .map(
          (item, index) =>
            '<article class="service-faq-item' +
            (index === 0 ? " active" : "") +
            '"><button class="service-faq-question" type="button">' +
            escapeHtml(String(item?.question || "")) +
            '<span></span></button><div class="service-faq-answer"><p>' +
            escapeHtml(String(item?.answer || "")) +
            "</p></div></article>"
        )
        .join("") +
      "</div>";
  }

  function getServicePlanKey(item, serviceKey) {
    const key = normalizeAiServiceKey(serviceKey);
    const text = getProductSearchText(item);
    const tags = Array.isArray(item?.tags)
      ? item.tags.map(tag => String(tag || "").trim().toLowerCase())
      : [];
    const joinedTags = tags.join(" ");

    if (key === "chatgpt") {
      if (text.includes("pro-20x") || text.includes("pro 20x") || text.includes("pro20x") || joinedTags.includes("pro20x")) return "pro-20x";
      if (text.includes("pro-5x") || text.includes("pro 5x") || text.includes("pro5x") || joinedTags.includes("pro5x")) return "pro-5x";
      if (text.includes("go") || joinedTags.split(/\s+/).includes("go")) return "go";
      if (text.includes("plus") || joinedTags.split(/\s+/).includes("plus")) return "plus";
      if (text.includes("pro")) return "pro";
      return "chatgpt";
    }

    if (key === "grok") {
      return getServiceDurationKey(item);
    }

    if (key === "vpn") {
      return getServiceDurationKey(item);
    }

    if (key === "claude") {
      if (text.includes("pro")) return "pro";
      return "claude";
    }

    return "plan";
  }

  function getServiceDurationKey(item) {
    const text = getProductSearchText(item);
    const tags = Array.isArray(item?.tags)
      ? item.tags.map(tag => String(tag || "").trim().toLowerCase())
      : [];
    const monthTag = tags.find(tag => /^month:\d+$/i.test(tag));
    if (monthTag) {
      const months = Number(monthTag.split(":")[1] || 0);
      if (months > 0) return `${months}m`;
    }
    const daysTag = tags.find(tag => /^vpn:days:\d+$/i.test(tag));
    if (daysTag) {
      const days = Number(daysTag.split(":").pop() || 0);
      if (days >= 330) return "12m";
      if (days >= 170) return "6m";
      if (days >= 55) return "2m";
      if (days > 0) return "1m";
    }
    if (text.includes("12 месяцев") || text.includes("12 месяц") || text.includes("12 month") || text.includes("year") || text.includes("365")) return "12m";
    if (text.includes("6 месяцев") || text.includes("6 месяц") || text.includes("6 month") || text.includes("180")) return "6m";
    if (text.includes("2 месяца") || text.includes("2 месяц") || text.includes("2 month") || text.includes("60")) return "2m";
    return "1m";
  }

  function getServiceDeliveryKey(item) {
    const tags = Array.isArray(item?.tags) ? item.tags : [];
    const deliveryType = resolveDeliveryType(item?.deliveryType, item?.deliveryMethod, tags);
    const text = getProductSearchText(item);
    if (isStandaloneVpnProduct(item)) return "vpn";
    if (deliveryType === "manual_login") return "login";
    if (deliveryType === "credentials" || text.includes("credentials") || text.includes("со входом") || text.includes("логин")) return "login";
    if (deliveryType === "support" || text.includes("по id") || text.includes("account id")) return "id";
    if (text.includes("по ссылке") || text.includes("link")) return "link";
    return "link";
  }

  function getServicePlanLabel(serviceKey, planKey) {
    const key = normalizeAiServiceKey(serviceKey);
    const labels = {
      chatgpt: {
        all: isEnPage ? "All plans" : "Все тарифы",
        go: "Go",
        plus: "Plus",
        pro: "Pro",
        "pro-5x": "Pro 5x",
        "pro-20x": "Pro 20x",
        chatgpt: "ChatGPT",
      },
      claude: {
        all: isEnPage ? "All plans" : "Все тарифы",
        pro: "Pro",
        claude: "Claude",
      },
      grok: {
        all: isEnPage ? "All plans" : "Все тарифы",
        "1m": isEnPage ? "1 month" : "1 месяц",
        "2m": isEnPage ? "2 months" : "2 месяца",
        "6m": isEnPage ? "6 months" : "6 месяцев",
        "12m": isEnPage ? "12 months" : "12 месяцев",
      },
      vpn: {
        all: isEnPage ? "All durations" : "Все сроки",
        "1m": isEnPage ? "1 month" : "1 месяц",
        "2m": isEnPage ? "2 months" : "2 месяца",
        "6m": isEnPage ? "6 months" : "6 месяцев",
        "12m": isEnPage ? "12 months" : "12 месяцев",
      },
    };
    return labels[key]?.[planKey] || planKey;
  }

  function getServiceDeliveryLabel(deliveryKey) {
    const labels = isEnPage
      ? { all: "All methods", login: "With login", link: "By link", id: "By ID", vpn: "VLESS" }
      : { all: "Все способы", login: "Со входом", link: "Без входа", id: "По ID" };
    return labels[deliveryKey] || deliveryKey;
  }

  function getServiceDeliveryDisplayLabel(serviceKey, deliveryKey) {
    const key = normalizeAiServiceKey(serviceKey);
    const value = String(deliveryKey || "").trim();
    if ((key === "claude" || key === "grok") && value === "id") return isEnPage ? "Without login" : "Без входа";
    if (key === "vpn" && value === "vpn") return isEnPage ? "VLESS key" : "VLESS-ключ";
    return getServiceDeliveryLabel(value);
  }

  function getServiceDeliveryFilterKey(item, serviceKey) {
    const key = normalizeAiServiceKey(serviceKey);
    const deliveryKey = getServiceDeliveryKey(item);
    if (key === "vpn") return "vpn";
    if ((key === "claude" || key === "grok") && deliveryKey === "id") return "link";
    return deliveryKey;
  }

  function getServiceDurationLabel(durationKey) {
    if (durationKey === "all") return isEnPage ? "All durations" : "Все сроки";
    const months = Number(String(durationKey || "").replace(/[^\d]/g, ""));
    if (!months) return durationKey;
    if (isEnPage) return months === 1 ? "1 month" : `${months} months`;
    const mod10 = Math.abs(months) % 10;
    const mod100 = Math.abs(months) % 100;
    const unit = mod10 === 1 && mod100 !== 11
      ? "месяц"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "месяца"
        : "месяцев";
    return `${months} ${unit}`;
  }

  function getServicePlanSortScore(serviceKey, planKey) {
    const key = normalizeAiServiceKey(serviceKey);
    if (key === "chatgpt") {
      const order = { go: 10, plus: 20, "pro-5x": 30, "pro-20x": 40, pro: 50, chatgpt: 90 };
      return order[planKey] || 100;
    }
    if (key === "grok") {
      const months = Number(String(planKey || "").replace(/[^\d]/g, ""));
      return months ? months * 10 : 100;
    }
    if (key === "vpn") {
      const months = Number(String(planKey || "").replace(/[^\d]/g, ""));
      return months ? months * 10 : 100;
    }
    if (key === "claude") {
      return planKey === "pro" ? 10 : 50;
    }
    return 100;
  }

  function getServiceDurationSortScore(durationKey) {
    const months = Number(String(durationKey || "").replace(/[^\d]/g, ""));
    return months ? months * 10 : 1000;
  }

  function getServiceDeliverySortScore(deliveryKey) {
    const order = { login: 10, link: 20, id: 30, vpn: 40 };
    return order[deliveryKey] || 100;
  }

  function sortServicePageItems(serviceKey, items) {
    return (Array.isArray(items) ? items.slice() : []).sort((a, b) => {
      const planDiff =
        getServicePlanSortScore(serviceKey, getServicePlanKey(a, serviceKey)) -
        getServicePlanSortScore(serviceKey, getServicePlanKey(b, serviceKey));
      if (planDiff !== 0) return planDiff;
      const durationDiff =
        getServiceDurationSortScore(getServiceDurationKey(a)) -
        getServiceDurationSortScore(getServiceDurationKey(b));
      if (durationDiff !== 0) return durationDiff;
      return Math.max(0, toAmount(a?.price)) - Math.max(0, toAmount(b?.price));
    });
  }

  function shouldRenderAiServiceDirectory(section, groups) {
    if (!groups.length) return false;
    const sectionText = [
      section?.slug,
      section?.title,
      section?.description,
    ].map(value => String(value || "").trim().toLowerCase()).join(" ");
    if (
      sectionText.includes("нейросет") ||
      sectionText.includes("подписки ии") ||
      sectionText.includes("ai") ||
      sectionText.includes("artificial")
    ) {
      return true;
    }
    const products = Array.isArray(section?.products) ? section.products : [];
    const aiCount = groups.reduce((sum, group) => sum + group.items.length, 0);
    return aiCount >= 2 && products.length > 0 && aiCount / products.length >= 0.6;
  }

  function isVpnProduct(item) {
    return isStandaloneVpnProduct(item);
  }

  function shouldRenderVpnDirectory(section) {
    const products = Array.isArray(section?.products) ? section.products : [];
    if (!products.length) return false;
    const sectionText = [
      section?.slug,
      section?.title,
      section?.description,
    ].map(value => String(value || "").trim().toLowerCase()).join(" ");
    if (sectionText.includes("vpn")) return products.some(isVpnProduct);
    const vpnCount = products.filter(isVpnProduct).length;
    return vpnCount >= 1 && vpnCount / products.length >= 0.6;
  }

  function formatVpnPlanSummary(items) {
    const labels = {
      "1m": isEnPage ? "1 month" : "1 месяц",
      "2m": isEnPage ? "2 months" : "2 месяца",
      "6m": isEnPage ? "6 months" : "6 месяцев",
      "12m": isEnPage ? "12 months" : "12 месяцев",
    };
    const seen = new Set();
    return (Array.isArray(items) ? items : [])
      .slice()
      .sort((a, b) => getServiceDurationSortScore(getServiceDurationKey(a)) - getServiceDurationSortScore(getServiceDurationKey(b)))
      .map(item => getServiceDurationKey(item))
      .filter(key => {
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 4)
      .map(key => labels[key] || key)
      .join(" / ");
  }

  function renderVpnDirectoryCard(section) {
    const items = (Array.isArray(section?.products) ? section.products : []).filter(isVpnProduct);
    if (!items.length) return "";
    const prices = items.map(item => toAmount(item?.price)).filter(price => Number.isFinite(price) && price > 0);
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const currency = String(items.find(item => toAmount(item?.price) === minPrice)?.currency || items[0]?.currency || "RUB").toUpperCase();
    const fromLabel = isEnPage ? "from" : "от";
    const buttonLabel = isEnPage ? "To plans" : "К тарифам";
    const title = isEnPage ? "GPTishka VPN" : "GPTishka VPN";
    const description = isEnPage
      ? "Secure VPN access with current plans inside the catalog."
      : "Безопасный VPN-доступ. Актуальные тарифы и сроки внутри каталога.";
    const planSummary = formatVpnPlanSummary(items);
    return (
      '<div class="ai-directory-grid ai-directory-grid--vpn">' +
        '<article class="ai-directory-card ai-directory-card--vpn">' +
          '<a class="ai-directory-card__media has-hover" href="/store/vpn" aria-label="' + escapeHtml(title) + '">' +
            '<img class="ai-directory-card__image ai-directory-card__image--primary" src="/assets/img/services/vpn-card.png?v=20260620-vpn-card1" alt="' + escapeHtml(title) + '" loading="lazy" decoding="async">' +
            '<img class="ai-directory-card__image ai-directory-card__image--hover" src="/assets/img/services/vpn-card-hover.png?v=20260620-vpn-card1" alt="' + escapeHtml(title) + '" loading="lazy" decoding="async">' +
          "</a>" +
          '<div class="ai-directory-card__body">' +
            '<div class="ai-directory-card__top">' +
              '<span class="ai-directory-card__icon ai-service-card__icon--grok">VPN</span>' +
              '<span class="ai-directory-card__count">' + escapeHtml(String(items.length)) + "</span>" +
            "</div>" +
            '<h4 class="ai-directory-card__name">' + escapeHtml(title) + "</h4>" +
            '<p class="ai-directory-card__desc">' + escapeHtml(description) + "</p>" +
            (planSummary ? '<p class="ai-directory-card__plans">' + escapeHtml(planSummary) + "</p>" : "") +
            '<div class="ai-directory-card__bottom">' +
              '<span class="ai-directory-card__price">' + (minPrice ? escapeHtml(fromLabel + " " + formatPriceByCurrency(minPrice, currency)) : "") + "</span>" +
              '<a class="ai-directory-card__button" href="/store/vpn">' + escapeHtml(buttonLabel) + "</a>" +
            "</div>" +
          "</div>" +
        "</article>" +
      "</div>"
    );
  }

  function formatServicePlanSummary(group) {
    const serviceKey = normalizeAiServiceKey(group?.service?.key);
    const seen = new Set();
    const labels = [];
    group.items.forEach(item => {
      const planKey = getServicePlanKey(item, serviceKey);
      if (seen.has(planKey)) return;
      seen.add(planKey);
      labels.push(getServicePlanLabel(serviceKey, planKey));
    });
    return labels.slice(0, 4).join(" / ");
  }

  function renderAiDirectoryCard(group) {
    const serviceKey = normalizeAiServiceKey(group?.service?.key);
    const prices = group.items.map(item => toAmount(item?.price)).filter(price => Number.isFinite(price) && price > 0);
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const currency = String(group.items.find(item => toAmount(item?.price) === minPrice)?.currency || group.items[0]?.currency || "RUB").toUpperCase();
    const planCountText = isEnPage
      ? `${group.items.length} plan${group.items.length === 1 ? "" : "s"}`
      : `${group.items.length} тариф${group.items.length === 1 ? "" : group.items.length < 5 ? "а" : "ов"}`;
    const fromLabel = isEnPage ? "from" : "от";
    const buttonLabel = isEnPage ? "To plans" : "К тарифам";
    const planSummary = formatServicePlanSummary(group);
    const visualItem = group.items.find(item => getVisualConfig(item).imageUrl || getVisualConfig(item).hoverImageUrl) || group.items[0];
    const visual = getVisualConfig(visualItem);
    const background = getShowcaseCardBackground(visual);
    const fallbackImagesByService = {
      chatgpt: {
        imageUrl: "/assets/img/services/chatgpt-card.png",
        hoverImageUrl: "/assets/img/services/chatgpt-card-hover.png",
        imageAlt: "ChatGPT",
        hoverImageAlt: "ChatGPT",
      },
      claude: {
        imageUrl: "/assets/img/services/claude-card.png?v=20260618-claude-logo2",
        hoverImageUrl: "/assets/img/services/claude-card-hover.png?v=20260618-claude-logo2",
        imageAlt: "Claude",
        hoverImageAlt: "Claude",
      },
      grok: {
        imageUrl: "/assets/img/services/grok-card.png?v=20260618-grok-logo4",
        hoverImageUrl: "/assets/img/services/grok-card-hover.png",
        imageAlt: "SuperGrok",
        hoverImageAlt: "SuperGrok",
      },
    };
    const fallbackImages = fallbackImagesByService[serviceKey] || {};
    const primaryImageUrl = visual.imageUrl || visual.hoverImageUrl || fallbackImages.imageUrl || "";
    const hoverImageUrl = visual.hoverImageUrl || fallbackImages.hoverImageUrl || "";
    const hasHoverImage = Boolean(primaryImageUrl && hoverImageUrl && primaryImageUrl !== hoverImageUrl);
    const imageMarkup = primaryImageUrl
      ? '<img class="ai-directory-card__image ai-directory-card__image--primary" src="' + escapeHtml(primaryImageUrl) + '" alt="' + escapeHtml(visual.imageAlt || fallbackImages.imageAlt || group.service.name) + '" loading="lazy" decoding="async">' +
        (hasHoverImage ? '<img class="ai-directory-card__image ai-directory-card__image--hover" src="' + escapeHtml(hoverImageUrl) + '" alt="' + escapeHtml(visual.hoverImageAlt || visual.imageAlt || fallbackImages.hoverImageAlt || group.service.name) + '" loading="lazy" decoding="async">' : "")
      : '<div class="ai-directory-card__image-placeholder">' + escapeHtml(group.service.icon) + "</div>";

    return (
      '<article class="ai-directory-card ai-directory-card--' + escapeHtml(group.service.theme) + '" style="--ai-directory-bg:' + escapeHtml(background) + '">' +
        '<a class="ai-directory-card__media' + (hasHoverImage ? " has-hover" : "") + '" href="' + escapeHtml(getServicePagePath(serviceKey)) + '" aria-label="' + escapeHtml(group.service.name) + '">' +
          imageMarkup +
        "</a>" +
        '<div class="ai-directory-card__body">' +
          '<div class="ai-directory-card__top">' +
            '<span class="ai-directory-card__icon ai-service-card__icon--' + escapeHtml(group.service.theme) + '">' + escapeHtml(group.service.icon) + "</span>" +
            '<span class="ai-directory-card__count">' + escapeHtml(planCountText) + "</span>" +
          "</div>" +
          '<h4 class="ai-directory-card__name">' + escapeHtml(group.service.name) + "</h4>" +
          '<p class="ai-directory-card__desc">' + escapeHtml(group.service.description) + "</p>" +
          (planSummary ? '<p class="ai-directory-card__plans">' + escapeHtml(planSummary) + "</p>" : "") +
          '<div class="ai-directory-card__bottom">' +
            '<span class="ai-directory-card__price">' + (minPrice ? escapeHtml(fromLabel + " " + formatPriceByCurrency(minPrice, currency)) : "") + "</span>" +
            '<a class="ai-directory-card__button" href="' + escapeHtml(getServicePagePath(serviceKey)) + '">' + escapeHtml(buttonLabel) + "</a>" +
          "</div>" +
        "</div>" +
      "</article>"
    );
  }

  function renderAiServiceDirectory(section, groups, sectionIdx) {
    const groupedItems = new Set();
    groups.forEach(group => group.items.forEach(item => groupedItems.add(item)));
    const otherCards = (Array.isArray(section?.products) ? section.products : [])
      .filter(item => !groupedItems.has(item))
      .map((item, itemIdx) => buildShowcaseProductCard(item, sectionIdx * 100 + 60 + itemIdx))
      .filter(Boolean)
      .join("");
    return (
      '<div class="ai-directory-grid">' + groups.map(renderAiDirectoryCard).join("") + "</div>" +
      (otherCards ? '<div class="product-showcase-grid product-showcase-grid--mixed">' + otherCards + "</div>" : "")
    );
  }

  function renderAiServiceTile(group, isActive) {
    const prices = group.items.map(item => toAmount(item?.price)).filter(price => Number.isFinite(price) && price > 0);
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const planCountText = isEnPage
      ? `${group.items.length} plan${group.items.length === 1 ? "" : "s"}`
      : `${group.items.length} тариф${group.items.length === 1 ? "" : "а"}`;
    const fromLabel = isEnPage ? "from" : "от";
    const buttonLabel = isEnPage ? "Choose plan" : "Выбрать тариф";

    return (
      '<button type="button" class="ai-service-card' + (isActive ? " is-active" : "") + '" data-ai-service-tab="' + escapeHtml(group.service.key) + '" aria-selected="' + (isActive ? "true" : "false") + '">' +
        '<span class="ai-service-card__icon ai-service-card__icon--' + escapeHtml(group.service.theme) + '">' + escapeHtml(group.service.icon) + "</span>" +
        '<span class="ai-service-card__body">' +
          '<span class="ai-service-card__name">' + escapeHtml(group.service.name) + "</span>" +
          '<span class="ai-service-card__desc">' + escapeHtml(group.service.description) + "</span>" +
          '<span class="ai-service-card__meta">' + escapeHtml(planCountText) + (minPrice ? " · " + escapeHtml(fromLabel + " " + formatPriceByCurrency(minPrice, "RUB")) : "") + "</span>" +
        "</span>" +
        '<span class="ai-service-card__cta">' + escapeHtml(buttonLabel) + "</span>" +
      "</button>"
    );
  }

  function renderAiPricingCategory(categoryLabel, categoryItems, groupIdx) {
    const groups = getAiServiceGroups(categoryItems);
    if (!groups.length) return null;

    const groupedItems = new Set();
    groups.forEach(group => group.items.forEach(item => groupedItems.add(item)));
    const otherItems = (Array.isArray(categoryItems) ? categoryItems : []).filter(item => !groupedItems.has(item));
    const categoryTitle = isEnPage ? "AI Services" : "Нейросети";
    const categorySubtitle = isEnPage
      ? "Choose a service first, then pick the plan that fits you."
      : "Сначала выберите сервис, затем подходящий тариф.";
    const plansLabel = isEnPage ? "Plans" : "Тарифы";
    const tabs = groups.map((group, idx) => renderAiServiceTile(group, idx === 0)).join("");
    const panels = groups.map((group, idx) => {
      const cards = group.items
        .map((item, itemIdx) => buildProductCard(item, groupIdx * 100 + idx * 20 + itemIdx))
        .join("");
      return (
        '<section class="ai-service-panel' + (idx === 0 ? " is-active" : "") + '" data-ai-service-panel="' + escapeHtml(group.service.key) + '"' + (idx === 0 ? "" : " hidden") + ">" +
          '<div class="ai-service-panel__header">' +
            '<span class="ai-service-panel__eyebrow">' + escapeHtml(plansLabel) + "</span>" +
            '<h4 class="ai-service-panel__title">' + escapeHtml(group.service.name) + "</h4>" +
          "</div>" +
          '<div class="pricing-grid pricing-grid--category ai-service-plan-grid' + (group.items.length === 1 ? " is-single" : "") + '">' + cards + "</div>" +
        "</section>"
      );
    }).join("");
    const otherCards = otherItems.length
      ? '<div class="pricing-grid pricing-grid--category ai-service-plan-grid ai-service-plan-grid--other">' + otherItems.map((item, idx) => buildProductCard(item, groupIdx * 100 + 80 + idx)).join("") + "</div>"
      : "";

    return (
      '<section class="pricing-category pricing-category--ai" data-category="' + escapeHtml(categoryLabel) + '">' +
        '<div class="pricing-category__header pricing-category__header--ai">' +
          '<div class="pricing-category__lead">' +
            '<h3 class="pricing-category__title">' + escapeHtml(categoryTitle) + "</h3>" +
            '<p class="pricing-category__subtitle">' + escapeHtml(categorySubtitle) + "</p>" +
          "</div>" +
        "</div>" +
        '<div class="ai-service-picker" role="tablist" aria-label="' + escapeHtml(categoryTitle) + '">' + tabs + "</div>" +
        '<div class="ai-service-panels" data-ai-service-panels>' + panels + "</div>" +
        otherCards +
      "</section>"
    );
  }

  function setupAiServiceTabs(root) {
    const scope = root || document;
    scope.querySelectorAll(".pricing-category--ai").forEach(categoryEl => {
      const tabs = Array.from(categoryEl.querySelectorAll("[data-ai-service-tab]"));
      const panels = Array.from(categoryEl.querySelectorAll("[data-ai-service-panel]"));
      if (!tabs.length || !panels.length) return;
      tabs.forEach(tab => {
        tab.addEventListener("click", () => {
          const key = String(tab.getAttribute("data-ai-service-tab") || "").trim();
          if (!key) return;
          tabs.forEach(node => {
            const active = node === tab;
            node.classList.toggle("is-active", active);
            node.setAttribute("aria-selected", active ? "true" : "false");
          });
          panels.forEach(panel => {
            const active = String(panel.getAttribute("data-ai-service-panel") || "") === key;
            panel.classList.toggle("is-active", active);
            if (active) panel.removeAttribute("hidden");
            else panel.setAttribute("hidden", "");
          });
        });
      });
    });
  }

  function groupProductsByCategory(items) {
    const groupsMap = new Map();
    (Array.isArray(items) ? items : []).forEach((item) => {
      const categoryLabel = normalizeProductCategoryLabel(item?.category);
      if (!groupsMap.has(categoryLabel)) groupsMap.set(categoryLabel, []);
      groupsMap.get(categoryLabel).push(item);
    });

    return Array.from(groupsMap.entries()).sort((a, b) => {
      const scoreDiff = categorySortScore(a[0]) - categorySortScore(b[0]);
      if (scoreDiff !== 0) return scoreDiff;
      return String(a[0]).localeCompare(String(b[0]), isEnPage ? "en" : "ru");
    });
  }

  function buildFallbackShowcaseSections(items) {
    return groupProductsByCategory(items).map(([categoryLabel, categoryItems], index) => ({
      id: "fallback:" + index,
      slug: String(categoryLabel || "products").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "products",
      title: categoryLabel,
      description: "",
      sortOrder: index,
      products: sortFallbackShowcaseProducts(categoryItems),
    }));
  }

  function renderShowcaseSections(sections) {
    const safeSections = (Array.isArray(sections) ? sections : [])
      .map(section => ({
        ...section,
        products: (Array.isArray(section?.products) ? section.products : []).filter(item => getVisualConfig(item).isVisible),
      }))
      .filter(section => section.products.length);
    const showAllLabel = isEnPage ? "Show all" : "Показать все";

    return safeSections.map((section, sectionIdx) => {
      const aiGroups = getAiServiceGroups(section.products);
      const renderAsAiDirectory = shouldRenderAiServiceDirectory(section, aiGroups);
      const renderAsVpnDirectory = !renderAsAiDirectory && shouldRenderVpnDirectory(section);
      const sectionTitle = renderAsAiDirectory
        ? (isEnPage ? "AI Services" : "Нейросети")
        : renderAsVpnDirectory
          ? "VPN"
        : String(section?.title || (isEnPage ? "Products" : "Товары")).trim();
      const sectionDescription = renderAsAiDirectory
        ? (isEnPage
            ? "Choose a service first, then open its plans."
            : "Сначала выберите сервис, затем откройте его тарифы.")
        : renderAsVpnDirectory
          ? (isEnPage
              ? "Open the VPN catalog and choose an active plan."
              : "Откройте VPN-каталог и выберите актуальный тариф.")
        : String(section?.description || "").trim();
      const cardsMarkup = renderAsAiDirectory
        ? renderAiServiceDirectory(section, aiGroups, sectionIdx)
        : renderAsVpnDirectory
          ? renderVpnDirectoryCard(section)
        : section.products
            .map((item, itemIdx) => buildShowcaseProductCard(item, sectionIdx * 100 + itemIdx))
            .filter(Boolean)
            .join("");
      if (!cardsMarkup) return "";
      const isCollapsible = !renderAsAiDirectory && !renderAsVpnDirectory && section.products.length > 10;

      return (
        '<section class="product-showcase-section' + (isCollapsible ? " is-collapsed" : "") + '" data-showcase-section="' + escapeHtml(section?.slug || sectionIdx) + '">' +
          '<div class="product-showcase-section__header">' +
            '<div class="product-showcase-section__lead">' +
              '<h3 class="product-showcase-section__title">' + escapeHtml(sectionTitle) + "</h3>" +
              (sectionDescription ? '<p class="product-showcase-section__description">' + escapeHtml(sectionDescription) + "</p>" : "") +
            "</div>" +
            '<button type="button" class="product-showcase-section__all" data-showcase-show-all' + (isCollapsible ? "" : " hidden") + ">" + escapeHtml(showAllLabel) + "</button>" +
          "</div>" +
          '<div class="product-showcase-grid">' + cardsMarkup + "</div>" +
        "</section>"
      );
    }).join("");
  }

  function setupShowcaseSections(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-showcase-show-all]").forEach(button => {
      button.addEventListener("click", () => {
        const section = button.closest(".product-showcase-section");
        if (!section) return;
        section.classList.remove("is-collapsed");
        section.classList.add("is-expanded");
        button.setAttribute("hidden", "");
      });
    });
  }

  function getServiceFilterOptions(items, serviceKey, kind) {
    const map = new Map();
    (Array.isArray(items) ? items : []).forEach(item => {
      const optionKey =
        kind === "plan"
          ? getServicePlanKey(item, serviceKey)
          : kind === "delivery"
            ? getServiceDeliveryFilterKey(item, serviceKey)
            : getServiceDurationKey(item);
      if (!optionKey) return;
      if (!map.has(optionKey)) map.set(optionKey, { key: optionKey, count: 0 });
      map.get(optionKey).count += 1;
    });

    return Array.from(map.values()).sort((a, b) => {
      if (kind === "plan") return getServicePlanSortScore(serviceKey, a.key) - getServicePlanSortScore(serviceKey, b.key);
      if (kind === "delivery") return getServiceDeliverySortScore(a.key) - getServiceDeliverySortScore(b.key);
      return getServiceDurationSortScore(a.key) - getServiceDurationSortScore(b.key);
    });
  }

  function getConstructorFilterOptions(serviceKey, kind, options) {
    const key = normalizeAiServiceKey(serviceKey);
    const safeOptions = Array.isArray(options) ? options : [];
    const fixedByService = {
      chatgpt: {
        plan: ["go", "plus", "pro-5x", "pro-20x"],
        delivery: ["login", "link"],
        duration: ["1m", "12m"],
      },
      claude: {
        plan: ["pro", "claude"],
        delivery: ["login", "link"],
        duration: ["1m", "12m"],
      },
      vpn: {
        plan: ["1m", "2m", "6m", "12m"],
        delivery: ["vpn"],
        duration: ["1m", "2m", "6m", "12m"],
      },
    };
    const fixedByKind = fixedByService[key];
    if (!fixedByKind) return safeOptions;
    const fixed = fixedByKind[kind];
    if (!fixed) return safeOptions;
    const byKey = new Map(safeOptions.map(option => [option.key, option]));
    const merged = fixed.map(optionKey => {
      const option = byKey.get(optionKey);
      return {
        key: optionKey,
        count: option ? option.count : 0,
        disabled: !option || !option.count,
      };
    });
    safeOptions.forEach(option => {
      if (!fixed.includes(option.key)) merged.push(option);
    });
    return merged;
  }

  function getServiceFilterLabel(kind, serviceKey, optionKey) {
    if (kind === "plan") return getServicePlanLabel(serviceKey, optionKey);
    if (kind === "delivery") return getServiceDeliveryDisplayLabel(serviceKey, optionKey);
    return getServiceDurationLabel(optionKey);
  }

  function getServiceFilterCountLabel(count) {
    const value = Math.abs(Number(count) || 0);
    const mod10 = value % 10;
    const mod100 = value % 100;
    if (isEnPage) return `${value} option${value === 1 ? "" : "s"}`;
    if (mod10 === 1 && mod100 !== 11) return `${value} вариант`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${value} варианта`;
    return `${value} вариантов`;
  }

  function getServiceFilterAriaLabel(kind, optionLabel, count, isActive) {
    const parts = [String(optionLabel || "").trim(), getServiceFilterCountLabel(count)];
    if (isActive) parts.push(isEnPage ? "selected" : "выбрано");
    return parts.filter(Boolean).join(", ");
  }

  function renderServiceFilterGroup(container, kind, label, options, selectedKey, totalCount, serviceKey) {
    if (!container) return;
    const safeOptions = Array.isArray(options) ? options : [];
    if (!safeOptions.length) {
      container.innerHTML = "";
      return;
    }

    const includeAll = !isServiceConstructorPage() && safeOptions.length > 1;
    const list = includeAll
      ? [{ key: "all", count: totalCount }, ...safeOptions]
      : safeOptions;
    const enabledOptions = safeOptions.filter(option => !option.disabled);
    const activeKey = includeAll && (!selectedKey || selectedKey === "all")
      ? "all"
      : (enabledOptions.some(option => option.key === selectedKey) ? selectedKey : enabledOptions[0]?.key || safeOptions[0].key);
    if (servicePageState[kind] !== activeKey) servicePageState[kind] = activeKey;

    const buttons = list.map(option => {
      const isActive = option.key === activeKey;
      const optionLabel = option.key === "all"
        ? getServiceFilterLabel(kind, serviceKey, "all")
        : getServiceFilterLabel(kind, serviceKey, option.key);
      return (
        '<button type="button" class="service-filter-chip' + (isActive ? " is-active" : "") + (option.disabled ? " is-disabled" : "") + '"' +
        ' data-service-filter-kind="' + escapeHtml(kind) + '"' +
        ' data-service-filter-key="' + escapeHtml(option.key) + '"' +
        ' aria-label="' + escapeHtml(getServiceFilterAriaLabel(kind, optionLabel, option.count || 0, isActive)) + '"' +
        ' aria-pressed="' + (isActive ? "true" : "false") + '"' +
        (option.disabled ? " disabled" : "") + '>' +
          '<span>' + escapeHtml(optionLabel) + "</span>" +
          '<small aria-hidden="true">' + escapeHtml(String(option.count || 0)) + "</small>" +
        "</button>"
      );
    }).join("");

    container.innerHTML =
      '<div class="service-filter-group" data-service-filter-group="' + escapeHtml(kind) + '">' +
        '<div class="service-filter-group__label">' + escapeHtml(label) + "</div>" +
        '<div class="service-filter-group__chips">' + buttons + "</div>" +
      "</div>";
  }

  function getServiceConstructorPlanTitle(item, serviceKey, planLabel) {
    const key = normalizeAiServiceKey(serviceKey);
    if (key === "claude") return String(item?.title || planLabel || "").trim();
    if (key === "grok") return String(item?.title || planLabel || "").trim();
    if (key === "vpn") return String(item?.title || planLabel || "").trim();
    return String(planLabel || "").trim();
  }

  function filterServicePageItems(items, serviceKey) {
    return (Array.isArray(items) ? items : []).filter(item => {
      const planKey = getServicePlanKey(item, serviceKey);
      const deliveryKey = getServiceDeliveryFilterKey(item, serviceKey);
      const durationKey = getServiceDurationKey(item);
      if (servicePageState.plan !== "all" && planKey !== servicePageState.plan) return false;
      if (servicePageState.delivery !== "all" && deliveryKey !== servicePageState.delivery) return false;
      if (servicePageState.duration !== "all" && durationKey !== servicePageState.duration) return false;
      return true;
    });
  }

  function updateServiceSummary(items) {
    const prices = (Array.isArray(items) ? items : [])
      .map(item => toAmount(item?.price))
      .filter(price => Number.isFinite(price) && price > 0);
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const currency = String((Array.isArray(items) ? items : []).find(item => toAmount(item?.price) === minPrice)?.currency || "RUB").toUpperCase();

    if (serviceMinPriceEl) {
      serviceMinPriceEl.textContent = minPrice ? formatPriceByCurrency(minPrice, currency) : "—";
    }
    if (servicePlansCountEl) {
      const count = Array.isArray(items) ? items.length : 0;
      servicePlansCountEl.textContent = isEnPage
        ? `${count} plan${count === 1 ? "" : "s"}`
        : `${count} тариф${count === 1 ? "" : count > 1 && count < 5 ? "а" : "ов"}`;
    }
  }

  function renderServiceConstructorCard(item, serviceKey) {
    if (!item) return "";
    const product = String(item.product || item.id || "product").trim();
    const productId = String(item.id || "").trim();
    const title = String(item.title || product).trim();
    const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];
    const price = Math.max(0, toAmount(item.price));
    const currency = String(item.currency || "RUB").toUpperCase();
    const planKey = getServicePlanKey(item, serviceKey);
    const deliveryKey = getServiceDeliveryKey(item);
    const durationKey = getServiceDurationKey(item);
    const planLabel = getServicePlanLabel(serviceKey, planKey);
    const planTitle = getServiceConstructorPlanTitle(item, serviceKey, planLabel);
    const deliveryLabel = getServiceDeliveryDisplayLabel(serviceKey, deliveryKey);
    const durationLabel = getServiceDurationLabel(durationKey);
    const description = String(item.description || "").trim();
    const modalDescriptionRaw = String(item.modalDescription || description).trim();
    const deliveryType = resolveDeliveryType(item.deliveryType, item.deliveryMethod, tags);
    const sub = [planLabel, deliveryLabel, durationLabel].filter(Boolean).join(" • ");
    const term = getAiOrderModalServiceConfig(serviceKey).displayName || getServicePlanLabel(serviceKey, planKey) || "ChatGPT";

    return (
      '<div class="price-card service-checkout-card"' +
      ' data-product="' + escapeHtml(product) + '"' +
      ' data-product-id="' + escapeHtml(productId) + '"' +
      ' data-title="' + escapeHtml(title) + '"' +
      ' data-sub="' + escapeHtml(sub) + '"' +
      ' data-term="' + escapeHtml(term) + '"' +
      ' data-description="' + escapeHtml(description) + '"' +
      ' data-modal-description="' + escapeHtml(encodeURIComponent(modalDescriptionRaw)) + '"' +
      ' data-price="' + escapeHtml(price) + '"' +
      ' data-currency="' + escapeHtml(currency) + '"' +
      ' data-delivery-type="' + escapeHtml(deliveryType) + '"' +
      ' data-activation-variant="' + escapeHtml(item.activationVariant || "") + '"' +
      ' data-service-key="' + escapeHtml(normalizeAiServiceKey(serviceKey)) + '"' +
      ' data-plan-key="' + escapeHtml(planKey) + '"' +
      ' data-delivery-key="' + escapeHtml(deliveryKey) + '"' +
      ' data-duration-key="' + escapeHtml(durationKey) + '"' +
      ' data-badge="">' +
        '<div class="service-checkout-card__summary">' +
          '<div>' +
            '<span class="service-checkout-card__label">' + escapeHtml(isEnPage ? "Selected plan" : "Выбранный тариф") + "</span>" +
            '<strong>' + escapeHtml(planTitle) + "</strong>" +
          "</div>" +
          '<div>' +
            '<span class="service-checkout-card__label">' + escapeHtml(isEnPage ? "Delivery" : "Способ доставки") + "</span>" +
            '<strong>' + escapeHtml(deliveryLabel) + "</strong>" +
          "</div>" +
          '<div>' +
            '<span class="service-checkout-card__label">' + escapeHtml(isEnPage ? "Duration" : "Длительность") + "</span>" +
            '<strong>' + escapeHtml(durationLabel) + "</strong>" +
          "</div>" +
        "</div>" +
        '<button type="button" class="buy-btn pay-now-btn" data-product="' + escapeHtml(product) + '" data-sub="' + escapeHtml(sub) + '" data-title="' + escapeHtml(title) + '" data-term="' + escapeHtml(term) + '" data-price="' + escapeHtml(price) + '" data-currency="' + escapeHtml(currency) + '" data-service-key="' + escapeHtml(normalizeAiServiceKey(serviceKey)) + '" data-plan-key="' + escapeHtml(planKey) + '">' + escapeHtml(isEnPage ? "Buy" : "Купить") + "</button>" +
      "</div>"
    );
  }

  function isChatGptOrderModalPlanKey(planKey) {
    return CHATGPT_ORDER_MODAL_PLAN_KEYS.has(String(planKey || "").trim());
  }

  function isClaudeOrderModalPlanKey(planKey) {
    return CLAUDE_ORDER_MODAL_PLAN_KEYS.has(String(planKey || "").trim());
  }

  function isGrokOrderModalPlanKey(planKey) {
    const key = String(planKey || "").trim();
    if (GROK_ORDER_MODAL_PLAN_KEYS.has(key)) return true;
    return /^\d+m$/i.test(key);
  }

  function isVpnOrderModalPlanKey(planKey) {
    const key = String(planKey || "").trim();
    if (VPN_ORDER_MODAL_PLAN_KEYS.has(key)) return true;
    return /^\d+m$/i.test(key);
  }

  function isAiOrderModalServiceKey(serviceKey) {
    return AI_ORDER_MODAL_SERVICE_KEYS.has(normalizeAiServiceKey(serviceKey));
  }

  function isAiOrderModalPlanKey(serviceKey, planKey) {
    const key = normalizeAiServiceKey(serviceKey);
    if (key === "chatgpt") return isChatGptOrderModalPlanKey(planKey);
    if (key === "claude") return isClaudeOrderModalPlanKey(planKey);
    if (key === "grok") return isGrokOrderModalPlanKey(planKey);
    if (key === "vpn") return isVpnOrderModalPlanKey(planKey);
    return false;
  }

  function getAiOrderModalServiceConfig(serviceKey) {
    const key = normalizeAiServiceKey(serviceKey);
    return AI_ORDER_MODAL_SERVICE_CONFIG[key] || AI_ORDER_MODAL_SERVICE_CONFIG.chatgpt;
  }

  function getAiOrderModalSummaryTitle(serviceName, planLabel) {
    const safeServiceName = String(serviceName || "").trim();
    const safePlanLabel = String(planLabel || "").trim();
    if (!safePlanLabel || safePlanLabel.toLowerCase() === safeServiceName.toLowerCase()) return safeServiceName;
    if (safePlanLabel.toLowerCase().startsWith(safeServiceName.toLowerCase())) return safePlanLabel;
    return [safeServiceName, safePlanLabel].filter(Boolean).join(" ");
  }

  function isChatGptGoOrderItem(item, serviceKey) {
    const key = normalizeAiServiceKey(serviceKey);
    return isAiOrderModalServiceKey(key) && isAiOrderModalPlanKey(key, getServicePlanKey(item, key));
  }

  function isChatGptGoOrderTrigger(card, item) {
    const serviceKey = normalizeAiServiceKey(
      item?.serviceKey || (card && card.getAttribute("data-service-key")) || getServicePageKey()
    );
    const planKey = String(item?.planKey || getServicePlanKey(item, serviceKey) || (card && card.getAttribute("data-plan-key"))).trim();
    return isAiOrderModalServiceKey(serviceKey) && isAiOrderModalPlanKey(serviceKey, planKey);
  }

  function resolveCurrentServiceCheckoutItem(card, fallbackItem) {
    const fallback = fallbackItem || getCardItem(card);
    if (!card || !servicePageRootEl || !servicePlansGridEl || !servicePlansGridEl.contains(card)) return fallback;

    const serviceKey = normalizeAiServiceKey(fallback?.serviceKey || card.getAttribute("data-service-key") || getServicePageKey());
    if (!isServiceConstructorPage() || !isAiOrderModalServiceKey(serviceKey)) return fallback;

    const allItems = sortServicePageItems(serviceKey, servicePageItems);
    const selectedItem = filterServicePageItems(allItems, serviceKey)[0];
    if (!selectedItem) return fallback;

    return {
      ...selectedItem,
      promoCode: getCardPromoCode(card),
    };
  }

  function readChatGptGoOrderDraft() {
    try {
      const parsed = safeParse(localStorage.getItem(CHATGPT_GO_ORDER_KEY) || "{}", {});
      if (!parsed || typeof parsed !== "object") return {};
      const savedAt = Number(parsed.savedAt || 0);
      if (!savedAt || Date.now() - savedAt >= CHATGPT_GO_ORDER_TTL_MS) {
        localStorage.removeItem(CHATGPT_GO_ORDER_KEY);
        return {};
      }
      const data = parsed.data && typeof parsed.data === "object" ? parsed.data : {};
      return data && typeof data === "object" ? data : {};
    } catch (_) {
      return {};
    }
  }

  function clearChatGptGoOrderDraft() {
    try {
      localStorage.removeItem(CHATGPT_GO_ORDER_KEY);
    } catch (_) {
      // Ignore storage cleanup errors.
    }
  }

  function saveChatGptGoOrderDraft(order) {
    if (!order || typeof order !== "object") return;
    const safeOrder = {
      contactEmail: String(order.contactEmail || "").trim(),
      telegram: String(order.telegram || "").trim(),
      isGift: Boolean(order.isGift),
      giftSender: String(order.giftSender || "").trim(),
      giftRecipient: String(order.giftRecipient || "").trim(),
      giftDeliveryMethod: String(order.giftDeliveryMethod || "").trim(),
      giftRecipientContact: String(order.giftRecipientContact || "").trim(),
      giftSendDate: String(order.giftSendDate || "").trim(),
      giftSendTime: String(order.giftSendTime || "").trim(),
      giftMessage: String(order.giftMessage || "").trim(),
      accountStatus: String(order.accountStatus || "has_account").trim(),
      serviceLogin: "",
      servicePassword: "",
      cameByRecommendation: Boolean(order.cameByRecommendation),
      referrerContact: String(order.referrerContact || "").trim(),
      orderComment: String(order.orderComment || "").trim(),
      paymentMethod: normalizeChatGptGoPaymentChoice(order.paymentMethod || "enot"),
    };
    try {
      localStorage.setItem(CHATGPT_GO_ORDER_KEY, JSON.stringify({ savedAt: Date.now(), data: safeOrder }));
    } catch (_) {
      // Ignore storage write errors.
    }
  }

  function getChatGptGoPromoContextKey(item, promoCode) {
    const productId = String(item?.productId || item?.id || "").trim();
    return [normalizePromoCodeInput(promoCode), productId, "1"].join("|");
  }

  function getChatGptGoDiscount(item, promoCode) {
    const normalized = normalizePromoCodeInput(promoCode);
    if (!normalized || promoValidationState !== "valid") return 0;
    if (promoValidationContextKey !== getChatGptGoPromoContextKey(item, normalized)) return 0;
    return Math.min(Math.max(0, toAmount(item?.price)), Math.max(0, toAmount(promoDiscountAmount)));
  }

  function getChatGptGoPaymentProvider(paymentMethod) {
    const method = String(paymentMethod || "").trim().toLowerCase();
    if (method === "lava" || method === "crypto") return "lava";
    if (method === "enot" || method === "card") return "enot";
    return "enot";
  }

  function normalizeChatGptGoPaymentChoice(value) {
    const method = String(value || "").trim().toLowerCase();
    if (method === "lava" || method === "crypto") return "lava";
    return "enot";
  }

  function escapeCssIdentifier(value) {
    const raw = String(value || "");
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(raw);
    return raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function getChatGptGoOrderField(form, name) {
    if (!form || !name) return null;
    return form.querySelector('[name="' + escapeCssIdentifier(name) + '"]');
  }

  function getChatGptGoCheckedValue(form, name) {
    const checked = form ? form.querySelector('input[name="' + escapeCssIdentifier(name) + '"]:checked') : null;
    return checked ? String(checked.value || "").trim() : "";
  }

  function setChatGptGoFieldError(form, name, message) {
    const field = getChatGptGoOrderField(form, name);
    const errorEl = form ? form.querySelector('[data-chatgpt-go-error-for="' + escapeCssIdentifier(name) + '"]') : null;
    if (field) {
      field.classList.toggle("is-invalid", Boolean(message));
      field.setAttribute("aria-invalid", message ? "true" : "false");
    }
    if (errorEl) errorEl.textContent = message || "";
  }

  function clearChatGptGoErrors(form) {
    if (!form) return;
    form.querySelectorAll(".chatgpt-order-field__control.is-invalid").forEach(field => {
      field.classList.remove("is-invalid");
      field.removeAttribute("aria-invalid");
    });
    form.querySelectorAll("[data-chatgpt-go-error-for]").forEach(errorEl => {
      errorEl.textContent = "";
    });
  }

  function setChatGptGoStatus(form, message, state) {
    const statusEl = form ? form.querySelector("[data-chatgpt-go-status]") : null;
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.classList.remove("is-error", "is-success", "is-loading");
    if (state === "error") statusEl.classList.add("is-error");
    if (state === "success") statusEl.classList.add("is-success");
    if (state === "loading") statusEl.classList.add("is-loading");
  }

  function setChatGptGoPromoMessage(form, message, state) {
    const msgEl = form ? form.querySelector("[data-chatgpt-go-promo-msg]") : null;
    if (!msgEl) return;
    msgEl.textContent = message || "";
    applyPromoMessageState(msgEl, state === "success" ? "valid" : state === "error" ? "invalid" : state);
    msgEl.classList.toggle("is-loading", state === "checking");
  }

  function setChatGptGoPromoBusy(form, busy) {
    const button = form ? form.querySelector("[data-chatgpt-go-promo-apply]") : null;
    if (!button) return;
    if (!button.dataset.originalText) button.dataset.originalText = button.textContent || "Применить";
    button.disabled = Boolean(busy);
    button.textContent = busy ? "Проверяем..." : button.dataset.originalText;
  }

  function setChatGptGoSubmitBusy(form, busy) {
    const button = form ? form.querySelector("[data-chatgpt-go-submit]") : null;
    if (!button) return;
    if (!button.dataset.originalText) button.dataset.originalText = button.textContent || "Оплатить";
    button.disabled = Boolean(busy);
    button.textContent = busy ? "Переходим к оплате..." : button.dataset.originalText;
  }

  function updateChatGptGoOrderTotals(form, item) {
    if (!form || !item) return;
    const promoInput = getChatGptGoOrderField(form, "promoCode");
    const promoCode = normalizePromoCodeInput(promoInput ? promoInput.value : activePromoCode);
    const basePrice = Math.max(0, toAmount(item.price));
    const discount = getChatGptGoDiscount(item, promoCode);
    const total = Math.max(0, Number((basePrice - discount).toFixed(2)));
    const currency = String(item.currency || "RUB").toUpperCase();
    const discountRow = form.querySelector("[data-chatgpt-go-summary-discount]");
    const totalNodes = form.querySelectorAll("[data-chatgpt-go-total]");
    const payButton = form.querySelector("[data-chatgpt-go-submit]");

    if (discountRow) {
      discountRow.hidden = discount <= 0;
      const valueNode = discountRow.querySelector("strong");
      if (valueNode) valueNode.textContent = "−" + formatPriceByCurrency(discount, currency);
    }
    totalNodes.forEach(node => {
      const valueNode = node.classList.contains("chatgpt-order-total") ? node.querySelector("strong") : null;
      if (valueNode) {
        valueNode.textContent = formatPriceByCurrency(total, currency);
      } else {
        node.textContent = formatPriceByCurrency(total, currency);
      }
    });
    if (payButton && !chatGptGoOrderCheckoutInProgress) {
      payButton.textContent = "Оформить заказ";
      payButton.dataset.originalText = payButton.textContent;
    }
  }

  async function applyChatGptGoPromoCode(form, item, options = {}) {
    if (!form || !item) return false;
    const promoInput = getChatGptGoOrderField(form, "promoCode");
    const normalized = normalizePromoCodeInput(promoInput ? promoInput.value : "");
    const productId = String(item.productId || item.id || "").trim();
    const silent = Boolean(options && options.silent);

    if (promoInput && promoInput.value !== normalized) promoInput.value = normalized;
    setActivePromoCode(normalized, { skipValidation: true });

    if (!normalized) {
      promoValidationState = "idle";
      promoDiscountAmount = 0;
      promoValidationContextKey = "";
      setChatGptGoPromoMessage(form, "", "idle");
      updateChatGptGoOrderTotals(form, item);
      return true;
    }

    if (!productId) {
      promoValidationState = "invalid";
      promoDiscountAmount = 0;
      promoValidationContextKey = getChatGptGoPromoContextKey(item, normalized);
      setChatGptGoPromoMessage(form, "Товар устарел. Обновите страницу и выберите тариф заново.", "error");
      updateChatGptGoOrderTotals(form, item);
      return false;
    }

    setChatGptGoPromoBusy(form, true);
    promoValidationState = "checking";
    promoValidationContextKey = getChatGptGoPromoContextKey(item, normalized);
    if (!silent) setChatGptGoPromoMessage(form, TEXT.promoChecking, "checking");
    updateChatGptGoOrderTotals(form, item);

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
        promoValidationState = "valid";
        promoDiscountAmount = Math.max(0, toAmount(payload.discountAmount));
        promoValidationContextKey = getChatGptGoPromoContextKey(item, normalized);
        const discount = getChatGptGoDiscount(item, normalized);
        setChatGptGoPromoMessage(
          form,
          TEXT.promoAccepted + (discount > 0 ? " (−" + formatPriceByCurrency(discount, String(item.currency || "RUB")) + ")" : ""),
          "success"
        );
        trackAnalyticsEvent("promo_validate_success", {
          source: "chatgpt_go_order",
          code: normalized.slice(0, 32),
          discount,
          product_id: productId,
        });
        updateChatGptGoOrderTotals(form, item);
        return true;
      }

      promoValidationState = "invalid";
      promoDiscountAmount = 0;
      promoValidationContextKey = getChatGptGoPromoContextKey(item, normalized);
      setChatGptGoPromoMessage(form, TEXT.promoInvalid, "error");
      trackAnalyticsEvent("promo_validate_fail", {
        source: "chatgpt_go_order",
        code: normalized.slice(0, 32),
        product_id: productId,
      });
      updateChatGptGoOrderTotals(form, item);
      return false;
    } catch (_) {
      promoValidationState = "invalid";
      promoDiscountAmount = 0;
      promoValidationContextKey = getChatGptGoPromoContextKey(item, normalized);
      setChatGptGoPromoMessage(form, TEXT.promoInvalid, "error");
      trackAnalyticsEvent("promo_validate_fail", {
        source: "chatgpt_go_order",
        code: normalized.slice(0, 32),
        product_id: productId,
      });
      updateChatGptGoOrderTotals(form, item);
      return false;
    } finally {
      setChatGptGoPromoBusy(form, false);
    }
  }

  function syncChatGptGoAccountUi(form) {
    if (!form) return;
    const accountStatus = getChatGptGoCheckedValue(form, "accountStatus") || "has_account";
    const accountFields = form.querySelector("[data-chatgpt-go-account-fields]");
    const passwordField = form.querySelector("[data-chatgpt-go-password-field]");
    const createNote = form.querySelector("[data-chatgpt-go-create-note]");
    const serviceLogin = getChatGptGoOrderField(form, "serviceLogin");
    const servicePassword = getChatGptGoOrderField(form, "servicePassword");
    const showCredentials = accountStatus !== "create_new";
    const showPassword = accountStatus === "has_account";

    if (accountFields) accountFields.hidden = !showCredentials;
    if (passwordField) passwordField.hidden = !showPassword;
    if (createNote) createNote.hidden = accountStatus !== "create_new";
    if (serviceLogin) {
      serviceLogin.disabled = !showCredentials;
      serviceLogin.required = showCredentials;
    }
    if (servicePassword) {
      servicePassword.disabled = !showPassword;
      servicePassword.required = showPassword;
    }
    const passwordToggle = form.querySelector("[data-chatgpt-go-password-toggle]");
    if (passwordToggle) {
      passwordToggle.disabled = !showPassword;
      if (!showPassword && servicePassword) {
        servicePassword.type = "password";
        passwordToggle.setAttribute("aria-pressed", "false");
        passwordToggle.setAttribute("aria-label", "Показать пароль");
        passwordToggle.setAttribute("title", "Показать пароль");
        const passwordIcon = passwordToggle.querySelector("[data-chatgpt-go-password-icon]");
        if (passwordIcon) passwordIcon.innerHTML = getChatGptGoPasswordIcon(false);
      }
    }
  }

  function validateChatGptGoOrder(form) {
    clearChatGptGoErrors(form);
    let valid = true;

    const email = String(getChatGptGoOrderField(form, "contactEmail")?.value || "").trim().toLowerCase();
    const telegram = String(getChatGptGoOrderField(form, "telegram")?.value || "").trim();
    const serviceLogin = String(getChatGptGoOrderField(form, "serviceLogin")?.value || "").trim();
    const servicePassword = String(getChatGptGoOrderField(form, "servicePassword")?.value || "").trim();
    const accountStatus = getChatGptGoCheckedValue(form, "accountStatus");
    const paymentMethod = getChatGptGoCheckedValue(form, "paymentMethod");
    const isGift = Boolean(getChatGptGoOrderField(form, "isGift")?.checked);

    if (!isValidEmail(email)) {
      setChatGptGoFieldError(form, "contactEmail", "Введите корректную почту.");
      valid = false;
    }
    if (!/^@[A-Za-z0-9_]{5,32}$/.test(telegram)) {
      setChatGptGoFieldError(form, "telegram", "Введите id telegram с @");
      valid = false;
    }

    if (isGift) {
      const giftSender = String(getChatGptGoOrderField(form, "giftSender")?.value || "").trim();
      const giftRecipient = String(getChatGptGoOrderField(form, "giftRecipient")?.value || "").trim();
      const giftDeliveryMethod = String(getChatGptGoOrderField(form, "giftDeliveryMethod")?.value || "").trim();
      const giftRecipientContact = String(getChatGptGoOrderField(form, "giftRecipientContact")?.value || "").trim();
      const giftSendDate = String(getChatGptGoOrderField(form, "giftSendDate")?.value || "").trim();
      const giftSendTime = String(getChatGptGoOrderField(form, "giftSendTime")?.value || "").trim();

      if (!giftSender) {
        setChatGptGoFieldError(form, "giftSender", "Укажите отправителя.");
        valid = false;
      }
      if (!giftRecipient) {
        setChatGptGoFieldError(form, "giftRecipient", "Укажите получателя.");
        valid = false;
      }
      if (!giftDeliveryMethod) {
        setChatGptGoFieldError(form, "giftDeliveryMethod", "Выберите способ доставки подарка.");
        valid = false;
      }
      if (!giftRecipientContact) {
        setChatGptGoFieldError(form, "giftRecipientContact", "Укажите контакт получателя.");
        valid = false;
      }
      if (giftSendDate && !giftSendTime) {
        setChatGptGoFieldError(form, "giftSendTime", "Укажите время по МСК или оставьте дату пустой.");
        valid = false;
      }
      if (!giftSendDate && giftSendTime) {
        setChatGptGoFieldError(form, "giftSendDate", "Укажите дату отправки или оставьте время пустым.");
        valid = false;
      }
    } else {
      const deliveryKey = String(form.getAttribute("data-delivery-key") || "link").trim();
      const needsAccountCredentials = deliveryKey === "login";
      if (needsAccountCredentials && !accountStatus) {
        setChatGptGoFieldError(form, "accountStatus", "Выберите вариант аккаунта.");
        valid = false;
      }
      if (needsAccountCredentials && accountStatus === "has_account") {
        if (!serviceLogin) {
          setChatGptGoFieldError(form, "serviceLogin", "Введите логин от сервиса.");
          valid = false;
        }
        if (!servicePassword) {
          setChatGptGoFieldError(form, "servicePassword", "Введите пароль или напишите «Восстановить».");
          valid = false;
        }
      }
      if (needsAccountCredentials && accountStatus === "apple_id" && !serviceLogin) {
        setChatGptGoFieldError(form, "serviceLogin", "Введите почту Apple ID или логин сервиса.");
        valid = false;
      }
    }
    if (!paymentMethod) {
      setChatGptGoFieldError(form, "paymentMethod", "Выберите способ оплаты.");
      valid = false;
    }

    return valid;
  }

  function collectChatGptGoOrder(form, item) {
    const promoInput = getChatGptGoOrderField(form, "promoCode");
    const promoCode = normalizePromoCodeInput(promoInput ? promoInput.value : activePromoCode);
    const basePrice = Math.max(0, toAmount(item.price));
    const discount = getChatGptGoDiscount(item, promoCode);
    const totalPrice = Math.max(0, Number((basePrice - discount).toFixed(2)));
    const deliveryKey = String(form.getAttribute("data-delivery-key") || "link").trim();
    const durationKey = String(form.getAttribute("data-duration-key") || "1m").trim();
    const serviceKey = normalizeAiServiceKey(form.getAttribute("data-service-key") || item.serviceKey || getServicePageKey() || "chatgpt");
    const serviceConfig = getAiOrderModalServiceConfig(serviceKey);
    const planKey = String(form.getAttribute("data-plan-key") || item.planKey || getServicePlanKey(item, serviceKey) || serviceConfig.fallbackPlan || "go").trim();
    const serviceDisplayName = serviceConfig.displayName || "ChatGPT";

    return {
      product: serviceDisplayName,
      plan: getServicePlanLabel(serviceKey, planKey),
      serviceKey,
      planKey,
      deliveryMethod: deliveryKey === "login" ? "login" : deliveryKey === "id" ? "id" : deliveryKey === "vpn" ? "vpn" : "link",
      duration: getServiceDurationLabel(durationKey),
      quantity: 1,
      basePrice,
      discount,
      totalPrice,
      contactEmail: String(getChatGptGoOrderField(form, "contactEmail")?.value || "").trim().toLowerCase(),
      telegram: String(getChatGptGoOrderField(form, "telegram")?.value || "").trim(),
      isGift: Boolean(getChatGptGoOrderField(form, "isGift")?.checked),
      giftSender: String(getChatGptGoOrderField(form, "giftSender")?.value || "").trim(),
      giftRecipient: String(getChatGptGoOrderField(form, "giftRecipient")?.value || "").trim(),
      giftDeliveryMethod: String(getChatGptGoOrderField(form, "giftDeliveryMethod")?.value || "").trim(),
      giftRecipientContact: String(getChatGptGoOrderField(form, "giftRecipientContact")?.value || "").trim(),
      giftSendDate: String(getChatGptGoOrderField(form, "giftSendDate")?.value || "").trim(),
      giftSendTime: String(getChatGptGoOrderField(form, "giftSendTime")?.value || "").trim(),
      giftMessage: String(getChatGptGoOrderField(form, "giftMessage")?.value || "").trim(),
      accountStatus: getChatGptGoCheckedValue(form, "accountStatus") || "has_account",
      serviceLogin: String(getChatGptGoOrderField(form, "serviceLogin")?.value || "").trim(),
      servicePassword: String(getChatGptGoOrderField(form, "servicePassword")?.value || "").trim(),
      cameByRecommendation: Boolean(getChatGptGoOrderField(form, "cameByRecommendation")?.checked),
      referrerContact: String(getChatGptGoOrderField(form, "referrerContact")?.value || "").trim(),
      orderComment: String(getChatGptGoOrderField(form, "orderComment")?.value || "").trim(),
      promoCode,
      paymentMethod: normalizeChatGptGoPaymentChoice(getChatGptGoCheckedValue(form, "paymentMethod") || "enot"),
    };
  }

  function getChatGptGoPasswordIcon(isVisible) {
    return isVisible
      ? '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M3.2 12s3.2-5.2 8.8-5.2S20.8 12 20.8 12 17.6 17.2 12 17.2 3.2 12 3.2 12Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>'
      : '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M3.2 12s3.2-5.2 8.8-5.2c1.3 0 2.5.28 3.57.72M20.8 12s-3.2 5.2-8.8 5.2c-1.28 0-2.45-.27-3.5-.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.8 4.8 19.2 19.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M10.45 10.45a2.4 2.4 0 0 0 3.1 3.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  }

  function renderChatGptPaymentOption(provider, name, caption, logoSrc, selectedMethod) {
    const isSelected = normalizeChatGptGoPaymentChoice(selectedMethod) === provider;
    return (
      '<label class="chatgpt-payment-option" role="radio" aria-checked="' + (isSelected ? "true" : "false") + '">' +
        '<input name="paymentMethod" type="radio" value="' + escapeHtml(provider) + '"' + (isSelected ? " checked" : "") + '>' +
        '<span class="chatgpt-payment-logo"><img src="' + escapeHtml(logoSrc) + '" alt="" aria-hidden="true" loading="lazy" decoding="async"></span>' +
        '<span class="chatgpt-payment-text"><strong class="chatgpt-payment-name">' + escapeHtml(name) + '</strong><small class="chatgpt-payment-caption">' + escapeHtml(caption) + '</small></span>' +
        '<span class="chatgpt-payment-check" aria-hidden="true"></span>' +
      '</label>'
    );
  }

  function syncChatGptGoPaymentAria(form) {
    if (!form) return;
    form.querySelectorAll(".chatgpt-payment-option").forEach(option => {
      const input = option.querySelector('input[name="paymentMethod"]');
      option.setAttribute("aria-checked", input && input.checked ? "true" : "false");
    });
  }

  function buildChatGptGoCheckoutDetails(order, item) {
    const safeOrder = order && typeof order === "object" ? order : {};
    const safeItem = item && typeof item === "object" ? item : {};
    const serviceKey = normalizeAiServiceKey(safeOrder.serviceKey || safeItem.serviceKey || getServicePageKey() || "chatgpt");
    const serviceConfig = getAiOrderModalServiceConfig(serviceKey);
    const isGift = Boolean(safeOrder.isGift);
    return {
      source: `${serviceKey}-order-card`,
      capturedAt: new Date().toISOString(),
      product: {
        id: String(safeItem.productId || safeItem.id || "").trim(),
        title: String(safeItem.title || safeItem.product || serviceConfig.fallbackTitle || serviceConfig.displayName || "ChatGPT Go").trim(),
        price: Math.max(0, toAmount(safeItem.price)),
        currency: String(safeItem.currency || "RUB").toUpperCase(),
      },
      selection: {
        product: String(safeOrder.product || serviceConfig.displayName || "ChatGPT").trim(),
        plan: String(safeOrder.plan || getServicePlanLabel(serviceKey, safeOrder.planKey || safeItem.planKey || serviceConfig.fallbackPlan || "go")).trim(),
        serviceKey,
        planKey: String(safeOrder.planKey || safeItem.planKey || serviceConfig.fallbackPlan || "").trim(),
        activationVariant: String(safeItem.activationVariant || "").trim() || null,
        deliveryMethod: String(safeOrder.deliveryMethod || "").trim(),
        deliveryKey: String(safeItem.deliveryKey || safeOrder.deliveryMethod || "").trim(),
        duration: String(safeOrder.duration || "").trim(),
        quantity: 1,
        basePrice: Math.max(0, toAmount(safeOrder.basePrice)),
        discount: Math.max(0, toAmount(safeOrder.discount)),
        totalPrice: Math.max(0, toAmount(safeOrder.totalPrice)),
        paymentMethod: normalizeChatGptGoPaymentChoice(safeOrder.paymentMethod || "enot"),
        promoCode: normalizePromoCodeInput(safeOrder.promoCode || "") || null,
      },
      contact: {
        email: String(safeOrder.contactEmail || "").trim().toLowerCase(),
        telegram: String(safeOrder.telegram || "").trim(),
      },
      gift: isGift
        ? {
            isGift: true,
            sender: String(safeOrder.giftSender || "").trim(),
            recipient: String(safeOrder.giftRecipient || "").trim(),
            deliveryMethod: String(safeOrder.giftDeliveryMethod || "").trim(),
            recipientContact: String(safeOrder.giftRecipientContact || "").trim(),
            sendDate: String(safeOrder.giftSendDate || "").trim(),
            sendTime: String(safeOrder.giftSendTime || "").trim(),
            message: String(safeOrder.giftMessage || "").trim(),
            certificateDesign: String(safeOrder.giftCertificateDesign || "").trim(),
          }
        : { isGift: false },
      account: {
        status: String(safeOrder.accountStatus || "").trim(),
        login: String(safeOrder.serviceLogin || "").trim(),
        password: String(safeOrder.servicePassword || "").trim(),
      },
      recommendation: {
        cameByRecommendation: Boolean(safeOrder.cameByRecommendation),
        referrerContact: String(safeOrder.referrerContact || "").trim(),
      },
      comment: String(safeOrder.orderComment || "").trim(),
    };
  }

  async function submitChatGptGoOrder(form) {
    if (!form || chatGptGoOrderCheckoutInProgress) return;
    const item = getCardItem(form);
    if (!item || !item.productId) {
      setChatGptGoStatus(form, TEXT.checkoutProductMissing, "error");
      return;
    }

    if (!validateChatGptGoOrder(form)) {
      setChatGptGoStatus(form, "Проверьте обязательные поля.", "error");
      const firstInvalid = form.querySelector(".is-invalid");
      if (firstInvalid && typeof firstInvalid.focus === "function") firstInvalid.focus();
      return;
    }

    const promoInput = getChatGptGoOrderField(form, "promoCode");
    const promoCode = normalizePromoCodeInput(promoInput ? promoInput.value : "");
    if (promoCode) {
      const promoOk = await applyChatGptGoPromoCode(form, item, { silent: true });
      if (!promoOk) {
        setChatGptGoStatus(form, "Промокод не применён. Исправьте его или очистите поле.", "error");
        if (promoInput && typeof promoInput.focus === "function") promoInput.focus();
        return;
      }
    }

    const order = collectChatGptGoOrder(form, item);
    saveChatGptGoOrderDraft(order);
    window.gptishkaLastChatGptGoOrder = order;
    const orderServiceKey = normalizeAiServiceKey(order.serviceKey || item.serviceKey || form.getAttribute("data-service-key") || getServicePageKey() || "chatgpt");

    try {
      localStorage.setItem("checkout_email", order.contactEmail);
      localStorage.setItem("gptishka_site_checkout_context", JSON.stringify({
        source: `${orderServiceKey}_order`,
        serviceKey: orderServiceKey,
        productId: String(item.productId || item.id || ""),
        planKey: String(order.planKey || item.planKey || "go"),
        deliveryKey: String(item.deliveryKey || "link"),
        createdAt: Date.now(),
      }));
      if (headerCartEmailInputEl) headerCartEmailInputEl.value = order.contactEmail;
      if (cartEmailInputEl) cartEmailInputEl.value = order.contactEmail;
    } catch (_) {
      // Ignore storage write errors.
    }

    const provider = getChatGptGoPaymentProvider(order.paymentMethod);
    savePaymentMethod(provider);
    syncPaymentMethodUi();
    chatGptGoOrderCheckoutInProgress = true;
    setChatGptGoSubmitBusy(form, true);
    setChatGptGoStatus(form, "Создаём безопасную оплату...", "loading");

    try {
      await startBackendCheckout(item, 1, order.promoCode, provider, buildChatGptGoCheckoutDetails(order, item));
    } catch (error) {
      setChatGptGoStatus(form, resolveCheckoutErrorMessage(error), "error");
      setChatGptGoSubmitBusy(form, false);
      chatGptGoOrderCheckoutInProgress = false;
    }
  }

  function renderChatGptGoOrderCard(item, serviceKey) {
    const product = String(item.product || item.id || "product").trim();
    const productId = String(item.id || item.productId || "").trim();
    const resolvedServiceKey = normalizeAiServiceKey(item.serviceKey || serviceKey || "chatgpt");
    const serviceConfig = getAiOrderModalServiceConfig(resolvedServiceKey);
    const serviceDisplayName = serviceConfig.displayName || "ChatGPT";
    const title = String(item.title || product || serviceConfig.fallbackTitle || serviceDisplayName).trim();
    const price = Math.max(0, toAmount(item.price));
    const currency = String(item.currency || "RUB").toUpperCase();
    const planKey = String(item.planKey || getServicePlanKey(item, resolvedServiceKey) || serviceConfig.fallbackPlan || "go").trim();
    const deliveryKey = String(item.deliveryKey || getServiceDeliveryKey(item) || "link").trim();
    const durationKey = String(item.durationKey || getServiceDurationKey(item) || "1m").trim();
    const planLabel = getServicePlanLabel(resolvedServiceKey, planKey);
    const deliveryLabel = getServiceDeliveryDisplayLabel(resolvedServiceKey, deliveryKey);
    const durationLabel = getServiceDurationLabel(durationKey);
    const description = String(item.description || "").trim();
    const modalDescriptionRaw = String(item.modalDescription || description).trim();
    const deliveryType = resolveDeliveryType(item.deliveryType, item.deliveryMethod, Array.isArray(item.tags) ? item.tags : []);
    const sub = [planLabel, deliveryLabel, durationLabel].filter(Boolean).join(" • ");
    const summaryPlanLabel = planLabel && planLabel !== serviceDisplayName ? planLabel : "";
    const summaryTitle = resolvedServiceKey === "claude" || resolvedServiceKey === "grok" || resolvedServiceKey === "vpn"
      ? String(title || getAiOrderModalSummaryTitle(serviceDisplayName, summaryPlanLabel || planLabel)).trim()
      : getAiOrderModalSummaryTitle(serviceDisplayName, summaryPlanLabel || planLabel);
    const summaryDescription = [durationLabel, deliveryLabel].filter(Boolean).join(" · ");
    const draft = readChatGptGoOrderDraft();
    const savedEmail = String(draft.contactEmail || localStorage.getItem("checkout_email") || "").trim().toLowerCase();
    const savedTelegram = String(draft.telegram || "").trim();
    const savedGift = Boolean(draft.isGift);
    const savedGiftDeliveryMethod = String(draft.giftDeliveryMethod || "").trim();
    const savedAccountStatus = String(draft.accountStatus || "has_account").trim();
    const savedRecommendation = Boolean(draft.cameByRecommendation);
    const savedPaymentMethod = normalizeChatGptGoPaymentChoice(draft.paymentMethod || activePaymentMethod || "enot");
    const savedPromo = normalizePromoCodeInput(activePromoCode || "");
    const discount = getChatGptGoDiscount({ ...item, productId }, savedPromo);
    const total = Math.max(0, Number((price - discount).toFixed(2)));
    const format = value => formatPriceByCurrency(value, currency);
    const todayIso = new Date().toISOString().slice(0, 10);
    const checked = (value, current) => value === current ? " checked" : "";
    const selected = (value, current) => value === current ? " selected" : "";
    const boolChecked = value => value ? " checked" : "";
    const showAccountFields = savedAccountStatus !== "create_new";
    const showPassword = savedAccountStatus === "has_account";
    const accountServiceName = serviceDisplayName;
    const serviceLogo = serviceConfig.logo || "/assets/img/services/chatgpt-card.png";
    return (
      '<form class="price-card service-checkout-card chatgpt-order-card" data-chatgpt-go-order' +
      ' data-product="' + escapeHtml(product) + '"' +
      ' data-product-id="' + escapeHtml(productId) + '"' +
      ' data-title="' + escapeHtml(title) + '"' +
      ' data-sub="' + escapeHtml(sub) + '"' +
      ' data-term="' + escapeHtml(serviceDisplayName) + '"' +
      ' data-description="' + escapeHtml(description) + '"' +
      ' data-modal-description="' + escapeHtml(encodeURIComponent(modalDescriptionRaw)) + '"' +
      ' data-price="' + escapeHtml(price) + '"' +
      ' data-currency="' + escapeHtml(currency) + '"' +
      ' data-delivery-type="' + escapeHtml(deliveryType) + '"' +
      ' data-activation-variant="' + escapeHtml(item.activationVariant || "") + '"' +
      ' data-service-key="' + escapeHtml(resolvedServiceKey) + '"' +
      ' data-plan-key="' + escapeHtml(planKey) + '"' +
      ' data-delivery-key="' + escapeHtml(deliveryKey) + '"' +
      ' data-duration-key="' + escapeHtml(durationKey) + '"' +
      ' data-badge="">' +
        '<div class="chatgpt-order-scroll">' +
          '<section class="chatgpt-order-section chatgpt-order-section--summary chatgpt-order-summary-card chatgpt-order-header">' +
            '<div class="chatgpt-order-summary-card__top chatgpt-order-main">' +
              '<img class="chatgpt-order-item__icon chatgpt-order-summary-card__logo chatgpt-order-icon" src="' + escapeHtml(serviceLogo) + '" alt="' + escapeHtml(serviceDisplayName) + '" loading="lazy" decoding="async">' +
              '<div class="chatgpt-order-summary-card__body chatgpt-order-info"><h3 class="chatgpt-order-title" id="chatGptGoOrderModalTitle">' + escapeHtml(summaryTitle) + '</h3><p class="chatgpt-order-summary-card__meta chatgpt-order-meta">' + escapeHtml(summaryDescription) + '</p><div class="chatgpt-order-summary-card__chips chatgpt-order-chips"><span>' + escapeHtml(planLabel) + '</span><span>' + escapeHtml(durationLabel) + '</span><span>' + escapeHtml(deliveryLabel) + '</span></div></div>' +
            '</div>' +
            '<div class="chatgpt-order-summary-card__price chatgpt-order-total"><span>Итого</span><strong data-chatgpt-go-total>' + escapeHtml(format(total)) + '</strong></div>' +
            '<div class="chatgpt-order-summary-lines"><div data-chatgpt-go-summary-discount' + (discount > 0 ? "" : " hidden") + '><span>Скидка:</span><strong>−' + escapeHtml(format(discount)) + '</strong></div></div>' +
          '</section>' +
          '<section class="chatgpt-order-section"><div class="chatgpt-order-section__head"><h4 class="chatgpt-order-section-title">Контакты</h4><p>Для статуса заказа и связи</p></div><div class="chatgpt-order-grid"><label class="chatgpt-order-field"><span>Почта</span><small>Нужна для связи по заказу</small><input class="chatgpt-order-field__control" name="contactEmail" type="email" autocomplete="email" placeholder="name@email.com" value="' + escapeHtml(savedEmail) + '" required></label><label class="chatgpt-order-field"><span>Telegram</span><small>Введите id telegram с @</small><input class="chatgpt-order-field__control" name="telegram" type="text" autocomplete="off" placeholder="@username" value="' + escapeHtml(savedTelegram) + '" required></label><p class="chatgpt-order-error" data-chatgpt-go-error-for="contactEmail"></p><p class="chatgpt-order-error" data-chatgpt-go-error-for="telegram"></p></div></section>' +
          (deliveryKey === "login" ? '<section class="chatgpt-order-section" data-chatgpt-go-account-section' + (savedGift ? " hidden" : "") + '><div class="chatgpt-order-section__head"><h4 class="chatgpt-order-section-title">Данные для подключения</h4><p>Заполняйте по выбранному способу</p></div>' +
            '<div class="chatgpt-order-question">У вас уже есть аккаунт ChatGPT?</div><div class="chatgpt-order-options chatgpt-order-account-options"><label><input name="accountStatus" type="radio" value="has_account"' + checked("has_account", savedAccountStatus) + '><span><strong>Да, у меня есть почта и пароль от ChatGPT</strong><small>Выберите, если обычно входите в ChatGPT через email и пароль.</small></span></label><label><input name="accountStatus" type="radio" value="apple_id"' + checked("apple_id", savedAccountStatus) + '><span><strong>Да, я вхожу через Apple</strong><small>Выберите, если нажимаете кнопку «Continue with Apple» / «Войти через Apple». Пароль от ChatGPT не нужен.</small></span></label><label><input name="accountStatus" type="radio" value="create_new"' + checked("create_new", savedAccountStatus) + '><span><strong>Нет, аккаунта ChatGPT у меня нет</strong><small>Мы создадим новый аккаунт за вас. Используем почту, которую вы указали выше.</small></span></label></div><p class="chatgpt-order-error" data-chatgpt-go-error-for="accountStatus"></p>' +
            '<div class="chatgpt-order-grid" data-chatgpt-go-account-fields' + (showAccountFields ? "" : " hidden") + '><label class="chatgpt-order-field"><span>Почта или логин ' + escapeHtml(accountServiceName) + '</span><small>Нужен для подключения</small><input class="chatgpt-order-field__control" name="serviceLogin" type="text" autocomplete="username" placeholder="name@email.ru" value=""' + (showAccountFields ? "" : " disabled") + '></label><label class="chatgpt-order-field" data-chatgpt-go-password-field' + (showPassword ? "" : " hidden") + '><span>Пароль от ' + escapeHtml(accountServiceName) + '</span><small>Если не помните, напишите «Восстановить»</small><span class="chatgpt-order-password-wrap"><input class="chatgpt-order-field__control" name="servicePassword" type="password" autocomplete="current-password" placeholder="password123" value=""' + (showPassword ? "" : " disabled") + '><button type="button" class="chatgpt-order-password-toggle" data-chatgpt-go-password-toggle aria-label="Показать пароль" title="Показать пароль" aria-pressed="false"' + (showPassword ? "" : " disabled") + '><span aria-hidden="true" data-chatgpt-go-password-icon>' + getChatGptGoPasswordIcon(false) + '</span></button></span></label><p class="chatgpt-order-error" data-chatgpt-go-error-for="serviceLogin"></p><p class="chatgpt-order-error" data-chatgpt-go-error-for="servicePassword"></p></div>' +
            '<div class="chatgpt-order-info-alert chatgpt-order-create-note" data-chatgpt-go-create-note' + (savedAccountStatus === "create_new" ? "" : " hidden") + '><p>(!) При создании нового аккаунта будет использоваться указанная выше почта</p></div></section>' : '') +
          '<section class="chatgpt-order-section chatgpt-order-soft-actions"><div class="chatgpt-order-section__head"><h4 class="chatgpt-order-section-title">Дополнительно</h4></div>' +
            '<label class="chatgpt-order-soft-action"><span><strong>Оформить в подарок</strong><small>Покажем поля получателя после включения</small></span><input name="isGift" type="checkbox"' + boolChecked(savedGift) + '><i></i></label><div class="chatgpt-order-gift-extra"' + (savedGift ? "" : " hidden") + ' data-chatgpt-go-gift-extra><div class="chatgpt-order-gift-note"><strong>🎁 Хотите устроить сюрприз?</strong><p>Вы выбираете подписку и указываете получателя. Мы сами свяжемся с ним, уточним данные и подключим подписку без передачи логинов и паролей.</p></div><div class="chatgpt-order-gift-panel"><h4 class="chatgpt-order-section-title">Данные подарка</h4><div class="chatgpt-order-grid"><label class="chatgpt-order-field"><span>Отправитель</span><small>Укажем в подарке</small><input class="chatgpt-order-field__control" name="giftSender" type="text" autocomplete="name" placeholder="Никита" value="' + escapeHtml(String(draft.giftSender || "")) + '"></label><label class="chatgpt-order-field"><span>Получатель</span><small>Укажем в подарке</small><input class="chatgpt-order-field__control" name="giftRecipient" type="text" autocomplete="off" placeholder="Артём" value="' + escapeHtml(String(draft.giftRecipient || "")) + '"></label><p class="chatgpt-order-error" data-chatgpt-go-error-for="giftSender"></p><p class="chatgpt-order-error" data-chatgpt-go-error-for="giftRecipient"></p></div><label class="chatgpt-order-field chatgpt-order-field--full"><span>Где прислать подарок</span><select class="chatgpt-order-field__control" name="giftDeliveryMethod"><option value=""' + selected("", savedGiftDeliveryMethod) + '>Выберите способ</option><option value="telegram"' + selected("telegram", savedGiftDeliveryMethod) + '>Telegram</option><option value="vk"' + selected("vk", savedGiftDeliveryMethod) + '>VK</option><option value="whatsapp"' + selected("whatsapp", savedGiftDeliveryMethod) + '>WhatsApp</option><option value="email"' + selected("email", savedGiftDeliveryMethod) + '>Электронная почта</option></select></label><p class="chatgpt-order-error" data-chatgpt-go-error-for="giftDeliveryMethod"></p><label class="chatgpt-order-field chatgpt-order-field--full"><span>Контакт получателя</span><input class="chatgpt-order-field__control" name="giftRecipientContact" type="text" autocomplete="off" placeholder="@telegram / vk.com/name / WhatsApp / name@mail.ru" value="' + escapeHtml(String(draft.giftRecipientContact || "")) + '"></label><p class="chatgpt-order-error" data-chatgpt-go-error-for="giftRecipientContact"></p><div class="chatgpt-order-grid"><label class="chatgpt-order-field"><span>Дата отправки</span><input class="chatgpt-order-field__control" name="giftSendDate" type="date" min="' + escapeHtml(todayIso) + '" value="' + escapeHtml(String(draft.giftSendDate || "")) + '"></label><label class="chatgpt-order-field"><span>Время отправки (МСК)</span><input class="chatgpt-order-field__control" name="giftSendTime" type="time" value="' + escapeHtml(String(draft.giftSendTime || "")) + '"></label><p class="chatgpt-order-error" data-chatgpt-go-error-for="giftSendDate"></p><p class="chatgpt-order-error" data-chatgpt-go-error-for="giftSendTime"></p></div><p class="chatgpt-order-gift-time-note"><strong>Подарки отправляем с 10:00 до 20:00 МСК.</strong><br>Ставьте время минимум +4 часа от оформления. Если заказ ночью, доставка должна быть не раньше 14:00.</p><label class="chatgpt-order-field chatgpt-order-field--full"><span>Сообщение получателю</span><small>Пришлём вместе с подарком</small><textarea class="chatgpt-order-field__control" name="giftMessage" rows="4" placeholder="Напишите поздравление или пожелание">' + escapeHtml(String(draft.giftMessage || "")) + '</textarea></label></div></div>' +
            '<label class="chatgpt-order-soft-action"><span><strong>Пришёл по рекомендации</strong><small>Добавим контакт друга для скидки</small></span><input name="cameByRecommendation" type="checkbox"' + boolChecked(savedRecommendation) + '><i></i></label><div class="chatgpt-order-referral-extra"' + (savedRecommendation ? "" : " hidden") + ' data-chatgpt-go-referral-extra><strong>Кто пригласил</strong><p>Пришли от друга? Дайте ему 10% скидки за ваш первый заказ — напишите его контакт ниже.</p><input class="chatgpt-order-field__control" name="referrerContact" type="text" autocomplete="off" placeholder="@telegram" value="' + escapeHtml(String(draft.referrerContact || "")) + '"></div>' +
            '<details class="chatgpt-order-collapsible"' + (String(draft.orderComment || "").trim() ? " open" : "") + '><summary>Комментарий к заказу</summary><label class="chatgpt-order-field"><span>Комментарий</span><textarea class="chatgpt-order-field__control" name="orderComment" rows="3" placeholder="Например: продление аккаунта, пожелания, детали по заказу">' + escapeHtml(String(draft.orderComment || "")) + '</textarea></label></details>' +
            '<details class="chatgpt-order-collapsible" data-chatgpt-go-promo-panel' + (savedPromo ? " open" : "") + '><summary>У меня есть промокод</summary><div class="chatgpt-order-promo"><input class="chatgpt-order-field__control" name="promoCode" type="text" autocomplete="off" placeholder="Введите промокод" value="' + escapeHtml(savedPromo) + '"><button type="button" class="btn secondary" data-chatgpt-go-promo-apply>Применить</button></div><p class="chatgpt-order-promo-msg" data-chatgpt-go-promo-msg></p></details></section>' +
          '<section class="chatgpt-order-section"><div class="chatgpt-order-section__head"><h4 class="chatgpt-order-section-title">Оплата</h4><p>Выберите платёжный шлюз</p></div><div class="chatgpt-order-payment chatgpt-payment-options" role="radiogroup" aria-label="Способ оплаты">' + renderChatGptPaymentOption("lava", "LAVA", "СБП 0% и карты 3.2%", "/assets/img/payment-lava.svg", savedPaymentMethod) + renderChatGptPaymentOption("enot", "ENOT", "Карты 3.2% и СБП 0%", "/assets/img/payment-enot.svg", savedPaymentMethod) + '</div><p class="chatgpt-order-error" data-chatgpt-go-error-for="paymentMethod"></p><details class="chatgpt-order-collapsible chatgpt-order-processing-details"><summary>Сроки выполнения заказа</summary><p>Мы обрабатываем заказы ежедневно с 10:00 до 20:00 по МСК. Среднее время ожидания — от 5 минут до 2 часов после оплаты. Если заказ оформлен ночью — подключим с утра. Максимальное время выполнения — 2 рабочих дня.</p></details></section>' +
          '<p class="chatgpt-order-legal-note">Нажимая кнопку, вы соглашаетесь с <a href="/oferta.html" target="_blank" rel="noopener">офертой</a> и <a href="/politika.html" target="_blank" rel="noopener">политикой конфиденциальности</a>.</p><p class="chatgpt-order-status" data-chatgpt-go-status></p>' +
        '</div><div class="chatgpt-order-footer"><div class="chatgpt-order-footer__total"><span>Итого к оплате</span><strong data-chatgpt-go-total>' + escapeHtml(format(total)) + '</strong></div><button type="submit" class="btn chatgpt-order-submit" data-chatgpt-go-submit>Оформить заказ</button></div>' +
      '</form>'
    );
  }

  function applyAiOrderModalServiceCopy(form, serviceKey) {
    if (!form) return;
    const serviceConfig = getAiOrderModalServiceConfig(serviceKey || form.getAttribute("data-service-key"));
    const serviceName = serviceConfig.displayName || "ChatGPT";
    const accountSection = form.querySelector("[data-chatgpt-go-account-section]");
    if (!accountSection) return;

    const question = accountSection.querySelector(".chatgpt-order-question");
    if (question) question.textContent = `У вас уже есть аккаунт ${serviceName}?`;

    const options = Array.from(accountSection.querySelectorAll(".chatgpt-order-account-options label"));
    const hasAccount = options[0];
    const appleAccount = options[1];
    const createAccount = options[2];

    if (hasAccount) {
      const title = hasAccount.querySelector("strong");
      const hint = hasAccount.querySelector("small");
      if (title) title.textContent = `Да, у меня есть почта и пароль от ${serviceName}`;
      if (hint) hint.textContent = `Выберите, если обычно входите в ${serviceName} через email и пароль.`;
    }

    if (appleAccount) {
      const hint = appleAccount.querySelector("small");
      if (hint) hint.textContent = `Выберите, если нажимаете кнопку «Continue with Apple» / «Войти через Apple». Пароль от ${serviceName} не нужен.`;
    }

    if (createAccount) {
      const title = createAccount.querySelector("strong");
      if (title) title.textContent = `Нет, аккаунта ${serviceName} у меня нет`;
    }

    const serviceLoginLabel = getChatGptGoOrderField(form, "serviceLogin")?.closest("label")?.querySelector("span");
    if (serviceLoginLabel) serviceLoginLabel.textContent = `Почта или логин ${serviceName}`;

    const servicePasswordLabel = getChatGptGoOrderField(form, "servicePassword")?.closest("label")?.querySelector("span");
    if (servicePasswordLabel) servicePasswordLabel.textContent = `Пароль от ${serviceName}`;
  }

  function closeChatGptGoOrderModal() {
    if (!chatGptGoOrderModalEl) return;
    const wasOpen = !chatGptGoOrderModalEl.hidden;
    if (!wasOpen) return;
    clearPromoCodeState();
    chatGptGoOrderModalEl.hidden = true;
    chatGptGoOrderModalEl.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-product-modal-open", "is-chatgpt-go-order-open");
    chatGptGoOrderCheckoutInProgress = false;
    requestAnimationFrame(() => {
      restoreChatGptGoOrderFocus();
    });
  }

  function applyChatGptGoOrderLayoutGuard(form) {
    if (!form) return;
    const modalCard = form.closest(".chatgpt-order-card");
    const modalBody = form.querySelector(".chatgpt-order-scroll");

    if (modalCard) {
      modalCard.style.width = "";
    }

    if (modalBody) {
      modalBody.style.width = "100%";
      modalBody.style.minWidth = "0";
      modalBody.style.maxWidth = "100%";
    }
  }

  function stabilizeChatGptGoOrderLayout(form) {
    requestAnimationFrame(() => {
      applyChatGptGoOrderLayoutGuard(form);
    });
  }

  function preserveChatGptGoOrderScrollPosition(form, anchor, mutate) {
    const modalBody = form ? form.querySelector(".chatgpt-order-scroll") : null;
    const safeAnchor = modalBody && anchor && modalBody.contains(anchor) ? anchor : null;
    const anchorTop = safeAnchor ? safeAnchor.getBoundingClientRect().top : 0;

    if (typeof mutate === "function") {
      mutate();
    }

    requestAnimationFrame(() => {
      applyChatGptGoOrderLayoutGuard(form);
      if (!modalBody || !safeAnchor || !modalBody.contains(safeAnchor)) return;

      const nextAnchorTop = safeAnchor.getBoundingClientRect().top;
      const delta = nextAnchorTop - anchorTop;
      if (Math.abs(delta) <= 1) return;

      const maxScrollTop = Math.max(0, modalBody.scrollHeight - modalBody.clientHeight);
      modalBody.scrollTop = Math.min(maxScrollTop, Math.max(0, modalBody.scrollTop + delta));
    });
  }

  function compactChatGptGiftSection(form) {
    const giftExtra = form ? form.querySelector("[data-chatgpt-go-gift-extra]") : null;
    if (!giftExtra || giftExtra.dataset.compactGift === "1") return;

    giftExtra.dataset.compactGift = "1";
    const noteText = giftExtra.querySelector(".chatgpt-order-gift-note p");
    if (noteText) {
      noteText.textContent = "Укажите получателя и контакт — остальные детали можно оставить на менеджера или раскрыть ниже.";
    }

    const panel = giftExtra.querySelector(".chatgpt-order-gift-panel") || giftExtra;
    const details = document.createElement("details");
    details.className = "chatgpt-order-gift-details";
    details.innerHTML =
      '<summary>Дополнительные настройки подарка</summary>' +
      '<div class="chatgpt-order-gift-details__body"></div>';
    const body = details.querySelector(".chatgpt-order-gift-details__body");

    const dateInput = panel.querySelector('[name="giftSendDate"]');
    const dateGrid = dateInput ? dateInput.closest(".chatgpt-order-grid") : null;
    const timeNote = panel.querySelector(".chatgpt-order-gift-time-note");
    const messageField = panel.querySelector('[name="giftMessage"]')?.closest(".chatgpt-order-field");

    [dateGrid, timeNote, messageField].forEach(node => {
      if (node && body && panel.contains(node)) body.appendChild(node);
    });

    if (body && body.childNodes.length) {
      panel.appendChild(details);
    }
  }

  function isChatGptGoOrderModalOpen() {
    return Boolean(chatGptGoOrderModalEl && !chatGptGoOrderModalEl.hidden);
  }

  function isChatGptGoFocusableElementVisible(element) {
    if (!element || element.disabled) return false;
    if (element.closest("[hidden], [aria-hidden='true']")) return false;
    return Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
  }

  function getChatGptGoOrderFocusableElements() {
    if (!chatGptGoOrderModalEl) return [];
    const selector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled]):not([type='hidden'])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(", ");
    return Array.from(chatGptGoOrderModalEl.querySelectorAll(selector))
      .filter(isChatGptGoFocusableElementVisible);
  }

  function focusChatGptGoOrderModal() {
    if (!isChatGptGoOrderModalOpen()) return;
    const modalTitle = chatGptGoOrderModalEl.querySelector("#chatGptGoOrderModalTitle");
    if (modalTitle && typeof modalTitle.focus === "function") {
      modalTitle.setAttribute("tabindex", "-1");
      modalTitle.focus({ preventScroll: true });
      return;
    }

    const closeButton = chatGptGoOrderModalEl.querySelector("[data-chatgpt-go-order-close]");
    if (closeButton && typeof closeButton.focus === "function") {
      closeButton.focus({ preventScroll: true });
    }
  }

  function restoreChatGptGoOrderFocus() {
    const target = chatGptGoOrderLastFocusedElement;
    chatGptGoOrderLastFocusedElement = null;
    if (!target || typeof target.focus !== "function") return;
    if (!document.contains(target) || target.disabled) return;
    target.focus({ preventScroll: true });
  }

  function trapChatGptGoOrderFocus(event) {
    if (!isChatGptGoOrderModalOpen()) return;
    const focusable = getChatGptGoOrderFocusableElements();
    if (!focusable.length) {
      event.preventDefault();
      focusChatGptGoOrderModal();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    const activeIsFocusable = focusable.includes(active);

    event.preventDefault();
    if (!activeIsFocusable) {
      (event.shiftKey ? last : first).focus({ preventScroll: true });
      return;
    }

    const currentIndex = focusable.indexOf(active);
    const nextIndex = event.shiftKey
      ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
      : (currentIndex >= focusable.length - 1 ? 0 : currentIndex + 1);
    focusable[nextIndex].focus({ preventScroll: true });
  }

  function ensureChatGptGoOrderModal() {
    if (chatGptGoOrderModalEl) return;
    chatGptGoOrderModalEl = document.getElementById("chatGptGoOrderModal");
    if (!chatGptGoOrderModalEl) {
      const modal = document.createElement("div");
      modal.id = "chatGptGoOrderModal";
      modal.className = "product-preview-modal chatgpt-go-order-modal";
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      modal.innerHTML = [
        '<div class="product-preview-modal__backdrop chatgpt-go-order-modal__backdrop" data-chatgpt-go-order-close></div>',
        '<div class="product-preview-modal__dialog chatgpt-go-order-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="chatGptGoOrderModalTitle">',
        '  <button type="button" class="product-preview-modal__close chatgpt-go-order-modal__close" aria-label="Закрыть" data-chatgpt-go-order-close>&times;</button>',
        '  <div class="chatgpt-go-order-modal__content" id="chatGptGoOrderContent"></div>',
        '</div>',
      ].join("");
      document.body.appendChild(modal);
      chatGptGoOrderModalEl = modal;
    }
    chatGptGoOrderContentEl = document.getElementById("chatGptGoOrderContent");
    chatGptGoOrderModalEl.querySelectorAll("[data-chatgpt-go-order-close]").forEach(button => {
      button.addEventListener("click", closeChatGptGoOrderModal);
    });
  }

  function openChatGptGoOrderModal(item, opener) {
    if (!item) return;
    const serviceKey = normalizeAiServiceKey(item.serviceKey || getServicePageKey() || "chatgpt");
    const modalItem = {
      ...item,
      serviceKey,
    };
    clearPromoCodeState();
    ensureChatGptGoOrderModal();
    if (!chatGptGoOrderModalEl || !chatGptGoOrderContentEl) return;
    chatGptGoOrderLastFocusedElement = opener instanceof HTMLElement ? opener : document.activeElement;
    chatGptGoOrderCheckoutInProgress = false;
    chatGptGoOrderContentEl.innerHTML = renderChatGptGoOrderCard(modalItem, serviceKey);
    chatGptGoOrderModalEl.hidden = false;
    chatGptGoOrderModalEl.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-product-modal-open", "is-chatgpt-go-order-open");
    const form = chatGptGoOrderContentEl.querySelector("[data-chatgpt-go-order]");
    applyAiOrderModalServiceCopy(form, serviceKey);
    compactChatGptGiftSection(form);
    updateChatGptGoOrderTotals(form, modalItem);
    syncChatGptGoAccountUi(form);
    syncChatGptGoPaymentAria(form);
    requestAnimationFrame(() => {
      focusChatGptGoOrderModal();
    });
    trackAnalyticsEvent("chatgpt_go_order_modal_open", {
      service_key: serviceKey,
      product_id: String(modalItem.productId || modalItem.id || "").trim(),
      amount: Math.max(0, toAmount(modalItem.price)),
    });
  }

  function renderServiceConstructorPage(allItems, serviceKey) {
    const filteredItems = filterServicePageItems(allItems, serviceKey);
    const selectedItem = filteredItems[0] || null;
    const selectedPrice = selectedItem ? Math.max(0, toAmount(selectedItem.price)) : 0;
    const selectedCurrency = String(selectedItem?.currency || "RUB").toUpperCase();

    if (serviceConstructorPriceEl) {
      serviceConstructorPriceEl.textContent = selectedPrice ? formatPriceByCurrency(selectedPrice, selectedCurrency) : "—";
    }

    servicePlansGridEl.innerHTML = selectedItem
      ? renderServiceConstructorCard(selectedItem, serviceKey)
      : (
        '<div class="service-empty-state">' +
          '<h3>' + escapeHtml(isEnPage ? "No matching plan" : "Подходящего тарифа нет") + "</h3>" +
          '<p>' + escapeHtml(isEnPage ? "Choose another plan, delivery method or duration." : "Выберите другой план, способ доставки или срок.") + "</p>" +
        "</div>"
      );
  }

  function renderServicePageFromItems() {
    if (!servicePageRootEl || !servicePlansGridEl) return;
    const serviceKey = getServicePageKey();
    const allItems = sortServicePageItems(serviceKey, servicePageItems);
    updateServiceSummary(allItems);

    const constructorMode = isServiceConstructorPage() && (isAiOrderModalServiceKey(serviceKey) || Boolean(dynamicServicePagePayload));
    const planOptions = constructorMode
      ? getConstructorFilterOptions(serviceKey, "plan", getServiceFilterOptions(allItems, serviceKey, "plan"))
      : getServiceFilterOptions(allItems, serviceKey, "plan");
    const planLabel = isEnPage ? "Plan" : "План";
    const deliveryLabel = isEnPage ? "Delivery method" : "Способ доставки";
    const durationLabel = isEnPage ? "Duration" : "Длительность";

    renderServiceFilterGroup(servicePlanFiltersEl, "plan", planLabel, planOptions, servicePageState.plan, allItems.length, serviceKey);

    const deliverySourceItems = constructorMode && servicePageState.plan !== "all"
      ? allItems.filter(item => getServicePlanKey(item, serviceKey) === servicePageState.plan)
      : allItems;
    const deliveryOptions = constructorMode
      ? getConstructorFilterOptions(serviceKey, "delivery", getServiceFilterOptions(deliverySourceItems, serviceKey, "delivery"))
      : getServiceFilterOptions(deliverySourceItems, serviceKey, "delivery");
    renderServiceFilterGroup(serviceDeliveryFiltersEl, "delivery", deliveryLabel, deliveryOptions, servicePageState.delivery, allItems.length, serviceKey);

    const durationSourceItems = constructorMode && servicePageState.delivery !== "all"
      ? deliverySourceItems.filter(item => getServiceDeliveryFilterKey(item, serviceKey) === servicePageState.delivery)
      : allItems;
    const durationOptions = constructorMode
      ? getConstructorFilterOptions(serviceKey, "duration", getServiceFilterOptions(durationSourceItems, serviceKey, "duration"))
      : getServiceFilterOptions(durationSourceItems, serviceKey, "duration");
    renderServiceFilterGroup(serviceDurationFiltersEl, "duration", durationLabel, durationOptions, servicePageState.duration, allItems.length, serviceKey);

    if (constructorMode) {
      renderServiceConstructorPage(allItems, serviceKey);
      refreshCards();
      syncCards();
      renderCart();
      return;
    }

    const filteredItems = filterServicePageItems(allItems, serviceKey);
    const cardsMarkup = filteredItems
      .map((item, idx) => buildProductCard(item, idx))
      .join("");

    servicePlansGridEl.innerHTML = cardsMarkup || (
      '<div class="service-empty-state">' +
        '<h3>' + escapeHtml(isEnPage ? "No matching plans" : "Подходящих тарифов нет") + "</h3>" +
        '<p>' + escapeHtml(isEnPage ? "Try another plan, delivery method or duration." : "Выберите другой план, способ доставки или срок.") + "</p>" +
      "</div>"
    );

    refreshCards();
    syncCards();
    renderCart();
  }

  function setupServicePageFilters() {
    if (!servicePageRootEl || servicePageRootEl.dataset.serviceFiltersInit === "1") return;
    servicePageRootEl.dataset.serviceFiltersInit = "1";
    servicePageRootEl.addEventListener("click", event => {
      const target = event.target instanceof Element ? event.target : null;
      const faqButton = target ? target.closest(".service-faq-question") : null;
      if (faqButton) {
        event.preventDefault();
        const item = faqButton.closest(".service-faq-item");
        if (item) item.classList.toggle("active");
        return;
      }
      const button = target ? target.closest("[data-service-filter-kind][data-service-filter-key]") : null;
      if (!button) return;
      event.preventDefault();
      const kind = String(button.getAttribute("data-service-filter-kind") || "").trim();
      const key = String(button.getAttribute("data-service-filter-key") || "").trim();
      if (!kind || !key || !Object.prototype.hasOwnProperty.call(servicePageState, kind)) return;
      servicePageState[kind] = key;
      renderServicePageFromItems();
    });
  }

  async function loadServicePage() {
    if (!servicePageRootEl || !servicePlansGridEl) return;
    const serviceKey = getServicePageKey();
    if (!serviceKey) return;

    try {
      dynamicServicePagePayload = await fetchServicePageConfig(serviceKey);
      if (dynamicServicePagePayload) {
        applyServicePageTheme(dynamicServicePagePayload);
        applyServicePageContent(dynamicServicePagePayload);
        renderDynamicServiceInfo(dynamicServicePagePayload);
        renderDynamicServiceFaq(dynamicServicePagePayload);
        servicePageItems = Array.isArray(dynamicServicePagePayload.products) ? dynamicServicePagePayload.products : [];
        reconcileCartProductIds(servicePageItems);
        if (!servicePageItems.length) {
          updateServiceSummary([]);
          servicePlansGridEl.innerHTML =
            '<div class="service-empty-state">' +
              '<h3>' + escapeHtml(TEXT.productsUnavailable) + "</h3>" +
            "</div>";
          refreshCards();
          syncCards();
          renderCart();
          return;
        }
        renderServicePageFromItems();
        return;
      }

      const payload = await fetchProductsPayload();
      const allItems = Array.isArray(payload?.items) ? payload.items : [];
      reconcileCartProductIds(allItems);
      servicePageItems = allItems.filter(item => {
        const service = getAiServiceConfig(item);
        return service && normalizeAiServiceKey(service.key) === serviceKey;
      });

      if (!servicePageItems.length) {
        updateServiceSummary([]);
        servicePlansGridEl.innerHTML =
          '<div class="service-empty-state">' +
            '<h3>' + escapeHtml(TEXT.productsUnavailable) + "</h3>" +
          "</div>";
        refreshCards();
        syncCards();
        renderCart();
        return;
      }

      renderServicePageFromItems();
    } catch (_) {
      updateServiceSummary([]);
      servicePlansGridEl.innerHTML =
        '<div class="service-empty-state">' +
          '<h3>' + escapeHtml(TEXT.productsUnavailable) + "</h3>" +
        "</div>";
      refreshCards();
      syncCards();
      renderCart();
    }
  }

  function renderGroupedPricingCards(items) {
    const groups = groupProductsByCategory(items);
    if (!groups.length) return "";
    const categoryBadgeLabel = isEnPage ? "Category" : "Категория";

    return groups
      .map(([categoryLabel, categoryItems], groupIdx) => {
        const aiCategory = renderAiPricingCategory(categoryLabel, categoryItems, groupIdx);
        if (aiCategory) return aiCategory;

        const cards = categoryItems
          .map((item, idx) => buildProductCard(item, groupIdx * 100 + idx))
          .join("");
        const gridClass = "pricing-grid pricing-grid--category" + (categoryItems.length === 1 ? " is-single" : "");

        return (
          '<section class="pricing-category" data-category="' + escapeHtml(categoryLabel) + '">' +
            '<div class="pricing-category__header">' +
              '<div class="pricing-category__lead">' +
                '<span class="pricing-category__label">' + escapeHtml(categoryBadgeLabel) + "</span>" +
                '<h3 class="pricing-category__title">' + escapeHtml(categoryLabel) + "</h3>" +
              "</div>" +
              '<span class="pricing-category__count">' + escapeHtml(String(categoryItems.length)) + "</span>" +
            "</div>" +
            '<div class="' + gridClass + '">' + cards + "</div>" +
          "</section>"
        );
      })
      .join("");
  }

  async function loadPricingCards() {
    if (!pricingGridEl) {
      refreshCards();
      return;
    }

    try {
      const payload = await fetchProductsPayload();
      const allItems = Array.isArray(payload?.items) ? payload.items : [];
      reconcileCartProductIds(allItems);

      const items = allItems;
      const sections = Array.isArray(payload?.sections) && payload.sections.length
        ? payload.sections
        : buildFallbackShowcaseSections(items);

      if (!items.length) {
        pricingGridEl.classList.remove("pricing-grid--categorized");
        pricingGridEl.innerHTML = '<div class="price-card"><h3>' + escapeHtml(TEXT.productsUnavailable) + "</h3></div>";
        refreshCards();
        return;
      }

      pricingGridEl.classList.add("pricing-grid--categorized");
      pricingGridEl.innerHTML = renderShowcaseSections(sections);
      setupAiServiceTabs(pricingGridEl);
      setupShowcaseSections(pricingGridEl);
      refreshCards();
      syncCards();
      renderCart();
      alignToHashTarget("auto");
    } catch (_) {
      pricingGridEl.classList.remove("pricing-grid--categorized");
      pricingGridEl.innerHTML = '<div class="price-card"><h3>' + escapeHtml(TEXT.productsUnavailable) + "</h3></div>";
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
    const value = String(email || "").trim().toLowerCase();
    if (!value || value.length > 254 || /\s/.test(value)) return false;
    const parts = value.split("@");
    if (parts.length !== 2) return false;
    const [local, domain] = parts;
    if (!local || !domain || local.length > 64 || domain.length > 253) return false;
    if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
    if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return false;
    const labels = domain.split(".");
    if (labels.length < 2) return false;
    if (labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) return false;
    const tld = labels[labels.length - 1];
    return /^[a-z]{2,63}$/i.test(tld);
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

  async function startBackendCheckout(item, qty, promoCode, paymentMethod, orderDetails) {
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
    if (!orderDetails || typeof orderDetails !== "object") {
      orderDetails = {
        source: "storefront-card",
        selection: {
          activationVariant: String(checkoutItem.activationVariant || "").trim() || null,
          deliveryMethod: String(checkoutItem.deliveryKey || checkoutItem.deliveryType || "").trim(),
        },
      };
    }
    if (orderDetails && typeof orderDetails === "object") {
      payload.order_details = orderDetails;
      payload.orderDetails = orderDetails;
      const selection = orderDetails.selection && typeof orderDetails.selection === "object" ? orderDetails.selection : {};
      const contact = orderDetails.contact && typeof orderDetails.contact === "object" ? orderDetails.contact : {};
      const gift = orderDetails.gift && typeof orderDetails.gift === "object" ? orderDetails.gift : {};
      const account = orderDetails.account && typeof orderDetails.account === "object" ? orderDetails.account : {};
      const recommendation = orderDetails.recommendation && typeof orderDetails.recommendation === "object" ? orderDetails.recommendation : {};
      payload.contactEmail = String(contact.email || email || "").trim();
      payload.telegram = String(contact.telegram || "").trim();
      payload.product = String(selection.product || "").trim();
      payload.plan = String(selection.plan || "").trim();
      payload.serviceKey = String(selection.serviceKey || "").trim();
      payload.planKey = String(selection.planKey || "").trim();
      payload.activationVariant = String(selection.activationVariant || checkoutItem.activationVariant || "").trim() || undefined;
      payload.deliveryMethod = String(selection.deliveryMethod || "").trim();
      payload.duration = String(selection.duration || "").trim();
      payload.isGift = Boolean(gift.isGift);
      payload.giftSender = String(gift.sender || "").trim();
      payload.giftRecipient = String(gift.recipient || "").trim();
      payload.giftDeliveryMethod = String(gift.deliveryMethod || "").trim();
      payload.giftRecipientContact = String(gift.recipientContact || "").trim();
      payload.giftSendDate = String(gift.sendDate || "").trim();
      payload.giftSendTime = String(gift.sendTime || "").trim();
      payload.giftMessage = String(gift.message || "").trim();
      payload.giftCertificateDesign = String(gift.certificateDesign || "").trim();
      payload.accountStatus = String(account.status || "").trim();
      payload.serviceLogin = String(account.login || "").trim();
      payload.servicePassword = String(account.password || "").trim();
      payload.cameByRecommendation = Boolean(recommendation.cameByRecommendation);
      payload.referrerContact = String(recommendation.referrerContact || "").trim();
      payload.orderComment = String(orderDetails.comment || "").trim();
    }

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

  function decodeCardTextPayload(value) {
    const raw = String(value || "");
    if (!raw) return "";
    if (!raw.includes("%")) return raw;
    try {
      return decodeURIComponent(raw);
    } catch (_) {
      return raw;
    }
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
      modalDescription: decodeCardTextPayload(String(card.getAttribute("data-modal-description") || "")).trim(),
      price: toAmount(card.getAttribute("data-price") || (priceNode ? priceNode.innerText : "")),
      currency: String(card.getAttribute("data-currency") || "RUB").trim() || "RUB",
      deliveryType: String(card.getAttribute("data-delivery-type") || "activation").trim() || "activation",
      activationVariant: String(card.getAttribute("data-activation-variant") || "").trim(),
      serviceKey: String(card.getAttribute("data-service-key") || "").trim(),
      planKey: String(card.getAttribute("data-plan-key") || "").trim(),
      deliveryKey: String(card.getAttribute("data-delivery-key") || "").trim(),
      durationKey: String(card.getAttribute("data-duration-key") || "").trim(),
      badge: String(card.getAttribute("data-badge") || "").trim(),
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

  function normalizeCardAlign(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "center") return "center";
    if (normalized === "right") return "right";
    return "left";
  }

  function applyCardTextAlign(card) {
    if (!card) return;

    const titleAlign = normalizeCardAlign(card.getAttribute("data-align-title"));
    const descriptionAlign = normalizeCardAlign(card.getAttribute("data-align-description"));
    const priceAlign = normalizeCardAlign(card.getAttribute("data-align-price"));
    const durationAlign = normalizeCardAlign(card.getAttribute("data-align-duration"));
    const featuresAlign = normalizeCardAlign(card.getAttribute("data-align-features"));
    const metaAlign = normalizeCardAlign(card.getAttribute("data-align-meta"));

    const justifyFromAlign = (align) => {
      if (align === "center") return "center";
      if (align === "right") return "flex-end";
      return "flex-start";
    };

    const titleEl = card.querySelector(".price-card__title");
    if (titleEl) {
      titleEl.style.textAlign = titleAlign;
    }

    const titleLines = card.querySelectorAll(".price-card__title-mainline");
    titleLines.forEach((line) => {
      line.style.display = "flex";
      line.style.justifyContent = justifyFromAlign(titleAlign);
      line.style.textAlign = titleAlign;
    });

    const titleMain = card.querySelectorAll(".price-card__title-main");
    titleMain.forEach((node) => {
      node.style.textAlign = titleAlign;
    });

    const titlePeriod = card.querySelector(".price-card__title-period");
    if (titlePeriod) {
      titlePeriod.style.display = "flex";
      titlePeriod.style.justifyContent = justifyFromAlign(titleAlign);
      titlePeriod.style.textAlign = titleAlign;
    }

    const descriptionEl = card.querySelector(".sub.sub-top-list");
    if (descriptionEl) {
      descriptionEl.style.textAlign = descriptionAlign;
    }

    const priceEl = card.querySelector(".price");
    if (priceEl) {
      priceEl.style.textAlign = priceAlign;
      priceEl.style.justifyContent = justifyFromAlign(priceAlign);
      if (priceAlign === "center") {
        priceEl.style.marginLeft = "auto";
        priceEl.style.marginRight = "auto";
      } else if (priceAlign === "right") {
        priceEl.style.marginLeft = "auto";
        priceEl.style.marginRight = "0";
      } else {
        priceEl.style.marginLeft = "0";
        priceEl.style.marginRight = "0";
      }
    }

    const durationEl = card.querySelector(".price-duration");
    if (durationEl) {
      durationEl.style.textAlign = durationAlign;
    }

    const featureItems = card.querySelectorAll(".price-card-features li");
    featureItems.forEach((node) => {
      node.style.textAlign = featuresAlign;
    });

    const metaEl = card.querySelector(".meta");
    if (metaEl) {
      metaEl.style.justifyItems = metaAlign === "center" ? "center" : metaAlign === "right" ? "end" : "start";
      metaEl.style.textAlign = metaAlign;
    }
  }

  function syncCard(card) {
    const item = getCardItem(card);
    if (!item) return;

    applyCardTextAlign(card);

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
    const chatGptGoOrderCloseBtn = e.target.closest && e.target.closest("[data-chatgpt-go-order-close]");
    if (chatGptGoOrderCloseBtn) {
      e.preventDefault();
      closeChatGptGoOrderModal();
      return;
    }

    const chatGptGoPasswordToggle = e.target.closest && e.target.closest("[data-chatgpt-go-password-toggle]");
    if (chatGptGoPasswordToggle) {
      e.preventDefault();
      const form = chatGptGoPasswordToggle.closest("[data-chatgpt-go-order]");
      const passwordInput = form ? getChatGptGoOrderField(form, "servicePassword") : null;
      if (!passwordInput || passwordInput.disabled) return;
      const shouldShow = passwordInput.type === "password";
      passwordInput.type = shouldShow ? "text" : "password";
      chatGptGoPasswordToggle.setAttribute("aria-pressed", shouldShow ? "true" : "false");
      chatGptGoPasswordToggle.setAttribute("aria-label", shouldShow ? "Скрыть пароль" : "Показать пароль");
      chatGptGoPasswordToggle.setAttribute("title", shouldShow ? "Скрыть пароль" : "Показать пароль");
      const passwordIcon = chatGptGoPasswordToggle.querySelector("[data-chatgpt-go-password-icon]");
      if (passwordIcon) passwordIcon.innerHTML = getChatGptGoPasswordIcon(shouldShow);
      return;
    }

    const chatGptGoPromoBtn = e.target.closest && e.target.closest("[data-chatgpt-go-promo-apply]");
    if (chatGptGoPromoBtn) {
      e.preventDefault();
      const form = chatGptGoPromoBtn.closest("[data-chatgpt-go-order]");
      const item = getCardItem(form);
      if (form && item) {
        void applyChatGptGoPromoCode(form, item);
      }
      return;
    }

    const payNowBtn = e.target.closest && e.target.closest(".pay-now-btn");
    if (payNowBtn) {
      e.preventDefault();
      const card = payNowBtn.closest(".price-card, .product-showcase-card");
      const item = getCardItem(card);
      if (!item) return;
      const checkoutItem = resolveCurrentServiceCheckoutItem(card, item);
      if (!checkoutItem) return;
      if (isChatGptGoOrderTrigger(card, checkoutItem)) {
        openChatGptGoOrderModal(checkoutItem, payNowBtn);
        return;
      }
      const promoCode = getCardPromoCode(card);
      checkoutItem.promoCode = promoCode;
      openProductPreviewModal(checkoutItem);
      return;
    }

    const priceCard = e.target.closest && e.target.closest(".price-card[data-product], .product-showcase-card[data-product]");
    const isCatalogCard =
      priceCard &&
      ((pricingGridEl && pricingGridEl.contains(priceCard)) ||
        (servicePlansGridEl && servicePlansGridEl.contains(priceCard)));
    if (isCatalogCard) {
      if (priceCard.classList.contains("service-checkout-card")) return;
      if (priceCard.hasAttribute("data-chatgpt-go-order")) return;
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

  document.addEventListener("submit", e => {
    const form = e.target && e.target.closest ? e.target.closest("[data-chatgpt-go-order]") : null;
    if (!form) return;
    e.preventDefault();
    void submitChatGptGoOrder(form);
  });

  document.addEventListener("change", e => {
    const form = e.target && e.target.closest ? e.target.closest("[data-chatgpt-go-order]") : null;
    if (!form) return;
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;

    if (target.matches('[name="isGift"]')) {
      const anchor = target.closest(".chatgpt-order-soft-action");
      preserveChatGptGoOrderScrollPosition(form, anchor, () => {
        const extra = form.querySelector("[data-chatgpt-go-gift-extra]");
        if (extra) extra.hidden = !target.checked;
        const accountSection = form.querySelector("[data-chatgpt-go-account-section]");
        if (accountSection) accountSection.hidden = target.checked;
        if (!target.checked) syncChatGptGoAccountUi(form);
      });
    }

    if (target.matches('[name="accountStatus"]')) {
      syncChatGptGoAccountUi(form);
      setChatGptGoFieldError(form, "serviceLogin", "");
      setChatGptGoFieldError(form, "servicePassword", "");
    }

    if (target.matches('[name="paymentMethod"]')) {
      syncChatGptGoPaymentAria(form);
    }

    if (target.matches('[name="cameByRecommendation"]')) {
      const anchor = target.closest(".chatgpt-order-soft-action");
      preserveChatGptGoOrderScrollPosition(form, anchor, () => {
        const referralExtra = form.querySelector("[data-chatgpt-go-referral-extra]");
        if (referralExtra) referralExtra.hidden = !target.checked;
      });
    }

    if (target.matches('input[type="radio"], input[type="checkbox"], select')) {
      if (target.name) setChatGptGoFieldError(form, target.name, "");
      const item = getCardItem(form);
      if (item) saveChatGptGoOrderDraft(collectChatGptGoOrder(form, item));
    }
  });

  document.addEventListener("input", e => {
    const form = e.target && e.target.closest ? e.target.closest("[data-chatgpt-go-order]") : null;
    if (!form) return;
    const target = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement ? e.target : null;
    if (!target) return;

    if (target.name === "promoCode") {
      const normalized = normalizePromoCodeInput(target.value);
      if (target.value !== normalized) target.value = normalized;
      if (!normalized) {
        promoValidationState = "idle";
        promoDiscountAmount = 0;
        promoValidationContextKey = "";
        setActivePromoCode("", { skipValidation: true });
        setChatGptGoPromoMessage(form, "", "idle");
        const item = getCardItem(form);
        if (item) updateChatGptGoOrderTotals(form, item);
      }
    }

    if (target.name) {
      setChatGptGoFieldError(form, target.name, "");
    }

    const item = getCardItem(form);
    if (item) saveChatGptGoOrderDraft(collectChatGptGoOrder(form, item));
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

  activePromoCode = "";
  activePaymentMethod = loadPaymentMethod();
  syncPaymentMethodUi();
  clearPromoCodeState();
  if (headerCartPromoInputEl) headerCartPromoInputEl.value = activePromoCode;
  if (cartPromoInputEl) cartPromoInputEl.value = activePromoCode;
  syncCheckoutEmailInputs();
  clearLegacyCartArtifacts();

  loadPricingCards();
  setupServicePageFilters();
  loadServicePage();

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
    if (e.key === "Tab" && isChatGptGoOrderModalOpen()) {
      trapChatGptGoOrderFocus(e);
      return;
    }
    if (e.key !== "Escape") return;
    closeHeaderCartPanel();
    resetPendingCheckout();
    closePaymentMethodModal();
    closeProductPreviewModal();
    closeChatGptGoOrderModal();
  });

  window.addEventListener("gptishka:cart-cleared", () => {
    clearPromoCodeState();
    renderCart();
    syncCards();
  });

  window.addEventListener("pagehide", clearPromoCodeState);

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
  } catch (error) {
    console.error("[storefront] checkout runtime failed", error);
  }
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
  const TICKER_CACHE_KEY = "gptishka_ticker_cache_v2";
  const TICKER_ANCHOR_KEY = "gptishka_ticker_anchor_v1";
  const TICKER_CACHE_TTL_MS = 12 * 60 * 1000;
  const TICKER_MIN_VISUAL_UPDATE_MS = 60000;
  const TICKER_WARM_FETCH_DELAY_MS = 12000;
  const DEFAULT_TICKER_CYCLE_MS = 130000;

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
  let delayedFetchTimerId = 0;
  let lastTickerSignature = "";
  let tickerRenderedAt = 0;

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

  function ensureTickerAnchorMs() {
    const now = Date.now();
    try {
      const raw = Number(localStorage.getItem(TICKER_ANCHOR_KEY) || 0);
      if (Number.isFinite(raw) && raw > 0) return raw;
      localStorage.setItem(TICKER_ANCHOR_KEY, String(now));
      return now;
    } catch (_) {
      return now;
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

  function bindTickerElements(tickerRoot) {
    if (!tickerRoot) return;
    tickerTrack = tickerRoot.querySelector("#siteTickerTrack");
    totalValueEl = tickerRoot.querySelector("#siteTickerSales");
  }

  function createTicker() {
    const existingTicker = document.getElementById("siteTicker");
    if (existingTicker) {
      bindTickerElements(existingTicker);
      return;
    }
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
    ticker.classList.add("is-warmup");
    window.setTimeout(() => {
      ticker.classList.remove("is-warmup");
    }, 900);

    bindTickerElements(ticker);
  }

  function normalizeTickerEntries(stats) {
    const isTickerEmailVisible = (email) => {
      const value = String(email || "").trim().toLowerCase();
      if (!value) return false;
      if (value.endsWith("@telegram.local")) return false;
      if (value.endsWith(".local")) return false;
      return true;
    };

    if (Array.isArray(stats?.tickerEntries) && stats.tickerEntries.length) {
      return stats.tickerEntries
        .map(entry => {
          const email = String(entry?.email || "").trim();
          if (!isTickerEmailVisible(email)) return null;
          return email;
        })
        .filter(Boolean);
    }

    if (Array.isArray(stats?.lastBuyers) && stats.lastBuyers.length) {
      return stats.lastBuyers
        .map(email => String(email || "").trim())
        .filter(isTickerEmailVisible)
        .filter(Boolean);
    }

    return [];
  }

  function shuffleTickerEntries(entries) {
    const list = Array.isArray(entries)
      ? entries
          .map(value => String(value || "").trim())
          .filter(Boolean)
      : [];
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = list[i];
      list[i] = list[j];
      list[j] = temp;
    }
    return list;
  }

  function getTickerCycleMs() {
    if (!tickerTrack) return DEFAULT_TICKER_CYCLE_MS;
    try {
      const raw = String(window.getComputedStyle(tickerTrack).animationDuration || "").split(",")[0].trim();
      if (!raw) return DEFAULT_TICKER_CYCLE_MS;
      if (raw.endsWith("ms")) {
        const parsedMs = Number(raw.slice(0, -2));
        return Number.isFinite(parsedMs) && parsedMs > 0 ? parsedMs : DEFAULT_TICKER_CYCLE_MS;
      }
      if (raw.endsWith("s")) {
        const parsedS = Number(raw.slice(0, -1));
        return Number.isFinite(parsedS) && parsedS > 0 ? Math.round(parsedS * 1000) : DEFAULT_TICKER_CYCLE_MS;
      }
      return DEFAULT_TICKER_CYCLE_MS;
    } catch (_) {
      return DEFAULT_TICKER_CYCLE_MS;
    }
  }

  function applyTickerAnimationOffset(anchorMs) {
    if (!tickerTrack) return;
    const safeAnchorMs = Number(anchorMs || ensureTickerAnchorMs());
    const elapsed = Math.max(0, Date.now() - safeAnchorMs);
    const cycleMs = getTickerCycleMs();
    const offsetSeconds = (elapsed % cycleMs) / 1000;
    tickerTrack.style.animationDelay = `-${offsetSeconds.toFixed(3)}s`;
    tickerTrack.style.animationPlayState = "running";
  }

  function readTickerCache() {
    try {
      const raw = localStorage.getItem(TICKER_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      const updatedAt = Number(parsed.updatedAt || 0);
      if (!updatedAt || Date.now() - updatedAt > TICKER_CACHE_TTL_MS) return null;
      const entries = Array.isArray(parsed.entries)
        ? parsed.entries
            .map(v => String(v || "").trim())
            .filter(email => {
              const value = email.toLowerCase();
              return value && !value.endsWith("@telegram.local") && !value.endsWith(".local");
            })
            .filter(Boolean)
            .slice(0, 28)
        : [];
      const total = Number(parsed.total || 0);
      const renderedAt = Number(parsed.renderedAt || updatedAt || Date.now());
      return {
        entries,
        total: Number.isFinite(total) ? total : 0,
        renderedAt: Number.isFinite(renderedAt) && renderedAt > 0 ? renderedAt : Date.now(),
      };
    } catch (_) {
      return null;
    }
  }

  function writeTickerCache(entries, total, renderedAt) {
    try {
      const payload = {
        entries: Array.isArray(entries)
          ? entries
              .map(v => String(v || "").trim())
              .filter(email => {
                const value = email.toLowerCase();
                return value && !value.endsWith("@telegram.local") && !value.endsWith(".local");
              })
              .filter(Boolean)
              .slice(0, 28)
          : [],
        total: Number(total || 0),
        renderedAt: Number(renderedAt || Date.now()),
        updatedAt: Date.now(),
      };
      localStorage.setItem(TICKER_CACHE_KEY, JSON.stringify(payload));
    } catch (_) {
      // Ignore storage quota/privacy errors.
    }
  }

  function renderTicker(entries, options = {}) {
    if (!tickerTrack) return;
    const renderedAt = Date.now();
    const force = Boolean(options.force);

    const normalizedEntries = Array.isArray(entries)
      ? entries
          .map(value => String(value || "").trim())
          .filter(email => {
            const value = email.toLowerCase();
            return value && !value.endsWith("@telegram.local") && !value.endsWith(".local");
          })
          .filter(Boolean)
      : [];
    const signatureSource = normalizedEntries.length
      ? normalizedEntries.slice().sort((a, b) => a.localeCompare(b))
      : [TEXT.emptyTicker];
    const signature = signatureSource.join("\u241f");

    if (!force && signature === lastTickerSignature) {
      return;
    }

    const nextHasRealEntries = normalizedEntries.length > 0;
    const prevHasRealEntries = Boolean(lastTickerSignature && lastTickerSignature !== TEXT.emptyTicker);
    if (!force && tickerRenderedAt && Date.now() - tickerRenderedAt < TICKER_MIN_VISUAL_UPDATE_MS) {
      if (!(nextHasRealEntries && !prevHasRealEntries)) return;
    }

    const safeEntries = normalizedEntries.length
      ? shuffleTickerEntries(normalizedEntries)
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

    lastTickerSignature = signature;
    tickerRenderedAt = renderedAt > 0 ? renderedAt : Date.now();
    applyTickerAnimationOffset();
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
      const entries = normalizeTickerEntries(stats);
      renderCounters(stats);
      renderTicker(entries);
      writeTickerCache(entries, Number(stats?.sales || 0), Date.now());
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
    if (delayedFetchTimerId) {
      window.clearTimeout(delayedFetchTimerId);
      delayedFetchTimerId = 0;
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
    const cached = readTickerCache();
    if (cached) {
      renderCounters({ sales: cached.total });
      renderTicker(cached.entries, { force: true });
      writeTickerCache(cached.entries, cached.total, Date.now());
    } else {
      renderTicker([], { force: true });
    }

    const sessionId = ensureSessionId();
    sendHeartbeat(sessionId);
    startTickerPolling(sessionId);
    fetchAndRenderStats();

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
