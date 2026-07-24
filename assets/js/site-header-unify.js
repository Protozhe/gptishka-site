(() => {
  const SCRIPT_VERSION = "20260724-header-nav-icons1";
  const HEADER_CSS = "/assets/css/gptishka-header-refresh.css?v=20260724-language-slider1";
  const HEADER_NAV_CSS = "/assets/css/header-navigation-state.css?v=20260724-header-nav-icons2";
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

  function ensureStylesheet(href, filename) {
    const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .some((link) => String(link.getAttribute("href") || "").includes(filename));
    if (exists) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function ensureHeaderCss() {
    ensureStylesheet(HEADER_CSS, "gptishka-header-refresh.css");
    ensureStylesheet(HEADER_NAV_CSS, "header-navigation-state.css");
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

  function activeHeaderSection() {
    const path = String(window.location.pathname || "/").replace(/\/index\.html$/i, "/");
    if (/^\/(?:en\/)?news(?:\/|$)/i.test(path)) return "news";
    if (/^\/app(?:\/|$)/i.test(path)) return "reviews";
    return "";
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
    const activeSection = activeHeaderSection();
    const newsCurrent = activeSection === "news";
    const reviewsCurrent = activeSection === "reviews";
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
          <a class="header-quick-link${newsCurrent ? " is-current-section" : ""}" href="${en ? "/en/news/" : "/news/"}"${newsCurrent ? ' aria-current="page"' : ""}>${en ? "News" : "Новости"}</a>
          <a class="header-quick-link${reviewsCurrent ? " is-current-section" : ""}" href="${reviewsHref(en)}"${reviewsCurrent ? ' aria-current="page"' : ""}>${en ? "Reviews" : "Отзывы"}</a>
          <a class="header-quick-link header-social-link header-social-link--vk" href="${VK_URL}" target="_blank" rel="noopener" aria-label="${en ? "GPTishka on VK" : "GPTishka в VK"}">
            <svg class="header-social-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12.785 16.241s.288-.032.436-.194c.136-.148.132-.427.132-.427s-.019-1.304.586-1.496c.596-.188 1.362 1.26 2.174 1.817.614.421 1.08.329 1.08.329l2.169-.03s1.134-.07.596-.961c-.044-.073-.313-.658-1.611-1.863-1.36-1.262-1.177-1.058.46-3.242.997-1.33 1.395-2.142 1.27-2.49-.119-.331-.854-.244-.854-.244l-2.442.015s-.181-.025-.315.056c-.131.079-.216.263-.216.263s-.386 1.029-.9 1.904c-1.085 1.845-1.519 1.942-1.696 1.828-.413-.267-.31-1.072-.31-1.643 0-1.782.27-2.524-.526-2.716-.264-.064-.458-.105-1.132-.112-.865-.009-1.598.003-2.012.206-.276.135-.489.437-.359.454.16.021.522.098.714.359.248.34.239 1.103.239 1.103s.142 2.103-.332 2.364c-.325.18-.772-.187-1.729-1.861-.49-.858-.861-1.807-.861-1.807s-.071-.175-.199-.268c-.155-.113-.371-.149-.371-.149l-2.321.015s-.348.01-.476.161c-.114.134-.009.411-.009.411s1.816 4.248 3.872 6.389c1.886 1.963 4.028 1.834 4.028 1.834h.971Z"></path></svg>
          </a>
          <a class="header-quick-link header-social-link header-social-link--telegram" href="${TELEGRAM_URL}" target="_blank" rel="noopener" aria-label="${en ? "GPTishka on Telegram" : "GPTishka в Telegram"}">
            <svg class="header-social-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M23.91 3.79 20.3 20.84c-.27 1.2-.98 1.49-1.99.93l-5.5-4.06-2.65 2.55c-.29.29-.54.54-1.1.54l.39-5.6 10.2-9.21c.44-.39-.1-.61-.68-.22L6.36 13.7.92 12c-1.18-.37-1.2-1.18.25-1.75L22.44 2.06c.98-.36 1.84.24 1.47 1.73Z"></path></svg>
          </a>
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
