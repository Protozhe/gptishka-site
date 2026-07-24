(() => {
  const SCRIPT_VERSION = "20260724-en-product-routes1";
  const HEADER_CSS = "/assets/css/gptishka-header-refresh.css?v=20260724-language-slider1";
  const LOGO_SRC = "/assets/img/logo-new-dark.png?v=20260622-header4";
  const CHATGPT_LOGO_SRC = "/assets/img/services/chatgpt-card.webp?v=20260721-webp1";
  const VK_URL = "https://vk.com/gptishka?from=groups&trackcode=7f99670c_6HjhbFhCJIgWV0ALEpOr-nIlZFrs3X3-3D3-z00f1k7ylk5Mhdl7hxbRgwtUEeZ8MCZjDfHpk0ywZuW";
  const TELEGRAM_URL = "https://t.me/aimarket_gpt";
  const FALLBACK_ENGLISH_PATHS = new Set([
    "/404.html",
    "/500.html",
    "/account.html",
    "/app/",
    "/app/index.html",
    "/service.html",
    "/success.html",
    "/fail.html",
    "/chatgpt-plus-kupit.html",
    "/chatgpt-plus-cena.html",
    "/kak-oplatit-chatgpt-v-rossii.html",
    "/podklyuchenie-chatgpt-online.html"
  ]);
  const ENGLISH_PRODUCT_ROUTES = new Map([
    ["/chatgpt", "/en/chatgpt.html"],
    ["/chatgpt.html", "/en/chatgpt.html"],
    ["/claude", "/en/claude.html"],
    ["/claude.html", "/en/claude.html"],
    ["/supergrok", "/en/supergrok.html"],
    ["/supergrok.html", "/en/supergrok.html"]
  ]);
  const RUSSIAN_PRODUCT_ROUTES = new Map([
    ["/en/chatgpt", "/chatgpt"],
    ["/en/chatgpt.html", "/chatgpt"],
    ["/en/claude", "/claude"],
    ["/en/claude.html", "/claude"],
    ["/en/supergrok", "/supergrok"],
    ["/en/supergrok.html", "/supergrok"]
  ]);

  function isEnglishPage() {
    return /^\/en(?:\/|$)/.test(window.location.pathname || "")
      || new URL(window.location.href).searchParams.get("lang") === "en";
  }

  function ensureHeaderCss() {
    const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .some((link) => String(link.getAttribute("href") || "").includes("gptishka-header-refresh.css"));
    if (exists) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = HEADER_CSS;
    document.head.appendChild(link);
  }

  function langHref(targetLang) {
    const targetUrl = new URL(window.location.href);
    const path = targetUrl.pathname || "/";
    if (targetLang === "en") {
      if (!/^\/en(?:\/|$)/.test(path)) {
        if (ENGLISH_PRODUCT_ROUTES.has(path)) {
          targetUrl.pathname = ENGLISH_PRODUCT_ROUTES.get(path);
          targetUrl.searchParams.delete("lang");
        } else if (FALLBACK_ENGLISH_PATHS.has(path)) {
          targetUrl.searchParams.set("lang", "en");
        } else {
          targetUrl.pathname = ("/en" + (path === "/" ? "/" : path)).replace(/\/{2,}/g, "/");
          targetUrl.searchParams.delete("lang");
        }
      }
    } else {
      targetUrl.pathname = RUSSIAN_PRODUCT_ROUTES.get(path)
        || path.replace(/^\/en(?=\/|$)/, "")
        || "/";
      targetUrl.searchParams.delete("lang");
    }
    return `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
  }

  function reviewsHref(en) {
    return en ? "/app/?lang=en" : "/app/";
  }

  function ensureLanguageAlternates() {
    const upsert = (lang, href) => {
      let link = document.head.querySelector(`link[rel="alternate"][hreflang="${lang}"]`);
      if (!link) {
        link = document.createElement("link");
        link.rel = "alternate";
        link.hreflang = lang;
        document.head.appendChild(link);
      }
      link.href = new URL(href, window.location.origin).href;
    };
    upsert("ru", langHref("ru"));
    upsert("en", langHref("en"));
    upsert("x-default", langHref("ru"));
  }

  function buildHeader() {
    const en = isEnglishPage();
    const header = document.createElement("header");
    header.className = "gptishka-unified-header";
    header.setAttribute("data-unified-header", SCRIPT_VERSION);
    header.innerHTML = `
      <div class="nav nav-shell">
        <a href="${en ? "/en/" : "/"}" class="logo-link" aria-label="GPTISHKA">
          <img loading="eager" decoding="async" fetchpriority="high" width="300" height="127" src="${LOGO_SRC}" alt="GPTISHKA" class="logo-img">
        </a>

        <a href="${en ? "/en/chatgpt.html" : "/chatgpt"}" class="header-product-pill" aria-label="${en ? "ChatGPT from 1290 rubles per month" : "ChatGPT от 1290 рублей в месяц"}">
          <img class="header-product-pill__logo" src="${CHATGPT_LOGO_SRC}" alt="" loading="lazy" decoding="async">
          <span>${en ? "ChatGPT from 1290 ₽/mo" : "ChatGPT от 1290 ₽/мес"}</span>
        </a>

        <nav class="header-quick-links" aria-label="${en ? "GPTishka quick links" : "Быстрые разделы GPTishka"}">
          <a class="header-quick-link" href="${en ? "/en/news/" : "/news/"}">${en ? "News" : "Новости"}</a>
          <a class="header-quick-link" href="${reviewsHref(en)}">${en ? "Reviews" : "Отзывы"}</a>
          <a class="header-quick-link" href="${VK_URL}" target="_blank" rel="noopener">VK</a>
          <a class="header-quick-link header-quick-link--telegram" href="${TELEGRAM_URL}" target="_blank" rel="noopener">Telegram</a>
        </nav>

        <div class="header-tools header-actions">
          <div class="lang-switcher" data-lang-switcher>
            <button class="lang-current" type="button" aria-haspopup="true" aria-expanded="false">
              <img class="lang-flag-img" src="${en ? "/assets/img/iconeng.png" : "/assets/img/iconrus.avif"}" alt="" width="22" height="22" loading="lazy" decoding="async">
              <span>${en ? "English" : "Русский"}</span>
              <span class="lang-arrow" aria-hidden="true">▾</span>
            </button>
            <div class="lang-options" role="menu">
              <a class="lang-item" href="${langHref("ru")}" role="menuitem"><img class="lang-flag-img" src="/assets/img/iconrus.avif" alt="" width="20" height="20" loading="lazy" decoding="async"><span>Русский</span></a>
              <a class="lang-item" href="${langHref("en")}" role="menuitem"><img class="lang-flag-img" src="/assets/img/iconeng.png" alt="" width="20" height="20" loading="lazy" decoding="async"><span>English</span></a>
            </div>
          </div>
        </div>
      </div>
    `;
    return header;
  }

  function bindLanguageMenu(header) {
    const switcher = header.querySelector("[data-lang-switcher]");
    const button = switcher && switcher.querySelector(".lang-current");
    if (!switcher || !button) return;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const open = switcher.classList.toggle("open");
      button.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", (event) => {
      if (switcher.contains(event.target)) return;
      switcher.classList.remove("open");
      button.setAttribute("aria-expanded", "false");
    });
  }

  function removeLegacyTicker() {
    document.querySelectorAll("#siteTicker, .site-ticker").forEach((el) => {
      el.remove();
    });
  }

  function observeLegacyTicker() {
    removeLegacyTicker();
    const observer = new MutationObserver(() => removeLegacyTicker());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 15000);
  }

  function unifyHeader() {
    if (/^\/admin(?:\/|$)/.test(window.location.pathname || "")) return;
    ensureHeaderCss();
    ensureLanguageAlternates();
    removeLegacyTicker();
    const oldHeader = document.querySelector("body > header") || document.querySelector("header");
    const nextHeader = buildHeader();
    if (oldHeader) {
      oldHeader.replaceWith(nextHeader);
    } else {
      document.body.insertBefore(nextHeader, document.body.firstChild);
    }
    bindLanguageMenu(nextHeader);
    observeLegacyTicker();
    document.body.classList.add("gptishka-unified-header-ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", unifyHeader, { once: true });
  } else {
    unifyHeader();
  }
})();
