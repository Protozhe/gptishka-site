(function () {
  "use strict";

  var ROOT_SELECTOR = "[data-hero-react-root]";
  var WORD_CLASS = "hero-react__word";
  var ACTIVE_CLASS = "is-active";

  function parseInterval(node) {
    var raw = Number(node.getAttribute("data-hero-interval") || 2200);
    if (!Number.isFinite(raw)) return 2200;
    return Math.max(1200, Math.min(8000, raw));
  }

  function parseWords(node) {
    var raw = String(node.getAttribute("data-hero-words") || "").trim();
    if (!raw) return [];
    return raw
      .split("|")
      .map(function (item) { return String(item || "").trim(); })
      .filter(Boolean);
  }

  function getFallbackText(node, selector) {
    var el = node.querySelector(selector);
    return el ? String(el.textContent || "").trim() : "";
  }

  function mountHero(node) {
    if (!node || node.dataset.heroMounted === "1") return;

    var top = String(node.getAttribute("data-hero-top") || "").trim() || getFallbackText(node, "h1");
    var words = parseWords(node);
    var description = String(node.getAttribute("data-hero-description") || "").trim() || getFallbackText(node, "p");
    var cta = String(node.getAttribute("data-hero-cta") || "").trim() || "Open plans";
    var ctaHref = String(node.getAttribute("data-cta-href") || "").trim() || "/#pricing";

    if (!words.length) {
      words = [top || "Subscription"];
    }

    var wordMarkup = words
      .map(function (word, index) {
        var classes = WORD_CLASS + (index === 0 ? " " + ACTIVE_CLASS : "");
        return '<span class="' + classes + '" data-hero-word-index="' + index + '">' + escapeHtml(word) + "</span>";
      })
      .join("");

    var heroRoot = node.querySelector(".hero-react");
    if (!heroRoot) {
      node.innerHTML = [
        '<div class="hero-react">',
        '  <div class="hero-react__headline">',
        '    <h1 class="hero-react__title">',
        '      <span class="hero-react__top">' + escapeHtml(top) + '</span>',
        '      <span class="hero-react__viewport" aria-live="polite">' + wordMarkup + '</span>',
        "    </h1>",
        '    <p class="hero-react__description">' + escapeHtml(description) + "</p>",
        "  </div>",
        '  <div class="hero-react__actions">',
        '    <a class="btn hero-react__btn" href="' + escapeHtmlAttr(ctaHref) + '">' + escapeHtml(cta) + "</a>",
        "  </div>",
        "</div>",
      ].join("");
      heroRoot = node.querySelector(".hero-react");
    }

    if (heroRoot) {
      var topEl = heroRoot.querySelector(".hero-react__top");
      if (topEl) topEl.textContent = top;

      var descEl = heroRoot.querySelector(".hero-react__description");
      if (descEl) descEl.textContent = description;

      var ctaEl = heroRoot.querySelector(".hero-react__btn");
      if (ctaEl) {
        ctaEl.textContent = cta;
        ctaEl.setAttribute("href", ctaHref);
      }

      var viewport = heroRoot.querySelector(".hero-react__viewport");
      if (viewport) {
        var currentWords = Array.prototype.slice.call(viewport.querySelectorAll("." + WORD_CLASS));
        if (currentWords.length !== words.length || !currentWords.length) {
          viewport.innerHTML = wordMarkup;
        } else {
          for (var w = 0; w < currentWords.length; w += 1) {
            currentWords[w].textContent = words[w];
            currentWords[w].setAttribute("data-hero-word-index", String(w));
            currentWords[w].classList.toggle(ACTIVE_CLASS, w === 0);
          }
        }
      }
    }

    node.dataset.heroMounted = "1";

    if (node.__heroRotateTimer) {
      window.clearInterval(node.__heroRotateTimer);
      node.__heroRotateTimer = 0;
    }

    var wordsEls = Array.prototype.slice.call(node.querySelectorAll("." + WORD_CLASS));
    if (wordsEls.length < 2) return;

    // Safety: always keep exactly one active phrase to avoid stacked overlap.
    var cursor = 0;
    for (var j = 0; j < wordsEls.length; j += 1) {
      if (wordsEls[j].classList.contains(ACTIVE_CLASS)) {
        cursor = j;
        break;
      }
    }
    for (var k = 0; k < wordsEls.length; k += 1) {
      wordsEls[k].classList.remove(ACTIVE_CLASS);
    }
    if (wordsEls[cursor]) {
      wordsEls[cursor].classList.add(ACTIVE_CLASS);
    } else {
      cursor = 0;
      wordsEls[0].classList.add(ACTIVE_CLASS);
    }

    var intervalMs = parseInterval(node);
    var body = document.body;
    if (body && (body.classList.contains("low-visual-budget") || body.classList.contains("balanced-visual-budget"))) {
      intervalMs = Math.max(intervalMs, 2600);
    }

    var timerId = 0;
    var scheduleNext = function () {
      timerId = window.setTimeout(rotate, intervalMs);
      node.__heroRotateTimer = timerId;
    };

    var rotate = function () {
      if (document.visibilityState === "hidden") {
        scheduleNext();
        return;
      }

      var nextIndex = (cursor + 1) % wordsEls.length;
      var currentEl = wordsEls[cursor];
      var nextEl = wordsEls[nextIndex];
      if (!nextEl || nextEl === currentEl) {
        scheduleNext();
        return;
      }

      window.requestAnimationFrame(function () {
        for (var n = 0; n < wordsEls.length; n += 1) {
          wordsEls[n].classList.remove(ACTIVE_CLASS);
        }
        nextEl.classList.add(ACTIVE_CLASS);
        cursor = nextIndex;
        scheduleNext();
      });
    };

    scheduleNext();
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeHtmlAttr(value) {
    return escapeHtml(value).replaceAll("`", "&#96;");
  }

  function init() {
    var nodes = Array.prototype.slice.call(document.querySelectorAll(ROOT_SELECTOR));
    for (var i = 0; i < nodes.length; i += 1) {
      mountHero(nodes[i]);
    }
  }

  init();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  }
})();
