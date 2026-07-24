(() => {
  const root = document.getElementById("newsHub");
  const grid = document.getElementById("newsGrid");
  const empty = document.getElementById("newsEmpty");
  const more = document.getElementById("newsMore");
  const updated = document.getElementById("newsUpdated");
  if (!root || !grid || !empty || !more || !updated) return;

  const language = document.body.dataset.newsLanguage === "en" ? "en" : "ru";
  const locale = language === "en" ? "en-US" : "ru-RU";
  const labels = language === "en"
    ? {
        source: "Telegram",
        read: "Read on Telegram",
        video: "Video",
        updated: "Last synced",
        stale: "Showing the latest saved posts",
      }
    : {
        source: "Telegram",
        read: "Читать в Telegram",
        video: "Видео",
        updated: "Обновлено",
        stale: "Показаны последние сохранённые публикации",
      };
  const pageSize = 6;
  let visibleCount = pageSize;
  let items = [];

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

  function renderCard(item, index) {
    const article = document.createElement("article");
    article.className = `news-card${index === 0 ? " news-card--featured" : ""}`;

    if (item.imageUrl) {
      const mediaLink = document.createElement("a");
      mediaLink.className = "news-card__media";
      mediaLink.href = item.url;
      mediaLink.target = "_blank";
      mediaLink.rel = "noopener";
      mediaLink.setAttribute("aria-label", labels.read);

      const image = document.createElement("img");
      image.src = item.imageUrl;
      image.alt = "";
      image.loading = index < 2 ? "eager" : "lazy";
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      mediaLink.appendChild(image);

      if (item.hasVideo) {
        const badge = textNode("span", "news-card__video", labels.video);
        badge.setAttribute("aria-hidden", "true");
        mediaLink.appendChild(badge);
      }
      article.appendChild(mediaLink);
    }

    const body = document.createElement("div");
    body.className = "news-card__body";

    const meta = document.createElement("div");
    meta.className = "news-card__meta";
    meta.appendChild(textNode("span", "news-card__source", labels.source));
    const details = [safeDate(item.date), item.views ? `◉ ${item.views}` : ""].filter(Boolean);
    meta.appendChild(textNode("span", "", details.join(" · ")));
    body.appendChild(meta);

    const copy = textNode("p", "news-card__text", item.text || "");
    body.appendChild(copy);

    const link = document.createElement("a");
    link.className = "news-card__link";
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.appendChild(document.createTextNode(labels.read));
    const arrow = document.createElement("span");
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↗";
    link.appendChild(arrow);
    body.appendChild(link);

    article.appendChild(body);
    return article;
  }

  function render() {
    grid.replaceChildren();
    const fragment = document.createDocumentFragment();
    items.slice(0, visibleCount).forEach((item, index) => {
      fragment.appendChild(renderCard(item, index));
    });
    grid.appendChild(fragment);
    grid.setAttribute("aria-busy", "false");
    empty.hidden = items.length > 0;
    more.hidden = visibleCount >= items.length;
  }

  async function readPayload() {
    try {
      const response = await fetch("/api/public/news?limit=24", {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (_) {
      const fallback = await fetch("/data/public-news.json", {
        headers: { Accept: "application/json" },
      });
      if (!fallback.ok) throw new Error(`Fallback HTTP ${fallback.status}`);
      return { ...(await fallback.json()), stale: true };
    }
  }

  more.addEventListener("click", () => {
    visibleCount += pageSize;
    render();
  });

  readPayload()
    .then(payload => {
      items = Array.isArray(payload.items) ? payload.items : [];
      const synced = safeDate(payload.fetchedAt);
      updated.textContent = payload.stale
        ? labels.stale
        : synced
          ? `${labels.updated}: ${synced}`
          : labels.stale;
      render();
    })
    .catch(() => {
      items = [];
      updated.textContent = labels.stale;
      render();
    });
})();
