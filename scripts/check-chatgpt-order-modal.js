const fs = require("fs");

const source = fs.readFileSync("assets/js/app.js", "utf8");
const minifiedSource = fs.readFileSync("assets/js/app.min.js", "utf8");
const css = fs.readFileSync("assets/css/home-stability-hotfix.css", "utf8");
const chatgptPage = fs.readFileSync("chatgpt.html", "utf8");
const serverSource = fs.readFileSync("server.js", "utf8");
const successPage = fs.readFileSync("success.html", "utf8");

const expectedAssetVersion = "20260722-dark-checkout1";
const expectedJsAssetVersion = "20260722-claude-max-plans1";

const requiredSourceMarkers = [
  "chatgpt-order-summary-card",
  "chatgpt-order-header",
  "chatgpt-order-main",
  "chatgpt-order-info",
  "chatgpt-order-meta",
  "chatgpt-order-chips",
  "chatgpt-order-total",
  "chatgpt-order-summary-card__meta",
  "summaryTitle",
  "summaryDescription",
  "chatgpt-order-soft-actions",
  "data-chatgpt-go-account-fields",
  "data-chatgpt-go-create-note",
  "stabilizeChatGptGoOrderLayout",
  "preserveChatGptGoOrderScrollPosition",
  "modalBody.scrollTop = Math.min(maxScrollTop",
  "modalBody.style.width = \"100%\"",
  "modalBody.style.minWidth = \"0\"",
  "modalBody.style.maxWidth = \"100%\"",
  "data-chatgpt-go-promo-panel",
  "Сроки выполнения заказа",
  "Нужна для связи по заказу",
  "Введите id telegram с @",
  "Continue with Apple",
  "Войти через Apple",
  "Почта или логин ",
  "Пароль от ",
  "summaryPlanLabel",
  "getPublicServiceItems",
  'servicePageState.delivery = "all"',
  'priceCard.classList.contains("service-checkout-card")',
  'const CHATGPT_ORDER_MODAL_PLAN_KEYS = new Set(["go", "plus", "pro-5x", "pro-20x"]);',
  "function isChatGptOrderModalPlanKey(planKey)",
  "CHATGPT_ORDER_MODAL_PLAN_KEYS.has",
];

const requiredCssMarkers = [
  ".chatgpt-go-order-modal .chatgpt-order-summary-card",
  ".chatgpt-order-main",
  ".chatgpt-order-info",
  ".chatgpt-order-total",
  ".chatgpt-order-summary-card__meta",
  ".chatgpt-go-order-modal .chatgpt-order-soft-actions",
  ".chatgpt-go-order-modal .chatgpt-order-footer",
  "display: flex",
  ".chatgpt-go-order-modal .chatgpt-order-summary-lines:has",
  ".chatgpt-go-order-modal .chatgpt-order-gift-panel",
  ".chatgpt-go-order-modal .chatgpt-order-referral-extra",
  "align-self: stretch",
  "height: min(92vh, 980px)",
  "flex: 1 1 auto",
  "position: static",
  "overflow-x: hidden",
  "overflow: clip",
  "font-family: var(--font-sans",
  "border-radius: 24px",
  "flex: 0 0 auto",
  "flex-wrap: wrap",
];

const forbiddenMarkers = [
  { file: "app.js", source, marker: "keepChatGptGoOrderPanelVisible" },
  { file: "app.js", source, marker: "scrollTop +=" },
  { file: "app.js", source, marker: "window.scrollTo" },
  { file: "app.min.js", source: minifiedSource, marker: "keepChatGptGoOrderPanelVisible" },
  { file: "app.min.js", source: minifiedSource, marker: "scrollTop+=" },
  { file: "app.min.js", source: minifiedSource, marker: "window.scrollTo" },
  { file: "app.js", source, marker: "Отправим чек после оплаты" },
  { file: "app.js", source, marker: "1 покупка" },
  { file: "app.js", source, marker: "По ссылке" },
  { file: "app.js", source, marker: "Введите telegram id @" },
  { file: "app.js", source, marker: "Введите Telegram в формате @username." },
  { file: "app.js", source, marker: "Введите ник с @" },
  { file: "app.js", source, marker: "СБП 0% и банковские карты 3.2%" },
  { file: "app.js", source, marker: "Дизайн сертификата" },
  { file: "app.js", source, marker: "giftDesigns = [" },
  { file: "app.js", source, marker: "giftCertificateDesign: getChatGptGoCheckedValue" },
  { file: "app.js", source, marker: "логин и пароль указывать не нужно" },
  { file: "app.js", source, marker: "поставьте в каждом поле символ “.”" },
  { file: "app.js", source, marker: "Инструкцию по использованию менеджер отправит после оплаты" },
  { file: "app.js", source, marker: "логин и пароль не обязательны" },
  { file: "app.js", source, marker: "Если поле нужно заполнить формально" },
  { file: "app.js", source, marker: "Инструкцию пришлёт менеджер после оплаты" },
  { file: "app.js", source, marker: "У вас есть аккаунт ChatGPT?" },
  { file: "app.js", source, marker: "<strong>Есть</strong>" },
  { file: "app.js", source, marker: "Покажем поля логина и пароля" },
  { file: "app.js", source, marker: "Вхожу через Apple ID" },
  { file: "app.js", source, marker: "Пароль не понадобится" },
  { file: "app.js", source, marker: "Нет, создайте новый" },
  { file: "app.js", source, marker: "Аккаунт создаст менеджер" },
  { file: "app.js", source, marker: "Необязательные детали" },
  { file: "app.js", source, marker: "Почта или логин сервиса" },
  { file: "app.js", source, marker: "Пароль от сервиса" },
  { file: "app.js", source, marker: "data-chatgpt-go-apple-note" },
  { file: "app.js", source, marker: "name=\"serviceInstruction\"" },
  { file: "app.js", source, marker: "Комментарий по Apple ID" },
  { file: "app.js", source, marker: "Напишите, если есть важные детали входа" },
  { file: "app.js", source, marker: "Например: вход через Apple ID, пароль не передаю" },
  { file: "app.js", source, marker: 'filter(Boolean).join(" · ")) + \'</p></div>\'' },
  { file: "app.min.js", source: minifiedSource, marker: "Отправим чек после оплаты" },
  { file: "app.min.js", source: minifiedSource, marker: "1 покупка" },
  { file: "app.min.js", source: minifiedSource, marker: "По ссылке" },
  { file: "app.min.js", source: minifiedSource, marker: "Введите telegram id @" },
  { file: "app.min.js", source: minifiedSource, marker: "Введите Telegram в формате @username." },
  { file: "app.min.js", source: minifiedSource, marker: "Введите ник с @" },
  { file: "app.min.js", source: minifiedSource, marker: "СБП 0% и банковские карты 3.2%" },
  { file: "app.min.js", source: minifiedSource, marker: "Дизайн сертификата" },
  { file: "app.min.js", source: minifiedSource, marker: "логин и пароль указывать не нужно" },
  { file: "app.min.js", source: minifiedSource, marker: "поставьте в каждом поле символ “.”" },
  { file: "app.min.js", source: minifiedSource, marker: "Инструкцию по использованию менеджер отправит после оплаты" },
  { file: "app.min.js", source: minifiedSource, marker: "логин и пароль не обязательны" },
  { file: "app.min.js", source: minifiedSource, marker: "Если поле нужно заполнить формально" },
  { file: "app.min.js", source: minifiedSource, marker: "Инструкцию пришлёт менеджер после оплаты" },
  { file: "app.min.js", source: minifiedSource, marker: "У вас есть аккаунт ChatGPT?" },
  { file: "app.min.js", source: minifiedSource, marker: "<strong>Есть</strong>" },
  { file: "app.min.js", source: minifiedSource, marker: "Покажем поля логина и пароля" },
  { file: "app.min.js", source: minifiedSource, marker: "Вхожу через Apple ID" },
  { file: "app.min.js", source: minifiedSource, marker: "Пароль не понадобится" },
  { file: "app.min.js", source: minifiedSource, marker: "Нет, создайте новый" },
  { file: "app.min.js", source: minifiedSource, marker: "Аккаунт создаст менеджер" },
  { file: "app.min.js", source: minifiedSource, marker: "Необязательные детали" },
  { file: "app.min.js", source: minifiedSource, marker: "Почта или логин сервиса" },
  { file: "app.min.js", source: minifiedSource, marker: "Пароль от сервиса" },
  { file: "app.min.js", source: minifiedSource, marker: "data-chatgpt-go-apple-note" },
  { file: "app.min.js", source: minifiedSource, marker: "name=serviceInstruction" },
  { file: "app.min.js", source: minifiedSource, marker: "Комментарий по Apple ID" },
  { file: "app.min.js", source: minifiedSource, marker: "Напишите, если есть важные детали входа" },
  { file: "app.min.js", source: minifiedSource, marker: "Например: вход через Apple ID, пароль не передаю" },
  { file: "chatgpt.html", source: chatgptPage, marker: "По ссылке" },
  { file: "chatgpt.html", source: chatgptPage, marker: "СБП 0% и банковские карты 3.2%" },
];

const missing = [
  ...requiredSourceMarkers.filter(marker => !source.includes(marker)).map(marker => `app.js: ${marker}`),
  ...requiredCssMarkers.filter(marker => !css.includes(marker)).map(marker => `css: ${marker}`),
  ...(!chatgptPage.includes(`/assets/css/home-stability-hotfix.css?v=${expectedAssetVersion}`) ? [`chatgpt.html: css ${expectedAssetVersion}`] : []),
  ...(!chatgptPage.includes(`/assets/js/app.min.js?v=${expectedJsAssetVersion}`) ? [`chatgpt.html: js ${expectedJsAssetVersion}`] : []),
  ...(!serverSource.includes("sendFreshHtml") ? ["server.js: sendFreshHtml"] : []),
  ...(!serverSource.includes("no-store, no-cache, must-revalidate, proxy-revalidate") ? ["server.js: no-cache html headers"] : []),
  ...(!minifiedSource.includes('classList.contains("service-checkout-card")') ? ["app.min.js: service-checkout-card click guard"] : []),
  ...(!successPage.includes("isAiServiceOrder") ? ["success.html: isAiServiceOrder"] : []),
];

const forbidden = forbiddenMarkers
  .filter(({ source: content, marker }) => content.includes(marker))
  .map(({ file, marker }) => `${file}: ${marker}`);

if (forbidden.length) {
  console.error(`Forbidden ChatGPT order modal markers found:\n- ${forbidden.join("\n- ")}`);
  process.exit(1);
}

if (missing.length) {
  console.error(`Missing ChatGPT order modal markers:\n- ${missing.join("\n- ")}`);
  process.exit(1);
}

console.log("ChatGPT order modal structure markers found.");

