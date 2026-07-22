const fs = require("fs");

const source = fs.readFileSync("assets/js/app.js", "utf8");
const css = fs.readFileSync("assets/css/home-stability-hotfix.css", "utf8");
const page = fs.readFileSync("chatgpt.html", "utf8");

const failures = [];

function requireSource(marker, label = marker) {
  if (!source.includes(marker)) failures.push(`app.js: ${label}`);
}

function rejectSource(marker, label = marker) {
  if (source.includes(marker)) failures.push(`app.js should not include: ${label}`);
}

function requireCss(marker, label = marker) {
  if (!css.includes(marker)) failures.push(`css: ${label}`);
}

function requireCssRegex(pattern, label) {
  if (!pattern.test(css)) failures.push(`css: ${label}`);
}

function requirePage(marker, label = marker) {
  if (!page.includes(marker)) failures.push(`chatgpt.html: ${label}`);
}

requireSource("chatgpt-payment-options", "payment options class");
requireSource("chatgpt-payment-option", "payment option class");
requireSource("chatgpt-payment-logo", "payment logo class");
requireSource("/assets/img/payment-lava.svg", "LAVA local logo");
requireSource("/assets/img/payment-enot.svg", "ENOT local logo");
requireSource("СБП 0% и карты 3.2%", "short LAVA fee caption");
requireSource("Карты 3.2% и СБП 0%", "ENOT fee caption");
requireSource("Сюда придут статус и вся информация по заказу", "Telegram order updates helper");
rejectSource("СБП 0% и банковские карты 3.2%", "old long LAVA caption");
rejectSource("Введите ник с @", "old Telegram nickname helper");
rejectSource("Дизайн сертификата", "gift certificate design section");
rejectSource("giftDesigns = [", "gift certificate design option data");
rejectSource("giftCertificateDesign: getChatGptGoCheckedValue", "gift design collection");
requireSource("chatgpt-payment-check", "payment selected indicator");
requireSource("role=\"radiogroup\"", "payment radiogroup role");
requireSource("role=\"radio\"", "payment radio role");
requireSource("serviceLogin: \"\"", "draft does not persist service login");
requireSource("servicePassword: \"\"", "draft does not persist service password");
rejectSource("value=\"' + escapeHtml(String(draft.serviceLogin || \"\")) + '\"", "service login rendered from draft");
rejectSource("value=\"' + escapeHtml(String(draft.servicePassword || \"\")) + '\"", "service password rendered from draft");

requireSource("function getChatGptGoPasswordIcon", "stable password SVG helper");
requireSource("data-chatgpt-go-password-icon", "password icon target");
requireSource("passwordIcon.innerHTML = getChatGptGoPasswordIcon", "password icon update");
requireSource("chatgpt-order-header", "order header semantic class");
requireSource("chatgpt-order-main", "order header main grid class");
requireSource("chatgpt-order-icon", "order header icon class");
requireSource("chatgpt-order-info", "order header text column class");
requireSource("chatgpt-order-meta", "order header meta class");
requireSource("chatgpt-order-chips", "order header chips class");
requireSource("chatgpt-order-total", "order header total class");
requireSource("<span>Итого</span><strong data-chatgpt-go-total", "total block keeps label and strong value");
rejectSource("chatgpt-order-summary-card__headline\"><h3", "title and price packed into old headline row");

requireCss("font-family: \"Manrope\", \"Inter\", system-ui", "high-quality modal font stack");
requireCss(".service-page[data-service-page=\"chatgpt\"] ~ .chatgpt-go-order-modal .chatgpt-order-summary-card", "scoped compact summary card");
requireCss("grid-template-columns: minmax(0, 1fr) auto;", "summary product/total layout");
requireCss(".service-page[data-service-page=\"chatgpt\"] ~ .chatgpt-go-order-modal .chatgpt-order-main", "scoped header main layout");
requireCss(".service-page[data-service-page=\"chatgpt\"] ~ .chatgpt-go-order-modal .chatgpt-order-info", "scoped header info column");
requireCss(".service-page[data-service-page=\"chatgpt\"] ~ .chatgpt-go-order-modal .chatgpt-order-total", "scoped header total block");
requireCss("align-self: center;", "header total vertical centering");
requireCss("gap: 28px;", "desktop icon/title spacing");
requireCssRegex(/\.service-page\[data-service-page="chatgpt"\]\s*~\s*\.chatgpt-go-order-modal\s+\.chatgpt-order-summary-card__price,\s*\.service-page\[data-service-page="chatgpt"\]\s*~\s*\.chatgpt-go-order-modal\s+\.chatgpt-order-total\s*\{[\s\S]*padding:\s*0;[\s\S]*border-radius:\s*0;[\s\S]*border:\s*0;[\s\S]*background:\s*transparent;/, "plain borderless total block");
requireCssRegex(/\.service-page\[data-service-page="chatgpt"\]\s*~\s*\.chatgpt-go-order-modal\s+\.chatgpt-order-summary-card__meta,\s*\.service-page\[data-service-page="chatgpt"\]\s*~\s*\.chatgpt-go-order-modal\s+\.chatgpt-order-meta\s*\{[\s\S]*margin:\s*4px 0 0;/, "header meta sits closer to title");
requireCss(".chatgpt-order-summary-card__headline::before", "header separator removal before");
requireCss(".chatgpt-order-summary-card__headline::after", "header separator removal after");
requireCss(".service-page[data-service-page=\"chatgpt\"] ~ .chatgpt-go-order-modal .chatgpt-order-payment", "scoped payment layout");
requireCss("grid-template-columns: repeat(2, minmax(0, 1fr));", "payment desktop two-column grid");
requireCss("grid-template-columns: 30px minmax(0, 1fr) 22px;", "payment card logo/text/check layout");
requireCss("--modal-bg: #0d131c;", "shared dark modal background token");
requireCss("--modal-surface: rgba(22, 29, 40, 0.96);", "shared dark modal surface token");
requireCss("--modal-text: #f5f7fb;", "shared dark modal text token");
requireCss("--modal-overlay: rgba(3, 8, 15, 0.8);", "shared dark modal overlay token");
requireCss("background: var(--modal-surface-secondary) !important;", "dark payment card surface override");
requireCss(".service-page[data-service-page=\"chatgpt\"] ~ .chatgpt-go-order-modal .chatgpt-payment-text", "payment text wrapper visibility");
requireCss("overflow-wrap: anywhere;", "payment captions wrap safely");
requireCss(".chatgpt-order-payment label.chatgpt-payment-option .chatgpt-payment-name", "payment name overrides old strong color");
requireCss(".chatgpt-order-payment label.chatgpt-payment-option .chatgpt-payment-caption", "payment caption overrides old small color");
requireCss(".service-page[data-service-page=\"chatgpt\"] ~ .chatgpt-go-order-modal .chatgpt-payment-logo img", "payment logo image sizing");
requireCss(".service-page[data-service-page=\"chatgpt\"] ~ .chatgpt-go-order-modal .chatgpt-payment-check::after", "payment checkmark");
requireCssRegex(/\.chatgpt-order-password-toggle:hover:not\(:disabled\)[\s\S]*transform:\s*translateY\(-50%\)/, "password toggle hover stays fixed");
requireCssRegex(/\.chatgpt-order-password-toggle:active:not\(:disabled\)[\s\S]*transform:\s*translateY\(-50%\)/, "password toggle active stays fixed");
requireCss(".service-page[data-service-page=\"chatgpt\"] ~ .chatgpt-go-order-modal .chatgpt-order-gift-details", "scoped gift accordion");
requireCss(".service-page[data-service-page=\"chatgpt\"] ~ .chatgpt-go-order-modal .chatgpt-go-order-modal__close", "scoped close button");
requireCss(".service-page[data-service-page=\"claude\"] ~ .chatgpt-go-order-modal", "Claude accent token scope");
requireCss("--product-accent: #f97316;", "Claude orange modal accent");
requireCss("background: rgba(13, 19, 28, 0.94) !important;", "dark sticky checkout footer");
requireCss('.chatgpt-order-title[tabindex="-1"]:focus', "focused modal title has no decorative outline");

requirePage("СБП 0% и карты 3.2%", "static payment modal LAVA caption");
requirePage("/assets/css/home-stability-hotfix.css?v=20260722-dark-checkout2", "CSS cache-bust");
requirePage("/assets/js/app.min.js?v=20260722-claude-max-plans1", "JS cache-bust");

if (failures.length) {
  console.error(`ChatGPT modal visual checks failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("ChatGPT modal visual markers found.");
