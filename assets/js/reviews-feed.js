(() => {
  const feed = document.getElementById("telegramReviewsFeed");
  if (!feed) return;

  const channelUrl = "https://t.me/otzivigptishkashop";
  const isEn = String(document.documentElement.lang || "ru").toLowerCase().startsWith("en");
  const REVIEWS_CACHE_KEY = "gptishka_reviews_cache_v1";
  const REVIEWS_CACHE_TS_KEY = "gptishka_reviews_cache_ts_v1";
  const REVIEWS_CACHE_TTL_MS = 3 * 60 * 60 * 1000;
  const REVIEWS_API_URL = "/api/reviews/telegram?limit=20";
  const REVIEWS_REQUEST_TIMEOUT_MS = 7000;

  const i18n = isEn
    ? {
        empty: "No reviews yet. Open channel:",
        error: "Unable to load reviews right now. Open channel:",
        openPost: "Open post",
        viewsPrefix: "Views",
        imageAlt: "Review image",
      }
    : {
        empty: "Пока нет отзывов. Откройте канал:",
        error: "Не удалось загрузить отзывы. Откройте канал:",
        openPost: "Открыть пост",
        viewsPrefix: "Просмотры",
        imageAlt: "Фото отзыва",
      };

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatDate(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString(isEn ? "en-US" : "ru-RU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(REVIEWS_CACHE_KEY);
      const ts = Number(localStorage.getItem(REVIEWS_CACHE_TS_KEY) || 0);
      const items = JSON.parse(raw || "[]");
      const validItems = Array.isArray(items) ? items : [];
      const hasItems = validItems.length > 0;
      return {
        items: validItems,
        hasItems,
        isFresh: hasItems && Date.now() - ts < REVIEWS_CACHE_TTL_MS,
      };
    } catch (_) {
      return { items: [], hasItems: false, isFresh: false };
    }
  }

  function writeCache(items) {
    try {
      localStorage.setItem(REVIEWS_CACHE_KEY, JSON.stringify(items));
      localStorage.setItem(REVIEWS_CACHE_TS_KEY, String(Date.now()));
    } catch (_) {
      // Ignore storage write errors in private mode.
    }
  }

  function renderEmpty(messageType) {
    const text = messageType === "error" ? i18n.error : i18n.empty;
    feed.innerHTML =
      '<div class="telegram-reviews-empty">' +
      `${escapeHtml(text)} ` +
      `<a href="${channelUrl}" target="_blank" rel="noopener noreferrer">@otzivigptishkashop</a>.` +
      "</div>";
  }

  function renderItems(items) {
    if (!Array.isArray(items) || !items.length) {
      renderEmpty("empty");
      return;
    }

    feed.innerHTML = items
      .map(item => {
        const author = escapeHtml(item.author || "Telegram");
        const text = escapeHtml(item.text || "");
        const date = formatDate(item.date);
        const views = item.views
          ? ` · ${escapeHtml(i18n.viewsPrefix)}: ${escapeHtml(item.views)}`
          : "";
        const url = escapeHtml(item.url || channelUrl);
        const avatar = item.authorPhotoUrl
          ? `<img src="${escapeHtml(item.authorPhotoUrl)}" alt="${author}" loading="lazy" decoding="async">`
          : "TG";
        const image = item.imageUrl
          ? `<img class="telegram-review-image" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(i18n.imageAlt)}" loading="lazy" decoding="async">`
          : "";

        return (
          '<article class="review">' +
          '  <div class="review-header">' +
          `    <div class="avatar">${avatar}</div>` +
          "    <div>" +
          `      <div class="review-name">${author}</div>` +
          `      <div class="review-date">${date}${views}</div>` +
          "    </div>" +
          "  </div>" +
          `  <div class="review-text">${text}</div>` +
          `  ${image}` +
          `  <a class="telegram-review-link" href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(i18n.openPost)}</a>` +
          "</article>"
        );
      })
      .join("");
  }

  const cached = readCache();
  if (cached.hasItems) {
    renderItems(cached.items);
  }
  if (cached.isFresh) {
    return;
  }

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeout = window.setTimeout(() => {
    if (controller) controller.abort();
  }, REVIEWS_REQUEST_TIMEOUT_MS);

  const requestOptions = {
    headers: { Accept: "application/json" },
    cache: "no-store",
  };
  if (controller) {
    requestOptions.signal = controller.signal;
  }

  fetch(REVIEWS_API_URL, requestOptions)
    .then(response => (response.ok ? response.json() : Promise.reject(new Error("reviews api failed"))))
    .then(payload => {
      const items = Array.isArray(payload?.items) ? payload.items : [];
      if (!items.length) {
        if (!cached.hasItems) renderEmpty("empty");
        return;
      }
      writeCache(items);
      renderItems(items);
    })
    .catch(() => {
      if (!cached.hasItems) renderEmpty("error");
    })
    .finally(() => {
      window.clearTimeout(timeout);
    });
})();
