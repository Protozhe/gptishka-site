(() => {
  const root = document.getElementById("newsHub");
  const grid = document.getElementById("newsGrid");
  const empty = document.getElementById("newsEmpty");
  const more = document.getElementById("newsMore");
  if (!root || !grid || !empty || !more) return;

  const language = document.body.dataset.newsLanguage === "en" ? "en" : "ru";
  const locale = language === "en" ? "en-US" : "ru-RU";
  const labels = language === "en"
    ? {
        source: "Telegram",
        read: "Read on Telegram",
        video: "Video",
      }
    : {
        source: "Telegram",
        read: "Читать в Telegram",
        video: "Видео",
      };
  const pageSize = 5;
  let visibleCount = pageSize;
  let items = [];
  let appliedFetchedAt = 0;
  const mediaObserver = "IntersectionObserver" in window
    ? new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const image = entry.target;
          const source = image.dataset.src;
          if (source) image.src = source;
          mediaObserver.unobserve(image);
        });
      }, { rootMargin: "160px 0px" })
    : null;

  function textNode(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = String(value || "");
    return element;
  }

  function safeDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  }

  function renderCard(item) {
    const article = document.createElement("article");
    article.className = `news-card ${item.imageUrl ? "news-card--with-media" : "news-card--text-only"}`;

    if (item.imageUrl) {
      const media = document.createElement("div");
      media.className = "news-card__media";

      const image = document.createElement("img");
      image.dataset.src = item.imageUrl;
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      image.fetchPriority = "low";
      image.width = 640;
      image.height = 480;
      image.referrerPolicy = "no-referrer";
      media.appendChild(image);
      if (mediaObserver) mediaObserver.observe(image);
      else image.src = item.imageUrl;

      if (item.hasVideo) {
        const badge = textNode("span", "news-card__video", labels.video);
        badge.setAttribute("aria-hidden", "true");
        media.appendChild(badge);
      }
      article.appendChild(media);
    }

    const body = document.createElement("div");
    body.className = "news-card__body";

    const meta = document.createElement("div");
    meta.className = "news-card__meta";
    meta.appendChild(textNode("span", "news-card__source", language === "en" ? "News" : "Новости"));
    meta.appendChild(textNode("span", "", safeDate(item.date)));
    body.appendChild(meta);

    const rawText = String(item.text || "").trim();
    const lines = rawText.split(/\n+/).map(line => line.trim()).filter(Boolean);
    const firstLine = lines[0] || "";
    const hasHeadline = firstLine.length >= 8 && firstLine.length <= 150 && lines.length > 1;
    if (hasHeadline) body.appendChild(textNode("h2", "news-card__title", firstLine));

    const readableText = hasHeadline ? lines.slice(1).join("\n\n") : rawText;
    const copy = textNode("p", "news-card__text", readableText);
    copy.id = `news-copy-${String(item.postId || Math.random()).replace(/[^a-z0-9_-]/gi, "-")}`;
    body.appendChild(copy);

    const actions = document.createElement("div");
    actions.className = "news-card__actions";

    if (readableText.length > 420) {
      const expand = textNode("button", "news-card__expand", language === "en" ? "Read full article" : "Читать полностью");
      expand.type = "button";
      expand.setAttribute("aria-expanded", "false");
      expand.setAttribute("aria-controls", copy.id);
      expand.addEventListener("click", () => {
        const expanded = article.classList.toggle("is-expanded");
        expand.setAttribute("aria-expanded", String(expanded));
        expand.textContent = expanded
          ? (language === "en" ? "Collapse" : "Свернуть")
          : (language === "en" ? "Read full article" : "Читать полностью");
      });
      actions.appendChild(expand);
    }

    if (item.url) {
      const link = document.createElement("a");
      link.className = "news-card__link";
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.appendChild(document.createTextNode(language === "en" ? "Original on Telegram" : "Оригинал в Telegram"));
      const arrow = document.createElement("span");
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "↗";
      link.appendChild(arrow);
      actions.appendChild(link);
    }
    body.appendChild(actions);

    article.appendChild(body);
    return article;
  }

  function render() {
    if (mediaObserver) mediaObserver.disconnect();
    grid.replaceChildren();
    const fragment = document.createDocumentFragment();
    items.slice(0, visibleCount).forEach(item => {
      fragment.appendChild(renderCard(item));
    });
    grid.appendChild(fragment);
    grid.setAttribute("aria-busy", "false");
    empty.hidden = items.length > 0;
    more.hidden = visibleCount >= items.length;
  }

  function payloadItems(payload) {
    return (Array.isArray(payload?.items) ? payload.items : []).filter(item => {
      const text = String(item?.text || "").trim();
      return item && item.url && !/^Channel (?:photo updated|created)$/i.test(text);
    });
  }

  function applyPayload(payload) {
    const nextItems = payloadItems(payload);
    if (!nextItems.length) return false;
    const nextFetchedAt = Date.parse(String(payload?.fetchedAt || "")) || 0;
    if (appliedFetchedAt && nextFetchedAt && nextFetchedAt < appliedFetchedAt) return false;
    items = nextItems;
    appliedFetchedAt = Math.max(appliedFetchedAt, nextFetchedAt);
    render();
    return true;
  }

  async function readSavedPayload() {
    const response = await fetch("/assets/data/public-news.json", {
      cache: "no-cache",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Saved feed HTTP ${response.status}`);
    return response.json();
  }

  async function readFreshPayload() {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch("/api/public/news?limit=18", {
        cache: "no-cache",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Live feed HTTP ${response.status}`);
      return await response.json();
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function scheduleRefresh() {
    const refresh = () => {
      readFreshPayload().then(applyPayload).catch(() => {});
    };
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(refresh, { timeout: 1500 });
    } else {
      window.setTimeout(refresh, 250);
    }
  }

  more.addEventListener("click", () => {
    visibleCount += pageSize;
    render();
  });

  readSavedPayload()
    .then(payload => {
      if (!applyPayload(payload)) render();
      scheduleRefresh();
    })
    .catch(() => {
      readFreshPayload()
        .then(payload => {
          if (!applyPayload(payload)) render();
        })
        .catch(render);
    });
})();
