(function () {
  "use strict";

  var root = document.querySelector("[data-home-testimonials]");
  if (!root) return;

  var viewport = root.querySelector("[data-testimonials-viewport]");
  var cards = Array.from(root.querySelectorAll(".home-testimonial-card"));
  var dots = root.querySelector("[data-testimonials-dots]");
  var previous = root.querySelector("[data-testimonials-prev]");
  var next = root.querySelector("[data-testimonials-next]");
  var activeIndex = 0;
  var autoTimer = 0;

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
    if (dots.children.length !== count) {
      dots.replaceChildren();
      for (var index = 0; index < count; index += 1) {
        var dot = document.createElement("button");
        dot.type = "button";
        dot.className = "home-testimonials__dot";
        dot.setAttribute("aria-label", "Показать отзыв " + (index + 1));
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
    activeIndex = (index + count) % count;
    viewport.scrollTo({ left: activeIndex * cardStep(), behavior: behavior || "smooth" });
    syncDots();
  }

  function startAuto() {
    window.clearInterval(autoTimer);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
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
  viewport.addEventListener("scroll", function () {
    window.requestAnimationFrame(function () {
      activeIndex = Math.max(0, Math.min(pageCount() - 1, Math.round(viewport.scrollLeft / Math.max(1, cardStep()))));
      syncDots();
    });
  }, { passive: true });
  root.addEventListener("mouseenter", function () { window.clearInterval(autoTimer); });
  root.addEventListener("mouseleave", startAuto);
  root.addEventListener("focusin", function () { window.clearInterval(autoTimer); });
  root.addEventListener("focusout", startAuto);
  window.addEventListener("resize", syncDots, { passive: true });

  syncDots();
  startAuto();
})();
