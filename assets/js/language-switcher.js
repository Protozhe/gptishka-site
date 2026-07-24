(() => {
  const VERSION = "20260724-language-slider1";
  const STYLESHEET = "/assets/css/language-slider.css?v=20260724-language-slider1";
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

  function isEnglishPage() {
    if (/^\/en(?:\/|$)/.test(window.location.pathname || "")) return true;
    try {
      return new URLSearchParams(window.location.search).get("lang") === "en";
    } catch (_) {
      return false;
    }
  }

  function targetHref(targetLanguage) {
    const targetUrl = new URL(window.location.href);
    const path = targetUrl.pathname || "/";
    if (targetLanguage === "en") {
      if (!/^\/en(?:\/|$)/.test(path)) {
        if (FALLBACK_ENGLISH_PATHS.has(path)) {
          targetUrl.searchParams.set("lang", "en");
        } else {
          targetUrl.pathname = ("/en" + (path === "/" ? "/" : path)).replace(/\/{2,}/g, "/");
          targetUrl.searchParams.delete("lang");
        }
      }
    } else {
      targetUrl.pathname = path.replace(/^\/en(?=\/|$)/, "") || "/";
      targetUrl.searchParams.delete("lang");
    }
    return `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
  }

  function buildSlider() {
    const currentEnglish = isEnglishPage();
    const targetLanguage = currentEnglish ? "ru" : "en";
    const targetName = targetLanguage === "en" ? "English" : "Русский";
    const targetCode = targetLanguage.toUpperCase();
    const targetFlag = targetLanguage === "en"
      ? "/assets/img/iconeng.png"
      : "/assets/img/iconrus.avif";
    const ariaLabel = currentEnglish ? "Switch to Russian" : "Переключить на English";

    const link = document.createElement("a");
    link.className = `language-slider language-slider--to-${targetLanguage}`;
    link.href = targetHref(targetLanguage);
    link.dataset.languageTarget = targetLanguage;
    link.setAttribute("aria-label", ariaLabel);
    link.setAttribute("title", ariaLabel);
    link.innerHTML = `
      <span class="language-slider__track" aria-hidden="true">
        <span class="language-slider__code">${targetCode}</span>
        <span class="language-slider__thumb">
          <img src="${targetFlag}" alt="" width="24" height="24" loading="eager" decoding="async">
        </span>
      </span>
      <span class="visually-hidden">${targetName}</span>
    `;
    link.addEventListener("click", () => {
      link.classList.add("is-switching");
      document.documentElement.classList.add("is-language-switching");
    });
    return link;
  }

  function enhanceSwitcher(wrapper) {
    if (!(wrapper instanceof Element)) return;
    if (wrapper.dataset.languageSliderVersion === VERSION) return;
    wrapper.dataset.languageSliderVersion = VERSION;
    wrapper.classList.add("language-slider-host");
    wrapper.classList.remove("open");
    wrapper.replaceChildren(buildSlider());
  }

  function enhanceAll() {
    const candidates = document.querySelectorAll(
      "[data-lang-switcher], #langSwitch, .lang-switch, .lang-switcher"
    );
    candidates.forEach(enhanceSwitcher);
  }

  function ensureStylesheet() {
    if (document.querySelector('link[data-language-slider-styles]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = STYLESHEET;
    link.dataset.languageSliderStyles = VERSION;
    document.head.appendChild(link);
  }

  function start() {
    ensureStylesheet();
    enhanceAll();
    const observer = new MutationObserver((records) => {
      if (!records.some((record) => record.addedNodes.length)) return;
      enhanceAll();
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
