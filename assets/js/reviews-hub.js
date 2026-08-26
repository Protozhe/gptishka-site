(function () {
  "use strict";

  var PAGE_SIZE = 12;
  var state = {
    data: null,
    filter: "all",
    visible: PAGE_SIZE,
  };

  var elements = {
    total: document.getElementById("reviewsTotal"),
    rating: document.getElementById("reviewsRating"),
    updated: document.getElementById("reviewsUpdated"),
    sources: document.getElementById("reviewsSources"),
    filters: document.getElementById("reviewsFilters"),
    grid: document.getElementById("reviewsGrid"),
    empty: document.getElementById("reviewsEmpty"),
    more: document.getElementById("reviewsMore"),
  };

  function create(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (typeof text === "string") node.textContent = text;
    return node;
  }

  function setExternalLink(link, url) {
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("ru-RU").format(Number(value || 0));
  }

  function formatUpdated(value) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "недавно";
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function sourceStatus(source) {
    if (source.status === "ok") return "Источник доступен";
    if (source.status === "stale") return "Показана сохранённая копия";
    if (source.status === "feed-not-public") return "Ожидает публичную ленту";
    if (source.status === "awaiting-bot-messages") return "Бот подключён, ожидает новые отзывы";
    return "Источник временно недоступен";
  }

  function sourceMeta(source) {
    if (source.type === "telegram") {
      return source.visibleItems
        ? formatNumber(source.visibleItems) + " публичных публикаций"
        : "Канал подключён к системе";
    }
    var total = Number(source.total || 0);
    var rating = Number(source.rating || 0);
    return [
      total ? formatNumber(total) + " отзывов" : "",
      rating ? rating.toFixed(1) + " из 5" : "",
    ].filter(Boolean).join(" · ") || "Публичный профиль";
  }

  function renderStats(data) {
    elements.total.textContent = formatNumber(data.totalReviews);
    var rated = data.sources.filter(function (source) {
      return Number(source.rating) > 0 && Number(source.total || source.visibleItems) > 0;
    });
    var totalWeight = rated.reduce(function (sum, source) {
      return sum + Number(source.total || source.visibleItems || 0);
    }, 0);
    var weightedRating = rated.reduce(function (sum, source) {
      return sum + Number(source.rating) * Number(source.total || source.visibleItems || 0);
    }, 0);
    elements.rating.textContent = totalWeight ? (weightedRating / totalWeight).toFixed(1) : "—";
    elements.updated.textContent = formatUpdated(data.fetchedAt);
  }

  function renderSources(data) {
    elements.sources.replaceChildren();
    data.sources.filter(function (source) {
      return !source.hidden;
    }).forEach(function (source) {
      var card = create("a", "reviews-source reviews-source--" + source.type);
      if (source.status !== "ok") card.classList.add("is-waiting");
      setExternalLink(card, source.url);

      var icon = create("span", "reviews-source__icon");
      icon.setAttribute("aria-hidden", "true");
      var iconImage = create("img", "reviews-source__logo");
      iconImage.src = source.type === "telegram"
        ? "/assets/img/telegram.png"
        : "https://funpay.com/favicon.ico";
      iconImage.alt = "";
      iconImage.loading = "lazy";
      iconImage.decoding = "async";
      iconImage.referrerPolicy = "no-referrer";
      icon.append(iconImage);
      var copy = create("span", "reviews-source__copy");
      copy.append(
        create("strong", "reviews-source__name", source.label),
        create("span", "reviews-source__meta", sourceMeta(source)),
        create("span", "reviews-source__status", sourceStatus(source))
      );
      card.append(icon, copy);
      elements.sources.append(card);
    });
  }

  function renderFilters(data) {
    elements.filters.replaceChildren();
    var options = [{ id: "all", label: "Все отзывы" }].concat(
      data.sources
        .filter(function (source) {
          return !source.hidden && String(source.label || "").trim().toLowerCase() !== "reznikshop" && data.items.some(function (item) {
            return item.sourceId === source.id;
          });
        })
        .map(function (source) {
          return { id: source.id, label: source.label };
        })
    );

    options.forEach(function (option) {
      var button = create("button", "reviews-filter", option.label);
      button.type = "button";
      button.dataset.filter = option.id;
      button.setAttribute("aria-pressed", String(option.id === state.filter));
      if (option.id === state.filter) button.classList.add("is-active");
      button.addEventListener("click", function () {
        state.filter = option.id;
        state.visible = PAGE_SIZE;
        renderFilters(data);
        renderReviews(data);
      });
      elements.filters.append(button);
    });
  }

  function reviewNickname(item) {
    var explicitNickname = String(item.nickname || "").trim();
    if (explicitNickname) return explicitNickname;

    var author = String(item.author || "").trim();
    return author || "Покупатель";
  }

  function renderReview(item) {
    var card = create("article", "review-card");
    var top = create("div", "review-card__top");
    top.append(
      create("span", "review-card__source", item.sourceLabel || "Открытый источник"),
      create("span", "review-card__rating", "★".repeat(Math.max(1, Math.min(5, Number(item.rating) || 5))))
    );

    var text = create("p", "review-card__text", item.text);
    var footer = create("div", "review-card__footer");
    var meta = create("span", "review-card__meta");
    meta.append(create("strong", "review-card__nickname", reviewNickname(item)));
    if (item.detail) meta.append(create("span", "review-card__purchase", item.detail));
    meta.append(create("span", "review-card__date", item.dateLabel || formatUpdated(item.date)));
    footer.append(meta);
    if (item.url && !item.sourceHidden) {
      var link = create("a", "review-card__link", "Источник ↗");
      link.setAttribute("aria-label", "Открыть исходный отзыв");
      setExternalLink(link, item.url);
      footer.append(link);
    }
    card.append(top, text, footer);
    return card;
  }

  function filteredItems(data) {
    if (state.filter === "all") return data.items;
    return data.items.filter(function (item) {
      return item.sourceId === state.filter;
    });
  }

  function renderReviews(data) {
    var items = filteredItems(data);
    var visible = items.slice(0, state.visible);
    elements.grid.replaceChildren();
    visible.forEach(function (item) {
      elements.grid.append(renderReview(item));
    });
    elements.grid.setAttribute("aria-busy", "false");
    elements.empty.hidden = items.length > 0;
    elements.grid.hidden = items.length === 0;
    elements.more.hidden = visible.length >= items.length;
  }

  function showError() {
    elements.sources.replaceChildren();
    elements.filters.replaceChildren();
    elements.grid.replaceChildren();
    elements.grid.hidden = true;
    elements.grid.setAttribute("aria-busy", "false");
    elements.empty.hidden = false;
    elements.more.hidden = true;
    elements.total.textContent = "—";
    elements.rating.textContent = "—";
    elements.updated.textContent = "нет данных";
  }

  elements.more.addEventListener("click", function () {
    state.visible += PAGE_SIZE;
    renderReviews(state.data);
  });

  var eightHourBucket = Math.floor(Date.now() / (8 * 60 * 60 * 1000));
  fetch("/api/public/reviews?v=privacy5-" + eightHourBucket, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  })
    .then(function (response) {
      if (!response.ok) throw new Error("Reviews returned HTTP " + response.status);
      return response.json();
    })
    .then(function (data) {
      if (!data || !Array.isArray(data.sources) || !Array.isArray(data.items)) {
        throw new Error("Invalid reviews payload");
      }
      state.data = data;
      renderStats(data);
      renderSources(data);
      renderFilters(data);
      renderReviews(data);
    })
    .catch(function () {
      showError();
    });
})();
