(() => {
  const VERSION = "20260724-language-menu4";
  const STYLESHEET = "/assets/css/language-slider.css?v=20260724-language-menu3";
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

  const languages = {
    ru: {
      name: "Русский",
      flag: "/assets/img/iconrus.avif"
    },
    en: {
      name: "English",
      flag: "/assets/img/iconeng.png"
    }
  };

  function currentLanguage() {
    if (/^\/en(?:\/|$)/.test(window.location.pathname || "")) return "en";
    try {
      return new URLSearchParams(window.location.search).get("lang") === "en" ? "en" : "ru";
    } catch (_) {
      return "ru";
    }
  }

  function languageHref(targetLanguage) {
    const targetUrl = new URL(window.location.href);
    const path = targetUrl.pathname || "/";
    if (targetLanguage === "en") {
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

  function ensureStylesheet() {
    let link = document.querySelector("link[data-language-menu-styles]");
    if (!link) {
      link = document.createElement("link");
      link.rel = "stylesheet";
      link.dataset.languageMenuStyles = VERSION;
      document.head.appendChild(link);
    }
    link.href = STYLESHEET;
  }

  function closeMenu(wrapper, returnFocus = false) {
    const trigger = wrapper.querySelector(".language-menu__trigger");
    const popover = wrapper.querySelector(".language-menu__popover");
    wrapper.classList.remove("open");
    trigger?.setAttribute("aria-expanded", "false");
    popover?.setAttribute("aria-hidden", "true");
    if (returnFocus) trigger?.focus();
  }

  function openMenu(wrapper) {
    document.querySelectorAll(".language-menu-host.open").forEach((other) => {
      if (other !== wrapper) closeMenu(other);
    });
    const trigger = wrapper.querySelector(".language-menu__trigger");
    const popover = wrapper.querySelector(".language-menu__popover");
    wrapper.classList.add("open");
    trigger?.setAttribute("aria-expanded", "true");
    popover?.setAttribute("aria-hidden", "false");
  }

  function bindMenu(wrapper) {
    const trigger = wrapper.querySelector(".language-menu__trigger");
    const options = Array.from(wrapper.querySelectorAll(".language-menu__option"));
    if (!trigger || !options.length) return;

    trigger.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
      event.preventDefault();
      openMenu(wrapper);
      (event.key === "ArrowUp" ? options.at(-1) : options[0])?.focus();
    });

    options.forEach((option, index) => {
      option.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeMenu(wrapper, true);
          return;
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        let nextIndex = index;
        if (event.key === "ArrowDown") nextIndex = (index + 1) % options.length;
        if (event.key === "ArrowUp") nextIndex = (index - 1 + options.length) % options.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = options.length - 1;
        options[nextIndex]?.focus();
      });
    });
  }

  function buildMenu(wrapper) {
    if (!(wrapper instanceof Element)) return;
    if (wrapper.dataset.languageMenuVersion === VERSION) return;

    const activeLanguage = currentLanguage();
    const active = languages[activeLanguage];
    const labels = activeLanguage === "en"
      ? { choose: "Choose language", menu: "Available languages" }
      : { choose: "Выбрать язык", menu: "Доступные языки" };

    wrapper.dataset.languageMenuVersion = VERSION;
    wrapper.classList.add("language-menu-host");
    wrapper.classList.remove("language-slider-host", "open");
    wrapper.innerHTML = `
      <button class="language-menu__trigger lang-current" type="button"
        aria-label="${labels.choose}" aria-haspopup="menu" aria-expanded="false">
        <img class="language-menu__flag lang-flag-img" src="${active.flag}" alt="" width="24" height="24" decoding="async">
        <span class="language-menu__current-name">${active.name}</span>
        <span class="language-menu__chevron lang-arrow" aria-hidden="true"></span>
      </button>
      <div class="language-menu__popover lang-options lang-dropdown" role="menu"
        aria-label="${labels.menu}" aria-hidden="true">
        ${Object.entries(languages).map(([language, item]) => `
          <a class="language-menu__option lang-item${language === activeLanguage ? " is-active" : ""}"
            href="${languageHref(language)}" role="menuitem"
            lang="${language}" hreflang="${language}" data-language="${language}">
            <img class="language-menu__flag lang-flag-img" src="${item.flag}" alt="" width="24" height="24" loading="lazy" decoding="async">
            <span class="language-menu__option-name">${item.name}</span>
            <span class="language-menu__check" aria-hidden="true"></span>
          </a>
        `).join("")}
      </div>
    `;
    bindMenu(wrapper);
  }

  function enhanceAll() {
    document.querySelectorAll(
      "[data-lang-switcher], #langSwitch, .lang-switch, .lang-switcher"
    ).forEach(buildMenu);
  }

  function start() {
    ensureStylesheet();
    enhanceAll();

    document.addEventListener("click", (event) => {
      const trigger = event.target.closest?.(".language-menu__trigger");
      if (trigger) {
        const wrapper = trigger.closest(".language-menu-host");
        if (wrapper) {
          event.preventDefault();
          if (wrapper.classList.contains("open")) closeMenu(wrapper);
          else openMenu(wrapper);
          return;
        }
      }
      document.querySelectorAll(".language-menu-host.open").forEach((wrapper) => {
        if (!wrapper.contains(event.target)) closeMenu(wrapper);
      });
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      document.querySelectorAll(".language-menu-host.open").forEach((wrapper) => {
        closeMenu(wrapper, true);
      });
    });

    const observer = new MutationObserver((records) => {
      if (records.some((record) => record.addedNodes.length)) enhanceAll();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 15000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
