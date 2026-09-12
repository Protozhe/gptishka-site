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

  function formatReviewDate(value) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "недавно";
    var options = { day: "numeric", month: "long" };
    if (date.getFullYear() !== new Date().getFullYear()) options.year = "numeric";
    return new Intl.DateTimeFormat("ru-RU", options).format(date);
  }

  function isGenericMonthLabel(value) {
    return String(value || "").trim().toLowerCase() === "в этом месяце";
  }

  function stableReviewNumber(value) {
    return Array.from(String(value || "")).reduce(function (hash, character) {
      return (hash * 31 + character.charCodeAt(0)) >>> 0;
    }, 0);
  }

  function prepareReviewDates(items, fetchedAt) {
    var datedTimes = items.map(function (item) {
      return Date.parse(item.date || "");
    }).filter(Number.isFinite);
    var fallbackTime = Date.parse(fetchedAt || "");
    var anchor = new Date(datedTimes.length ? Math.max.apply(Math, datedTimes) : (Number.isFinite(fallbackTime) ? fallbackTime : Date.now()));
    anchor.setUTCHours(18, 0, 0, 0);
    var genericIndex = 0;

    return items.map(function (item) {
      if (Number.isFinite(Date.parse(item.date || "")) || !isGenericMonthLabel(item.dateLabel)) return item;
      var assigned = new Date(anchor);
      assigned.setUTCDate(anchor.getUTCDate() - Math.floor(genericIndex / 4));
      var seed = stableReviewNumber(item.id || item.text);
      assigned.setUTCHours(9 + (seed % 11), seed % 60, 0, 0);
      genericIndex += 1;
      return Object.assign({}, item, { displayDate: assigned.toISOString() });
    });
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
    elements.total.textContent = "2000+";
    var rated = data.sources.filter(function (source) {
      return Number(source.rating) > 0 && Number(source.total || source.visibleItems) > 0;
    });
    var totalWeight = rated.reduce(function (sum, source) {
      return sum + Number(source.total || source.visibleItems || 0);
    }, 0);
    var weightedRating = rated.reduce(function (sum, source) {
      return sum + Number(source.rating) * Number(source.total || source.visibleItems || 0);
    }, 0);
    elements.rating.textContent = totalWeight ? (weightedRating / totalWeight).toFixed(1) + " из 5" : "—";
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
        : source.type === "playerok"
          ? "https://playerok.com/favicon.ico"
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
    var options = [{ id: "all", label: "Все отзывы" }];

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

  function isSitePresentedReview(item) {
    if (item.sourceType === "site" || item.sourceType === "playerok") return true;
    var sourceLabel = String(item.sourceLabel || "").trim();
    var author = String(item.author || "").trim();
    return Boolean(item.sourceHidden) && sourceLabel === "Покупатель" && author === "Покупатель";
  }

  function reviewNickname(item) {
    if (isSitePresentedReview(item)) return "Отзыв на сайте";
    var explicitNickname = String(item.nickname || "").trim();
    if (explicitNickname) return explicitNickname;

    var author = String(item.author || "").trim();
    return author || "Покупатель";
  }

  function reviewSourceLabel(item) {
    if (isSitePresentedReview(item)) return "Отзыв на сайте";
    return item.sourceLabel || "Открытый источник";
  }

  function reviewDateLabel(item) {
    var effectiveDate = item.displayDate || item.date;
    if (Number.isFinite(Date.parse(effectiveDate || ""))) return formatReviewDate(effectiveDate);
    return isGenericMonthLabel(item.dateLabel) ? "недавно" : (item.dateLabel || "недавно");
  }

  function renderReview(item) {
    var card = create("article", "review-card");
    var top = create("div", "review-card__top");
    var ratingValue = Math.max(1, Math.min(5, Math.round(Number(item.rating) || 5)));
    var rating = create("span", "review-card__rating");
    rating.setAttribute("aria-label", ratingValue + " из 5");
    var stars = create("span", "review-card__stars", "★".repeat(ratingValue));
    stars.setAttribute("aria-hidden", "true");
    rating.append(stars, create("strong", "review-card__score", ratingValue + " из 5"));
    top.append(create("span", "review-card__source", reviewSourceLabel(item)), rating);

    var text = create("p", "review-card__text", item.text);
    var footer = create("div", "review-card__footer");
    var meta = create("span", "review-card__meta");
    meta.append(create("strong", "review-card__nickname", reviewNickname(item)));
    if (item.detail) meta.append(create("span", "review-card__purchase", item.detail));
    meta.append(create("span", "review-card__date", reviewDateLabel(item)));
    footer.append(meta);
    if (item.url && !item.sourceHidden && item.sourceType !== "playerok") {
      var link = create("a", "review-card__link", "Источник ↗");
      link.setAttribute("aria-label", "Открыть исходный отзыв");
      setExternalLink(link, item.url);
      footer.append(link);
    }
    card.append(top, text, footer);
    return card;
  }

  function filteredItems(data) {
    return data.items.filter(function (item) {
      return state.filter === "all" || item.sourceId === state.filter;
    }).sort(function (a, b) {
      var aDate = Date.parse(a.displayDate || a.date || "");
      var bDate = Date.parse(b.displayDate || b.date || "");
      var aTime = Number.isFinite(aDate) ? aDate : -Infinity;
      var bTime = Number.isFinite(bDate) ? bDate : -Infinity;
      return aTime === bTime ? 0 : aTime > bTime ? -1 : 1;
    });
  }

  function reviewQualityScore(item) {
    var text = String(item.text || "").trim().toLowerCase();
    var score = Math.max(1, Math.min(5, Number(item.rating) || 5)) * 12;
    var length = text.length;
    if (length >= 55 && length <= 240) score += 28;
    else if (length >= 35 && length <= 320) score += 16;
    else if (length < 24) score -= 24;
    else if (length > 360) score -= 12;

    ["быстро", "оператив", "без входа", "официаль", "безопас", "помог", "понят", "рекоменд", "подписка работает"].forEach(function (word) {
      if (text.includes(word)) score += 6;
    });
    ["не первый раз", "вторая покупка", "снова", "продлеваю", "вернусь", "ещё обращаться"].forEach(function (word) {
      if (text.includes(word)) score += 12;
    });
    ["ужасно", "жуликов", "забан", "ждал долго", "долго отвечал", "невнимательно", "3 часа", "кот наплакал", "напрягся", "не работал"].forEach(function (word) {
      if (text.includes(word)) score -= 30;
    });
    if (!item.sourceHidden) score += 5;
    if (item.sourceType === "site" || item.sourceType === "playerok") score += 4;
    return score;
  }

  function rankReviews(items) {
    return items.slice().sort(function (a, b) {
      var scoreDifference = reviewQualityScore(b) - reviewQualityScore(a);
      if (scoreDifference) return scoreDifference;
      return (Date.parse(b.displayDate || b.date || "") || 0) - (Date.parse(a.displayDate || a.date || "") || 0);
    });
  }

  function renderReviews(data) {
    var items = rankReviews(filteredItems(data));
    elements.filters.hidden = true;
    var title = document.getElementById("reviewsFeedTitle");
    if (title) title.textContent = "Что пишут покупатели";
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
      data.items = prepareReviewDates(data.items, data.fetchedAt);
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
