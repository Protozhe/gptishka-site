(() => {
  const VERSION = "20260724-social-icons1";
  const STYLESHEET = "/assets/css/language-slider.css?v=20260724-language-menu3";
  const HEADER_NAV_STYLESHEET = "/assets/css/header-navigation-state.css?v=20260724-social-icons1";
  const FOOTER_STYLESHEET = "/assets/css/site-footer-unified.css?v=20260724-unified-footer1";
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

    let headerLink = document.querySelector("link[data-header-navigation-styles]");
    if (!headerLink) {
      headerLink = document.createElement("link");
      headerLink.rel = "stylesheet";
      headerLink.dataset.headerNavigationStyles = VERSION;
      document.head.appendChild(headerLink);
    }
    headerLink.href = HEADER_NAV_STYLESHEET;

    let footerLink = document.querySelector("link[data-unified-footer-styles]");
    if (!footerLink) {
      footerLink = document.createElement("link");
      footerLink.rel = "stylesheet";
      footerLink.dataset.unifiedFooterStyles = VERSION;
      document.head.appendChild(footerLink);
    }
    footerLink.href = FOOTER_STYLESHEET;
  }

  function makeFooterGroup(items, className) {
    const group = document.createElement("div");
    group.className = className;

    items.forEach((item, index) => {
      if (index > 0) {
        const separator = document.createElement("span");
        separator.className = "footer-separator";
        separator.setAttribute("aria-hidden", "true");
        separator.textContent = "·";
        group.appendChild(separator);
      }

      const link = document.createElement("a");
      link.className = "footer-link";
      link.href = item.href;
      link.textContent = item.label;
      group.appendChild(link);
    });

    return group;
  }

  function enhanceUnifiedFooter() {
    let footer = document.querySelector("body > footer");
    if (!footer) {
      footer = document.createElement("footer");
      document.body.appendChild(footer);
    }
    if (footer.dataset.unifiedFooterVersion === VERSION) return;

    const english = currentLanguage() === "en";
    const prefix = english ? "/en" : "";
    const primary = english
      ? [
          { href: `${prefix}/oferta.html`, label: "Public offer" },
          { href: `${prefix}/politika.html`, label: "Privacy policy" },
          { href: `${prefix}/refund.html`, label: "Refund policy" }
        ]
      : [
          { href: "/oferta.html", label: "Публичная оферта" },
          { href: "/politika.html", label: "Политика конфиденциальности" },
          { href: "/refund.html", label: "Условия возврата" }
        ];
    const secondary = english
      ? [
          { href: `${prefix}/about.html`, label: "About the service" },
          { href: `${prefix}/guarantee.html`, label: "Guarantee" },
          { href: `${prefix}/contact.html`, label: "Contact us" }
        ]
      : [
          { href: "/about.html", label: "О сервисе" },
          { href: "/guarantee.html", label: "Гарантия" },
          { href: "/contact.html", label: "Связь с нами" }
        ];
    const copy = document.createElement("span");
    copy.className = "footer-copy";
    copy.textContent = english
      ? "© 2026 GPTishka. All rights reserved. Copying is prohibited."
      : "© 2026 GPTishka. Все права защищены, копирование запрещено.";

    footer.classList.add("gptishka-unified-footer");
    footer.dataset.unifiedFooterVersion = VERSION;
    footer.setAttribute("aria-label", english ? "Legal information" : "Юридическая информация");
    footer.replaceChildren(
      makeFooterGroup(primary, "footer-links-primary"),
      makeFooterGroup(secondary, "footer-links-secondary"),
      copy
    );
  }

  function createSocialIcon(kind) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    svg.classList.add("header-social-icon", `header-social-icon--${kind}`);
    svg.setAttribute("viewBox", kind === "vk" ? "3.8 6.8 17.4 10.2" : "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("fill", "currentColor");
    path.setAttribute(
      "d",
      kind === "telegram"
        ? "M23.91 3.79 20.3 20.84c-.27 1.2-.98 1.49-1.99.93l-5.5-4.06-2.65 2.55c-.29.29-.54.54-1.1.54l.39-5.6 10.2-9.21c.44-.39-.1-.61-.68-.22L6.36 13.7.92 12c-1.18-.37-1.2-1.18.25-1.75L22.44 2.06c.98-.36 1.84.24 1.47 1.73Z"
        : "M12.785 16.241s.288-.032.436-.194c.136-.148.132-.427.132-.427s-.019-1.304.586-1.496c.596-.188 1.362 1.26 2.174 1.817.614.421 1.08.329 1.08.329l2.169-.03s1.134-.07.596-.961c-.044-.073-.313-.658-1.611-1.863-1.36-1.262-1.177-1.058.46-3.242.997-1.33 1.395-2.142 1.27-2.49-.119-.331-.854-.244-.854-.244l-2.442.015s-.181-.025-.315.056c-.131.079-.216.263-.216.263s-.386 1.029-.9 1.904c-1.085 1.845-1.519 1.942-1.696 1.828-.413-.267-.31-1.072-.31-1.643 0-1.782.27-2.524-.526-2.716-.264-.064-.458-.105-1.132-.112-.865-.009-1.598.003-2.012.206-.276.135-.489.437-.359.454.16.021.522.098.714.359.248.34.239 1.103.239 1.103s.142 2.103-.332 2.364c-.325.18-.772-.187-1.729-1.861-.49-.858-.861-1.807-.861-1.807s-.071-.175-.199-.268c-.155-.113-.371-.149-.371-.149l-2.321.015s-.348.01-.476.161c-.114.134-.009.411-.009.411s1.816 4.248 3.872 6.389c1.886 1.963 4.028 1.834 4.028 1.834h.971Z"
    );
    svg.appendChild(path);
    return svg;
  }

  function enhanceHeaderNavigation() {
    const currentPath = String(window.location.pathname || "/").replace(/\/index\.html$/i, "/");
    const activeSection = /^\/(?:en\/)?news(?:\/|$)/i.test(currentPath)
      ? "news"
      : /^\/app(?:\/|$)/i.test(currentPath)
        ? "reviews"
        : "";
    const english = currentLanguage() === "en";

    document.querySelectorAll("header .header-quick-link").forEach((link) => {
      let target;
      try {
        target = new URL(link.href, window.location.origin);
      } catch (_) {
        return;
      }

      const targetPath = target.pathname.replace(/\/index\.html$/i, "/");
      const isNews = /^\/(?:en\/)?news(?:\/|$)/i.test(targetPath);
      const isReviews = /^\/app(?:\/|$)/i.test(targetPath);
      const current =
        (activeSection === "news" && isNews) ||
        (activeSection === "reviews" && isReviews);
      link.classList.toggle("is-current-section", current);
      if (current) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");

      const hostname = target.hostname.toLowerCase();
      const kind = hostname === "t.me" || hostname.endsWith(".t.me")
        ? "telegram"
        : hostname === "vk.com" || hostname.endsWith(".vk.com")
          ? "vk"
          : "";
      if (!kind) return;

      link.classList.add("header-social-link", `header-social-link--${kind}`);
      link.classList.remove("header-quick-link--telegram");
      link.setAttribute(
        "aria-label",
        english
          ? `GPTishka on ${kind === "vk" ? "VK" : "Telegram"}`
          : `GPTishka в ${kind === "vk" ? "VK" : "Telegram"}`
      );
      const existingIcon = link.querySelector(".header-social-icon");
      if (!existingIcon) {
        link.replaceChildren(createSocialIcon(kind));
      } else {
        existingIcon.classList.add(`header-social-icon--${kind}`);
        existingIcon.setAttribute("fill", "currentColor");
      }
    });
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
    enhanceHeaderNavigation();
    enhanceUnifiedFooter();

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
      if (records.some((record) => record.addedNodes.length)) {
        enhanceAll();
        enhanceHeaderNavigation();
        enhanceUnifiedFooter();
      }
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
