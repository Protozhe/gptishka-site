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

  function shortcutImageVariants(value) {
    var url = optimizedShortcutImageUrl(value);
    var pathname = url.split(/[?#]/, 1)[0].toLowerCase();
    var basename = "";
    if (pathname === "/assets/img/home/topups-shortcut.webp") {
      basename = "topups-shortcut";
    } else if (pathname === "/assets/img/home/ai-shortcut.webp") {
      basename = "ai-shortcut";
    }
    if (!basename) return { src: url, srcset: "" };
    return {
      src: "/assets/img/home/" + basename + "-384.webp?v=20260721-shortcuts-responsive1",
      srcset:
        "/assets/img/home/" + basename + "-384.webp?v=20260721-shortcuts-responsive1 384w, " +
        "/assets/img/home/" + basename + "-724.webp?v=20260721-shortcuts-responsive1 724w, " +
        "/assets/img/home/" + basename + ".webp?v=20260721-shortcuts-responsive1 1448w"
    };
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

  function preloadFollowingSlide(list, activeIndex) {
    if (!list || list.length < 2) return;
    var preload = function () {
      ensureSlideBackground(list[(activeIndex + 1) % list.length]);
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(preload, { timeout: 1400 });
    } else {
      window.setTimeout(preload, 700);
    }
  }

  function getLang() {
    return String(document.documentElement.lang || "").toLowerCase().startsWith("en") ||
      String(window.location.pathname || "").toLowerCase().startsWith("/en/")
      ? "en"
      : "ru";
  }

  function localizedRouteUrl(value) {
    var url = safeUrl(value);
    if (!url || getLang() !== "en") return url;
    try {
      var target = new URL(url, window.location.origin);
      if (target.origin !== window.location.origin) return url;
      var match = target.pathname.match(/^\/(?:en\/)?(chatgpt|claude|supergrok)(?:\.html)?\/?$/i);
      if (!match) return url;
      target.pathname = "/en/" + match[1].toLowerCase() + ".html";
      return target.pathname + target.search + target.hash;
    } catch (_) {
      return url;
    }
  }

  function isAiBattleSlide(slide) {
    var id = text(slide && slide.id).toLowerCase();
    var themeClass = text(slide && (slide.themeClass || slide.className)).toLowerCase();
    return id === "ai-battle" || themeClass.indexOf("home-promo-slide--ai-battle") !== -1;
  }

  function createAiBattleContent(article, slide) {
    var english = getLang() === "en";
    var battle = document.createElement("div");
    battle.className = "home-ai-battle";

    var intro = document.createElement("div");
    intro.className = "home-ai-battle__intro";

    var title = document.createElement("h2");
    title.className = "home-ai-battle__title";
    var chatgptName = document.createElement("span");
    chatgptName.className = "home-ai-battle__title-chatgpt";
    chatgptName.textContent = "ChatGPT";
    var versus = document.createElement("span");
    versus.className = "home-ai-battle__versus";
    versus.textContent = "VS";
    var claudeName = document.createElement("span");
    claudeName.className = "home-ai-battle__title-claude";
    claudeName.textContent = "Claude";
    title.appendChild(chatgptName);
    title.appendChild(versus);
    title.appendChild(claudeName);

    var description = document.createElement("p");
    description.className = "home-ai-battle__description";
    description.textContent = text(slide.description) || (english
      ? "Choose your favorite and see which AI is leading right now."
      : "Выбери своего фаворита в мире искусственного интеллекта.");

    intro.appendChild(title);
    intro.appendChild(description);

    var choices = document.createElement("div");
    choices.className = "home-ai-battle__choices";
    ["chatgpt", "claude"].forEach(function (side) {
      var label = side === "chatgpt" ? "ChatGPT" : "Claude";
      var button = document.createElement("button");
      button.type = "button";
      button.className = "home-ai-battle__choice home-ai-battle__choice--" + side;
      button.setAttribute("data-ai-battle-choice", side);
      button.setAttribute("data-ai-battle-href", localizedRouteUrl("/" + side));
      button.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-label", english ? "Vote for " + label : "Выбрать " + label);

      var logo = document.createElement("span");
      logo.className = "home-ai-battle__logo home-ai-battle__logo--" + side;
      logo.setAttribute("aria-hidden", "true");

      var copy = document.createElement("span");
      copy.className = "home-ai-battle__choice-copy";
      var name = document.createElement("strong");
      name.textContent = label;
      var callToAction = document.createElement("small");
      callToAction.textContent = english ? "I'm on this side" : "Я на этой стороне";
      copy.appendChild(name);
      copy.appendChild(callToAction);

      var percent = document.createElement("span");
      percent.className = "home-ai-battle__percent";
      percent.setAttribute("data-ai-battle-percent", side);
      percent.textContent = "50%";

      button.appendChild(logo);
      button.appendChild(copy);
      button.appendChild(percent);
      choices.appendChild(button);
    });

    var stats = document.createElement("div");
    stats.className = "home-ai-battle__stats";
    var bar = document.createElement("div");
    bar.className = "home-ai-battle__bar";
    bar.setAttribute("aria-hidden", "true");
    var fill = document.createElement("span");
    fill.className = "home-ai-battle__bar-chatgpt";
    fill.setAttribute("data-ai-battle-bar", "");
    bar.appendChild(fill);
    var total = document.createElement("span");
    total.className = "home-ai-battle__total";
    total.setAttribute("data-ai-battle-total", "");
    total.textContent = english ? "No clicks yet — be the first" : "Пока 0 кликов — выбери первым";
    var status = document.createElement("span");
    status.className = "home-ai-battle__status";
    status.setAttribute("data-ai-battle-status", "");
    status.setAttribute("aria-live", "polite");
    stats.appendChild(bar);
    stats.appendChild(total);
    stats.appendChild(status);

    battle.appendChild(intro);
    battle.appendChild(choices);
    battle.appendChild(stats);
    article.appendChild(battle);
  }

  function renderAiBattleStats(article, stats) {
    var english = getLang() === "en";
    var chatgptPercent = Number(stats && stats.chatgptPercent);
    var claudePercent = Number(stats && stats.claudePercent);
    var total = Number(stats && stats.total);
    if (!Number.isFinite(chatgptPercent)) chatgptPercent = 50;
    if (!Number.isFinite(claudePercent)) claudePercent = 100 - chatgptPercent;
    if (!Number.isFinite(total) || total < 0) total = 0;

    var chatgptEl = article.querySelector('[data-ai-battle-percent="chatgpt"]');
    var claudeEl = article.querySelector('[data-ai-battle-percent="claude"]');
    var barEl = article.querySelector("[data-ai-battle-bar]");
    var totalEl = article.querySelector("[data-ai-battle-total]");
    if (chatgptEl) chatgptEl.textContent = chatgptPercent + "%";
    if (claudeEl) claudeEl.textContent = claudePercent + "%";
    if (barEl) barEl.style.width = chatgptPercent + "%";
    if (totalEl) {
      totalEl.textContent = total > 0
        ? total.toLocaleString(english ? "en-US" : "ru-RU") + (english ? " total clicks" : " кликов всего")
        : (english ? "No clicks yet — be the first" : "Пока 0 кликов — выбери первым");
    }
  }

  function initAiBattleSlide(article) {
    if (!article || article.getAttribute("data-ai-battle-ready") === "true") return;
    article.setAttribute("data-ai-battle-ready", "true");
    var buttons = Array.prototype.slice.call(article.querySelectorAll("[data-ai-battle-choice]"));
    var status = article.querySelector("[data-ai-battle-status]");

    fetch("/api/public/ai-battle", { cache: "no-store", credentials: "same-origin" })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (stats) { if (stats) renderAiBattleStats(article, stats); })
      .catch(function () {});

    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        var side = button.getAttribute("data-ai-battle-choice");
        var targetUrl = safeUrl(button.getAttribute("data-ai-battle-href")) || localizedRouteUrl("/" + side);
        var redirected = false;
        var openProduct = function () {
          if (redirected || !targetUrl) return;
          redirected = true;
          window.location.assign(targetUrl);
        };
        var redirectTimer = window.setTimeout(openProduct, 1200);
        buttons.forEach(function (item) { item.disabled = true; });
        if (status) status.textContent = getLang() === "en" ? "Counting your click…" : "Считаем твой клик…";
        fetch("/api/public/ai-battle", {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ side: side })
        })
          .then(function (response) {
            if (!response.ok) throw new Error("Vote request failed");
            return response.json();
          })
          .then(function (stats) {
            renderAiBattleStats(article, stats);
            buttons.forEach(function (item) {
              item.setAttribute("aria-pressed", item === button ? "true" : "false");
            });
            if (status) status.textContent = getLang() === "en" ? "Your click is counted" : "Твой выбор учтён";
            if (typeof window.gptishkaTrackEvent === "function") {
              window.gptishkaTrackEvent("ai_battle_click", { side: side });
            }
          })
          .catch(function () {
            if (status) status.textContent = getLang() === "en" ? "Please try again" : "Не получилось — попробуй ещё раз";
          })
          .finally(function () {
            window.clearTimeout(redirectTimer);
            buttons.forEach(function (item) { item.disabled = false; });
            openProduct();
          });
      });
    });
  }

  function createSlideElement(slide, active) {
    var article = document.createElement("article");
    article.className = "home-promo-slide " + text(slide.themeClass || "") + (active ? " is-active" : "");
    article.setAttribute("data-home-promo-slide", "");

    var imageUrl = optimizedSlideImageUrl(slide.imageUrl) || fallbackSlideImageUrl(slide);
    if (imageUrl) {
      article.setAttribute("data-promo-image-url", imageUrl);
    }

    if (isAiBattleSlide(slide)) {
      createAiBattleContent(article, slide);
      return article;
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
    var buttonHref = localizedRouteUrl(slide.buttonHref || slide.buttonUrl);
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
      var href = localizedRouteUrl(item.href) || "#";
      var link = document.createElement("a");
      link.className = "home-service-shortcut " + text(item.themeClass || "");
      link.href = href;
      link.setAttribute("aria-label", text(item.ariaLabel) || text(item.title) || "Open section");

      var image = shortcutImageVariants(item.imageUrl);
      var imageUrl = image.src;
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
        if (image.srcset) {
          img.srcset = image.srcset;
          img.sizes = "(max-width: 760px) calc((100vw - 26px) / 2), min(490px, 50vw)";
        }
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
      preloadFollowingSlide(list, activeIndex);
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

    slides().forEach(function (slide) {
      if (slide.classList.contains("home-promo-slide--ai-battle")) initAiBattleSlide(slide);
    });

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
