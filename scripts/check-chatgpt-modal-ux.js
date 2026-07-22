const fs = require("fs");

const source = fs.readFileSync("assets/js/app.js", "utf8");
const css = fs.readFileSync("assets/css/home-stability-hotfix.css", "utf8");
const chatgptPage = fs.readFileSync("chatgpt.html", "utf8");

const failures = [];

function requireSource(marker, label = marker) {
  if (!source.includes(marker)) failures.push(`app.js: ${label}`);
}

function requireSourceRegex(pattern, label) {
  if (!pattern.test(source)) failures.push(`app.js: ${label}`);
}

function requireCss(marker, label = marker) {
  if (!css.includes(marker)) failures.push(`css: ${label}`);
}

function requirePage(marker, label = marker) {
  if (!chatgptPage.includes(marker)) failures.push(`chatgpt.html: ${label}`);
}

// Focus management: opener save/restore, initial focus, Tab trap and Escape close.
requireSource("let chatGptGoOrderLastFocusedElement = null;", "saved opener variable");
requireSource("function focusChatGptGoOrderModal()", "modal initial focus helper");
requireSource("function restoreChatGptGoOrderFocus()", "modal focus restore helper");
requireSource("function trapChatGptGoOrderFocus(event)", "modal Tab trap helper");
requireSourceRegex(/function openChatGptGoOrderModal\(item,\s*opener\)/, "open modal accepts opener");
requireSource("chatGptGoOrderLastFocusedElement = opener", "open modal stores opener");
requireSource("focusChatGptGoOrderModal();", "open modal focuses inside dialog");
requireSource("restoreChatGptGoOrderFocus();", "close modal restores opener focus");
requireSource('if (e.key === "Tab"', "global keydown routes Tab trap");
requireSource('modalTitle.setAttribute("tabindex", "-1")', "modal title focus target");

// Stale state: checkout item must be recomputed from active service chips when Buy is clicked.
requireSource("function resolveCurrentServiceCheckoutItem(card, fallbackItem)", "fresh checkout resolver");
requireSource("filterServicePageItems(allItems, serviceKey)[0]", "resolver uses active filter state");
requireSource("const checkoutItem = resolveCurrentServiceCheckoutItem(card, item);", "buy handler resolves fresh item");
requireSource("openChatGptGoOrderModal(checkoutItem, payNowBtn)", "buy handler passes fresh item and opener");

// Zero discount row should be hidden until there is a real positive discount.
requireSource("discountRow.hidden = discount <= 0;", "discount row hidden at zero");
requireSource('data-chatgpt-go-summary-discount\' + (discount > 0 ? "" : " hidden")', "initial discount row hidden at zero");

// Gift block: compact default plus optional details accordion.
requireSource("function compactChatGptGiftSection(form)", "gift compaction helper");
requireSource("chatgpt-order-gift-details", "gift details markup/class");
requireSource("Дополнительные настройки подарка", "gift optional details summary");
requireSource("compactChatGptGiftSection(form);", "gift compaction called after render");
requireSourceRegex(/setChatGptGoFieldError\(form,\s*"giftSendDate"/, "gift send date error marker still exists");
requireSourceRegex(/giftSendDate[\s\S]*giftSendTime[\s\S]*giftMessage/, "gift optional fields available without design selector");
requireCss(".service-page[data-service-page=\"chatgpt\"] ~ .chatgpt-go-order-modal .chatgpt-order-gift-details", "scoped gift details style");

// ARIA and required state.
requireSource("function getServiceFilterAriaLabel(kind, optionLabel, count, isActive)", "filter chip aria label helper");
requireSource('aria-label="\' + escapeHtml(getServiceFilterAriaLabel', "filter chips expose aria-label");
requireSource('<small aria-hidden="true">', "filter chip counters hidden from screen readers");
requireSource("serviceLogin.required = showCredentials;", "login required state follows visibility");
requireSource("servicePassword.required = showPassword;", "password required state follows visibility");

// Cache bust must move with JS/CSS changes on the ChatGPT page.
requirePage("/assets/js/app.min.js?v=20260722-delivery-id-only1", "JS cache-bust");
requirePage("/assets/css/home-stability-hotfix.css?v=20260618-chatgpt-static-card2", "CSS cache-bust");

if (failures.length) {
  console.error(`ChatGPT modal UX checks failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("ChatGPT modal UX checks passed.");
