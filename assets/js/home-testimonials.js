(function () {
  "use strict";

  var root = document.querySelector("[data-home-testimonials]");
  if (!root) return;

  var viewport = root.querySelector("[data-testimonials-viewport]");
  var cards = Array.from(root.querySelectorAll(".home-testimonial-card"));
  var dots = root.querySelector("[data-testimonials-dots]");
  var previous = root.querySelector("[data-testimonials-prev]");
  var next = root.querySelector("[data-testimonials-next]");
  if (!viewport || !cards.length || !dots || !previous || !next) return;

  var activeIndex = 0;
  var targetIndex = null;
  var scrollTimer = 0;
  var scrollFrame = 0;
  var autoTimer = 0;
  var mobile = window.matchMedia("(max-width: 760px)");
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var english = /^en\b/i.test(document.documentElement.lang || "");
  var status = document.createElement("span");
  status.className = "home-testimonials__status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  root.querySelector(".home-testimonials__footer").prepend(status);

  function cardStep() {
    if (cards.length < 2) return viewport.clientWidth;
    return cards[1].offsetLeft - cards[0].offsetLeft;
  }

  function visibleCount() {
    return Math.max(1, Math.round(viewport.clientWidth / Math.max(1, cards[0].offsetWidth)));
  }

  function pageCount() {
    return Math.max(1, cards.length - visibleCount() + 1);
  }

  function syncDots() {
    if (!dots) return;
    var count = pageCount();
    activeIndex = Math.min(activeIndex, count - 1);
    var label = english ? "Review " + (activeIndex + 1) + " of " + cards.length : "Отзыв " + (activeIndex + 1) + " из " + cards.length;
    if (status.textContent !== label) status.textContent = label;
    if (dots.children.length !== count) {
      dots.replaceChildren();
      for (var index = 0; index < count; index += 1) {
        var dot = document.createElement("button");
        dot.type = "button";
        dot.className = "home-testimonials__dot";
        dot.setAttribute("aria-label", (english ? "Show review " : "Показать отзыв ") + (index + 1));
        dot.dataset.index = String(index);
        dots.append(dot);
      }
    }
    Array.from(dots.children).forEach(function (dot, index) {
      dot.classList.toggle("is-active", index === activeIndex);
      dot.setAttribute("aria-current", index === activeIndex ? "true" : "false");
    });
  }

  function goTo(index, behavior) {
    var count = pageCount();
    activeIndex = ((index % count) + count) % count;
    targetIndex = activeIndex;
    viewport.scrollTo({ left: activeIndex * cardStep(), behavior: reducedMotion.matches ? "instant" : (behavior || "smooth") });
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(settleScroll, 180);
    syncDots();
  }

  function startAuto() {
    window.clearInterval(autoTimer);
    if (mobile.matches || reducedMotion.matches || document.visibilityState === "hidden"
      || root.matches(":hover") || root.contains(document.activeElement)) return;
    autoTimer = window.setInterval(function () { goTo(activeIndex + 1); }, 6500);
  }

  previous.addEventListener("click", function () { goTo(activeIndex - 1); startAuto(); });
  next.addEventListener("click", function () { goTo(activeIndex + 1); startAuto(); });
  dots.addEventListener("click", function (event) {
    var dot = event.target.closest("[data-index]");
    if (!dot) return;
    goTo(Number(dot.dataset.index));
    startAuto();
  });
  function readScrollIndex() {
    return Math.max(0, Math.min(pageCount() - 1, Math.round(viewport.scrollLeft / Math.max(1, cardStep()))));
  }

  function settleScroll() {
    window.clearTimeout(scrollTimer);
    targetIndex = null;
    activeIndex = readScrollIndex();
    syncDots();
  }

  viewport.addEventListener("scroll", function () {
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(settleScroll, 180);
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(function () {
      scrollFrame = 0;
      // Keep the requested destination during animation so rapid clicks advance
      // from it, and live announcements do not read every intervening review.
      if (targetIndex !== null) return;
      activeIndex = readScrollIndex();
      syncDots();
    });
  }, { passive: true });
  viewport.addEventListener("scrollend", settleScroll);
  ["pointerdown", "touchstart", "wheel"].forEach(function (type) {
    viewport.addEventListener(type, function () { targetIndex = null; }, { passive: true });
  });
  root.addEventListener("mouseenter", function () { window.clearInterval(autoTimer); });
  root.addEventListener("mouseleave", startAuto);
  root.addEventListener("focusin", function () { window.clearInterval(autoTimer); });
  root.addEventListener("focusout", startAuto);
  viewport.addEventListener("keydown", function (event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    goTo(activeIndex + (event.key === "ArrowRight" ? 1 : -1));
  });
  mobile.addEventListener("change", startAuto);
  reducedMotion.addEventListener("change", startAuto);
  document.addEventListener("visibilitychange", startAuto);
  window.addEventListener("resize", function () { goTo(activeIndex, "instant"); }, { passive: true });

  syncDots();
  startAuto();
})();
