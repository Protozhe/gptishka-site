(function () {
  "use strict";

  var AUTOPLAY_MS = 6200;
  var REDUCED_MOTION = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function text(value) {
    return String(value || "").trim();
  }

  function safeUrl(value) {
    var url = text(value);
    if (!url) return "";
    if (/^javascript:/i.test(url)) return "";
    return url;
  }

  function optimizedShortcutImageUrl(value) {
    var url = safeUrl(value);
    var pathname = url.split(/[?#]/, 1)[0].toLowerCase();
    if (pathname === "/assets/img/home/topups-shortcut.png") {
      return "/assets/img/home/topups-shortcut.webp?v=20260721-shortcuts-webp1";
    }
    if (pathname === "/assets/img/home/ai-shortcut.png") {
      return "/assets/img/home/ai-shortcut.webp?v=20260721-shortcuts-webp1";
    }
    if (pathname === "/assets/img/home/vpn-shortcut-bg.png") {
      return "/assets/img/home/vpn-shortcut-bg.webp?v=20260721-vpn-bg-webp1";
    }
    if (pathname === "/assets/img/services/vpn-card.png") {
      return "/assets/img/services/vpn-card.webp?v=20260721-cards-webp1";
    }
    if (pathname === "/assets/img/services/vpn-card-hover.png") {
      return "/assets/img/services/vpn-card-hover.webp?v=20260721-cards-webp1";
    }
    if (pathname === "/assets/img/services/vstar-card.png") {
      return "/assets/img/services/vstar-card.webp?v=20260721-cards-webp1";
    }
    if (pathname === "/assets/img/services/vstar-card-hover.png") {
      return "/assets/img/services/vstar-card-hover.webp?v=20260721-cards-webp1";
    }
    return url;
  }

  function optimizedSlideImageUrl(value) {
    var url = safeUrl(value);
    var pathname = url.split(/[?#]/, 1)[0].toLowerCase();
    if (pathname === "/assets/img/home/vpn-promo-bg.png") {
      return "/assets/img/home/vpn-promo-bg.webp?v=20260721-vpn-bg-webp1";
    }
    return url;
  }

  function fallbackSlideImageUrl(slide) {
    var id = text(slide && slide.id).toLowerCase();
    var themeClass = text(slide && (slide.themeClass || slide.className)).toLowerCase();
    if (id === "topups" || themeClass.indexOf("home-promo-slide--topups") !== -1) {
      return "/assets/img/home/topups-promo-bg.webp?v=20260721-promo-webp1";
    }
    if (id === "vpn" || themeClass.indexOf("home-promo-slide--vpn") !== -1) {
      return "/assets/img/home/vpn-promo-bg.webp?v=20260721-vpn-bg-webp1";
    }
    return "";
  }

  function ensureSlideBackground(slide) {
    if (!slide || slide.getAttribute("data-promo-image-loaded") === "true") return;
    var imageUrl = safeUrl(slide.getAttribute("data-promo-image-url")) || fallbackSlideImageUrl(slide);
    if (!imageUrl) return;
    slide.style.setProperty("--promo-bg", 'linear-gradient(90deg, rgba(0,0,0,.82), rgba(0,0,0,.28)), url("' + imageUrl.replace(/"/g, "%22") + '") center / cover no-repeat');
    slide.setAttribute("data-promo-image-loaded", "true");
  }

  function getLang() {
    return String(document.documentElement.lang || "").toLowerCase().startsWith("en") ||
      String(window.location.pathname || "").toLowerCase().startsWith("/en/")
      ? "en"
      : "ru";
  }

  function createSlideElement(slide, active) {
    var article = document.createElement("article");
    article.className = "home-promo-slide " + text(slide.themeClass || "") + (active ? " is-active" : "");
    article.setAttribute("data-home-promo-slide", "");

    var imageUrl = optimizedSlideImageUrl(slide.imageUrl) || fallbackSlideImageUrl(slide);
    if (imageUrl) {
      article.setAttribute("data-promo-image-url", imageUrl);
    }

    var content = document.createElement("div");
    content.className = "home-promo-slide__content";

    var badge = text(slide.badge);
    if (badge) {
      var badgeEl = document.createElement("span");
      badgeEl.className = "home-promo-slide__badge";
      badgeEl.textContent = badge;
      content.appendChild(badgeEl);
    }

    var title = document.createElement("h2");
    var lines = Array.isArray(slide.titleLines) ? slide.titleLines : [];
    if (!lines.length && slide.title) lines = [slide.title];
    lines.filter(Boolean).forEach(function (line) {
      var span = document.createElement("span");
      span.className = "home-promo-slide__title-line";
      span.textContent = text(line);
      title.appendChild(span);
    });
    if (!title.children.length) title.textContent = "GPTishka";
    content.appendChild(title);

    var description = text(slide.description);
    if (description) {
      var paragraph = document.createElement("p");
      paragraph.textContent = description;
      content.appendChild(paragraph);
    }

    var buttonText = text(slide.buttonText);
    var buttonHref = safeUrl(slide.buttonHref || slide.buttonUrl);
    if (buttonText && buttonHref) {
      var link = document.createElement("a");
      link.className = "home-promo-slide__button";
      link.href = buttonHref;
      link.textContent = buttonText;
      content.appendChild(link);
    }

    article.appendChild(content);
    return article;
  }

  function renderShortcuts(items) {
    if (!Array.isArray(items) || !items.length) return;
    var grid = document.querySelector(".home-service-shortcuts__grid");
    if (!grid) return;

    grid.innerHTML = "";
    items.forEach(function (item) {
      var href = safeUrl(item.href) || "#";
      var link = document.createElement("a");
      link.className = "home-service-shortcut " + text(item.themeClass || "");
      link.href = href;
      link.setAttribute("aria-label", text(item.ariaLabel) || text(item.title) || "Open section");

      var imageUrl = optimizedShortcutImageUrl(item.imageUrl);
      var hoverImageUrl = optimizedShortcutImageUrl(item.hoverImageUrl);
      var logoUrl = optimizedShortcutImageUrl(item.logoUrl);

      var art = document.createElement("span");
      art.className = "home-service-shortcut__art" + (hoverImageUrl ? " has-hover" : "");
      art.setAttribute("aria-hidden", "true");

      if (logoUrl && !imageUrl) {
        var logo = document.createElement("img");
        logo.className = "home-service-shortcut__logo";
        logo.src = logoUrl;
        logo.alt = "";
        logo.loading = "lazy";
        logo.decoding = "async";
        art.appendChild(logo);
      } else if (imageUrl) {
        var img = document.createElement("img");
        img.className = "home-service-shortcut__image" + (hoverImageUrl ? " home-service-shortcut__image--primary" : "");
        img.src = imageUrl;
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        art.appendChild(img);
        if (hoverImageUrl) {
          var hover = document.createElement("img");
          hover.className = "home-service-shortcut__image home-service-shortcut__image--hover";
          hover.src = hoverImageUrl;
          hover.alt = "";
          hover.loading = "lazy";
          hover.decoding = "async";
          art.appendChild(hover);
        }
      }

      var title = document.createElement("span");
      title.className = "home-service-shortcut__title";
      title.textContent = text(item.title);

      link.appendChild(art);
      link.appendChild(title);
      grid.appendChild(link);
    });
  }

  function initSlider(root, payload) {
    var track = root.querySelector("[data-home-promo-slider-track]");
    var dotsRoot = root.querySelector("[data-home-promo-dots]");
    var prev = root.querySelector("[data-home-promo-prev]");
    var next = root.querySelector("[data-home-promo-next]");
    if (!track || !dotsRoot) return;

    var activeIndex = 0;
    var timer = 0;
    var paused = false;

    function slides() {
      return Array.prototype.slice.call(track.querySelectorAll("[data-home-promo-slide]"));
    }

    function dots() {
      return Array.prototype.slice.call(dotsRoot.querySelectorAll("[data-home-promo-dot]"));
    }

    function renderDots() {
      dotsRoot.innerHTML = "";
      slides().forEach(function (_slide, index) {
        var dot = document.createElement("button");
        dot.type = "button";
        dot.className = "home-promo-slider__dot" + (index === activeIndex ? " is-active" : "");
        dot.setAttribute("data-home-promo-dot", String(index));
        dot.setAttribute("aria-label", (getLang() === "en" ? "Show banner " : "Показать баннер ") + (index + 1));
        dot.addEventListener("click", function () {
          show(index, true);
        });
        dotsRoot.appendChild(dot);
      });
    }

    function show(index, manual) {
      var list = slides();
      if (!list.length) return;
      activeIndex = ((index % list.length) + list.length) % list.length;
      ensureSlideBackground(list[activeIndex]);
      list.forEach(function (slide, idx) {
        slide.classList.toggle("is-active", idx === activeIndex);
      });
      dots().forEach(function (dot, idx) {
        dot.classList.toggle("is-active", idx === activeIndex);
        dot.setAttribute("aria-current", idx === activeIndex ? "true" : "false");
      });
      if (manual) restart();
    }

    function stop() {
      if (timer) window.clearInterval(timer);
      timer = 0;
    }

    function start() {
      stop();
      if (REDUCED_MOTION || slides().length < 2 || paused) return;
      timer = window.setInterval(function () {
        show(activeIndex + 1, false);
      }, AUTOPLAY_MS);
    }

    function restart() {
      stop();
      start();
    }

    if (Array.isArray(payload.slides) && payload.slides.length) {
      track.innerHTML = "";
      payload.slides.forEach(function (slide, index) {
        track.appendChild(createSlideElement(slide, index === 0));
      });
    }

    if (prev) prev.addEventListener("click", function () { show(activeIndex - 1, true); });
    if (next) next.addEventListener("click", function () { show(activeIndex + 1, true); });
    root.addEventListener("mouseenter", function () { paused = true; stop(); });
    root.addEventListener("mouseleave", function () { paused = false; start(); });
    root.addEventListener("focusin", function () { paused = true; stop(); });
    root.addEventListener("focusout", function () { paused = false; start(); });

    renderDots();
    show(0, false);
    start();
  }

  function initWithPayload(payload) {
    payload = payload || {};
    renderShortcuts(payload.shortcuts);
    Array.prototype.slice.call(document.querySelectorAll("[data-home-promo-slider]")).forEach(function (root) {
      initSlider(root, payload);
    });
  }

  function boot() {
    var lang = getLang();
    fetch("/api/public/homepage-content?lang=" + encodeURIComponent(lang), { cache: "no-store", credentials: "same-origin" })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(initWithPayload)
      .catch(function () { initWithPayload({}); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
