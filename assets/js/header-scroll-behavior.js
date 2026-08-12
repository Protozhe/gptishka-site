(() => {
  "use strict";

  if (window.__gptishkaHeaderScrollBehavior) return;
  window.__gptishkaHeaderScrollBehavior = true;

  let lastScrollY = Math.max(0, window.scrollY || 0);
  let ticking = false;
  const hideStartY = 80;
  const deltaThreshold = 6;

  const updateHeader = () => {
    const header = document.querySelector("body > header.gptishka-canonical-header, body > header");
    const currentScrollY = Math.max(0, window.scrollY || 0);
    const delta = currentScrollY - lastScrollY;

    if (header) {
      header.classList.toggle("is-scrolled", currentScrollY > 10);

      if (currentScrollY <= 10) {
        header.classList.remove("header-hidden");
      } else if (currentScrollY > hideStartY && delta > deltaThreshold) {
        header.classList.add("header-hidden");
      } else if (delta < -deltaThreshold) {
        header.classList.remove("header-hidden");
      }
    }

    lastScrollY = currentScrollY;
    ticking = false;
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(updateHeader);
  };

  updateHeader();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("pageshow", updateHeader);
})();
