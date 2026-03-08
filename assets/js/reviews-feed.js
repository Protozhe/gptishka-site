(() => {
  const feed = document.getElementById("telegramReviewsFeed");
  if (!feed) return;

  const path = String(window.location.pathname || "").toLowerCase();
  const isEn = String(document.documentElement.lang || "ru").toLowerCase().startsWith("en") || path.startsWith("/en/");
  const contactPath = isEn ? "/en/contact.html" : "/contact.html";

  const RU_REVIEWS = [
    {
      name: "Андрей К.",
      date: "2026-03-06",
      text: "Активация прошла быстро, поддержка ответила по шагам и помогла без передачи личных данных.",
    },
    {
      name: "Мария П.",
      date: "2026-03-04",
      text: "Продление сделали в тот же день. Удобно, что в публичной ленте не показываются реальные контакты клиентов.",
    },
    {
      name: "Даниил С.",
      date: "2026-03-02",
      text: "Оплатил, получил инструкцию и завершил активацию. Сервисный процесс понятный и аккуратный.",
    },
  ];

  const EN_REVIEWS = [
    {
      name: "Alex M.",
      date: "2026-03-06",
      text: "Activation was completed quickly, and support guided me step by step without sharing sensitive data.",
    },
    {
      name: "Olivia R.",
      date: "2026-03-04",
      text: "Renewal was handled the same day. Public reviews now keep customer contacts fully private.",
    },
    {
      name: "Daniel K.",
      date: "2026-03-02",
      text: "Paid, followed the instructions, and finished activation smoothly. The process feels clear and safe.",
    },
  ];

  const i18n = isEn
    ? {
        note:
          "Reviews are published in privacy mode. Personal contacts are hidden to protect customers from fraud.",
        actionLabel: "Contact support",
        actionAria: "Open support contacts",
        roleLabel: "Verified customer",
      }
    : {
        note:
          "Отзывы публикуются в режиме приватности. Личные контакты скрыты для защиты клиентов от мошенников.",
        actionLabel: "Написать в поддержку",
        actionAria: "Открыть контакты поддержки",
        roleLabel: "Проверенный клиент",
      };

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString(isEn ? "en-US" : "ru-RU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function initials(name) {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "OK";
    return parts
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join("");
  }

  function updateHeader() {
    const noteEl = document.querySelector(".telegram-reviews-note");
    if (noteEl) {
      noteEl.textContent = i18n.note;
    }

    const actionBtn = document.querySelector(".reviews-header .btn.secondary");
    if (actionBtn) {
      actionBtn.setAttribute("href", contactPath);
      actionBtn.removeAttribute("target");
      actionBtn.removeAttribute("rel");
      actionBtn.setAttribute("aria-label", i18n.actionAria);
      actionBtn.textContent = i18n.actionLabel;
    }
  }

  function clearLegacyTelegramCache() {
    try {
      localStorage.removeItem("gptishka_reviews_cache_v1");
      localStorage.removeItem("gptishka_reviews_cache_ts_v1");
    } catch (_) {
      // Ignore storage cleanup errors.
    }
  }

  function renderReviews() {
    const items = isEn ? EN_REVIEWS : RU_REVIEWS;
    feed.innerHTML = items
      .map(item => {
        const name = escapeHtml(item.name);
        const date = escapeHtml(formatDate(item.date));
        const text = escapeHtml(item.text);
        const badge = escapeHtml(i18n.roleLabel);
        const avatar = escapeHtml(initials(item.name));
        return [
          '<article class="review">',
          '  <div class="review-header">',
          `    <div class="avatar">${avatar}</div>`,
          "    <div>",
          `      <div class="review-name">${name}</div>`,
          `      <div class="review-date">${date} · ${badge}</div>`,
          "    </div>",
          "  </div>",
          `  <div class="review-text">${text}</div>`,
          "</article>",
        ].join("");
      })
      .join("");
  }

  clearLegacyTelegramCache();
  updateHeader();
  renderReviews();
})();
