(() => {
  const pillLink = document.querySelector(".header-product-pill");
  const pill = pillLink && pillLink.querySelector("span");
  if (!pillLink || !pill) return;

  const english = document.documentElement.lang === "en" || /^\/en(?:\/|$)/.test(location.pathname);
  fetch(`/api/public/products?lang=${english ? "en" : "ru"}`, { credentials: "same-origin", cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .then((payload) => {
      const products = Array.isArray(payload && payload.items) ? payload.items :
        Array.isArray(payload && payload.products) ? payload.products : [];
      const prices = products
        .filter((item) => /codex/i.test([item && item.slug, item && item.product, item && item.baseSlug, item && item.title, ...(Array.isArray(item && item.tags) ? item.tags : [])].join(" ")))
        .map((item) => Number(item && item.price))
        .filter((price) => Number.isFinite(price) && price > 0);
      if (!prices.length) return;
      const price = Math.min(...prices);
      const formatted = price.toLocaleString(english ? "en-US" : "ru-RU", { maximumFractionDigits: 0 });
      pill.textContent = english ? `Codex Credits from ${formatted} RUB` : `Кредиты Codex от ${formatted} ₽`;
      pillLink.setAttribute("aria-label", english ? `Top up Codex Credits from ${formatted} RUB` : `Пополнить кредиты Codex от ${formatted} рублей`);
    })
    .catch(() => {});
})();
