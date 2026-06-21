# Wide Homepage Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert only the GPTishka homepage (`/`) from a narrow centered landing layout into a wide marketplace-style homepage while preserving existing product, checkout, activation-feed, and payment behavior.

**Architecture:** Add a homepage-only layout layer instead of rewriting global styles. `index.html` receives explicit homepage wrapper/classes and small semantic sections; `assets/css/home-wide-marketplace.css` owns the wide-canvas layout and overrides older homepage constraints under `.home-wide-page`. A small Node static check guards scope and key anchors.

**Tech Stack:** Static HTML/CSS, existing vanilla JS storefront runtime, Node.js verification script, npm scripts.

---

## File map

- Modify `index.html`
  - Add `home-wide-page` class to `<main>`.
  - Add a new cache-busted CSS link for `/assets/css/home-wide-marketplace.css`.
  - Rework only homepage hero/trust/how/final-CTA markup.
  - Preserve `#pricing`, `#siteTicker`, product grid container, checkout modal markup, and script includes.

- Create `assets/css/home-wide-marketplace.css`
  - Homepage-only wide layout overrides.
  - Uses `.home-wide-page` scope for all major selectors.
  - Avoids touching service pages and checkout modal styles.

- Create `scripts/verify-homepage-wide-layout.mjs`
  - Static guard for expected homepage classes, CSS link, preserved anchors, and forbidden accidental changes.

- Modify `package.json`
  - Add `test:home-wide`.

---

## Task 1: Add static regression check

**Files:**
- Create: `scripts/verify-homepage-wide-layout.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create the failing static check**

Add `scripts/verify-homepage-wide-layout.mjs`:

```js
import fs from "node:fs";

const html = fs.readFileSync("index.html", "utf8");
const cssPath = "assets/css/home-wide-marketplace.css";
const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf8") : "";

function assert(condition, message) {
  if (!condition) {
    console.error(`homepage wide layout check failed: ${message}`);
    process.exitCode = 1;
  }
}

assert(html.includes('id="siteTicker"'), "activation ticker must remain in index.html");
assert(html.includes('id="pricing"'), "pricing anchor #pricing must remain");
assert(html.includes('id="pricingGrid"'), "pricing grid #pricingGrid must remain");
assert(html.includes('class="page home-wide-page"'), "main must opt into homepage wide layout");
assert(html.includes("/assets/css/home-wide-marketplace.css?v="), "homepage wide CSS must be linked with cache bust");
assert(html.includes('class="hero home-hero-wide"'), "hero must use wide homepage class");
assert(html.includes('class="home-hero-wide__panel"'), "hero must include right-side service panel");
assert(html.includes('class="home-final-cta"'), "homepage must include final CTA section");
assert(!html.includes("средства замораживаются"), "homepage copy must not use alarming frozen-funds wording");

assert(css.includes(".home-wide-page"), "wide CSS must be scoped to .home-wide-page");
assert(css.includes("--home-wide-max"), "wide CSS must define --home-wide-max");
assert(css.includes(".home-wide-page .pricing"), "wide CSS must style homepage pricing only");
assert(css.includes("@media (max-width: 760px)"), "wide CSS must include mobile rules");

if (process.exitCode) process.exit(process.exitCode);
console.log("homepage wide layout check passed");
```

- [ ] **Step 2: Add npm script**

In root `package.json`, add this script next to other test scripts:

```json
"test:home-wide": "node scripts/verify-homepage-wide-layout.mjs"
```

- [ ] **Step 3: Run check and confirm RED**

Run:

```powershell
npm run test:home-wide
```

Expected: fail because `home-wide-page`, `home-hero-wide`, and the new CSS file are not implemented yet.

- [ ] **Step 4: Commit test guard**

```powershell
git add package.json scripts/verify-homepage-wide-layout.mjs
git commit -m "test: add homepage wide layout guard"
```

---

## Task 2: Add homepage-only wide CSS layer

**Files:**
- Create: `assets/css/home-wide-marketplace.css`
- Modify: `index.html`

- [ ] **Step 1: Link the CSS after existing homepage CSS**

In `index.html`, after:

```html
<link rel="stylesheet" href="/assets/css/home-stability-hotfix.css?v=20260616-go-order18" />
```

add:

```html
<link rel="stylesheet" href="/assets/css/home-wide-marketplace.css?v=20260621-wide1" />
```

- [ ] **Step 2: Create base wide layout CSS**

Create `assets/css/home-wide-marketplace.css`:

```css
/* Homepage wide marketplace layer. Scope: index.html only via .home-wide-page. */

.home-wide-page {
  --home-wide-max: 1520px;
  --home-wide-gutter: clamp(16px, 4vw, 56px);
  --home-wide-shell: min(calc(100vw - (var(--home-wide-gutter) * 2)), var(--home-wide-max));
  --home-card-radius: 30px;
  --home-card-border: rgba(255, 255, 255, 0.64);
  --home-card-shadow: 0 22px 58px rgba(34, 61, 124, 0.12);
  width: 100%;
  overflow: clip;
}

.home-wide-page > .hero,
.home-wide-page > .trust-bar,
.home-wide-page > .pricing,
.home-wide-page > .how,
.home-wide-page > .faq,
.home-wide-page > .activation-video,
.home-wide-page > .home-final-cta {
  width: var(--home-wide-shell) !important;
  max-width: var(--home-wide-shell) !important;
  margin-left: auto !important;
  margin-right: auto !important;
}

.home-wide-page > .pricing,
.home-wide-page > .how,
.home-wide-page > .faq,
.home-wide-page > .activation-video {
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.home-wide-page > .pricing,
.home-wide-page > .how,
.home-wide-page > .faq,
.home-wide-page > .activation-video,
.home-wide-page > .home-final-cta {
  margin-bottom: clamp(54px, 7vw, 104px) !important;
}
```

- [ ] **Step 3: Run static check and confirm it still fails for missing classes**

Run:

```powershell
npm run test:home-wide
```

Expected: still fail because `main`, hero panel, and final CTA are not updated.

---

## Task 3: Convert homepage hero to wide-canvas structure

**Files:**
- Modify: `index.html`
- Modify: `assets/css/home-wide-marketplace.css`

- [ ] **Step 1: Add homepage class to main**

Change:

```html
<main class="page">
```

to:

```html
<main class="page home-wide-page">
```

- [ ] **Step 2: Replace hero markup only**

Replace the current `<div class="hero">...</div>` block with:

```html
<div class="hero home-hero-wide">
  <div class="home-hero-wide__content">
    <div class="home-hero-wide__copy">
      <div
        data-hero-react-root
        data-lang="ru"
        data-hero-top="Подписки на"
        data-hero-words="ChatGPT Plus|Claude PRO|SuperGrok|GPTishka VPN"
        data-hero-description="Оформляйте подписки на AI-сервисы и VPN в России: выбирайте тариф, оплачивайте удобным способом, а GPTishka помогает довести подключение до результата."
        data-hero-cta="Выбрать тариф"
        data-cta-href="/#pricing"
        data-hero-interval="3400"
      >
        <h1>Подписки на ChatGPT, Claude, SuperGrok и VPN в России</h1>
        <p>Выберите тариф, оплатите картой, СБП или криптовалютой, а GPTishka поможет с подключением и поддержкой на весь срок подписки.</p>
        <a href="/#pricing" class="btn">Выбрать тариф</a>
      </div>
      <div class="home-hero-wide__actions" aria-label="Основные действия">
        <a href="/#pricing" class="btn home-hero-wide__primary">Выбрать тариф</a>
        <a href="/#how" class="btn secondary home-hero-wide__secondary">Как это работает</a>
      </div>
      <ul class="hero-trust-pills" aria-label="Ключевые преимущества">
        <li>Варианты с входом и без входа</li>
        <li>Оплата картой, СБП и криптовалютой</li>
        <li>Автоматическая активация там, где доступна</li>
        <li>Поддержка до результата</li>
      </ul>
    </div>

    <aside class="home-hero-wide__panel" aria-label="Популярные сервисы GPTishka">
      <div class="home-hero-panel__header">
        <span>GPTishka marketplace</span>
        <strong>AI и VPN в одном месте</strong>
      </div>
      <div class="home-hero-panel__grid">
        <a href="/chatgpt" class="home-hero-service home-hero-service--chatgpt">
          <span>ChatGPT</span>
          <strong>Go / Plus / Pro</strong>
        </a>
        <a href="/claude" class="home-hero-service home-hero-service--claude">
          <span>Claude</span>
          <strong>PRO</strong>
        </a>
        <a href="/supergrok" class="home-hero-service home-hero-service--grok">
          <span>SuperGrok</span>
          <strong>1–2 месяца</strong>
        </a>
        <a href="/store/vpn/" class="home-hero-service home-hero-service--vpn">
          <span>GPTishka VPN</span>
          <strong>VLESS-ключ</strong>
        </a>
      </div>
      <div class="home-hero-panel__note">
        После оплаты откроется нужный сценарий: автоматическая активация, выдача VPN-ключа или помощь менеджера.
      </div>
    </aside>
  </div>
</div>
```

- [ ] **Step 3: Add hero CSS**

Append to `assets/css/home-wide-marketplace.css`:

```css
.home-wide-page .home-hero-wide {
  position: relative;
  isolation: isolate;
  padding: clamp(26px, 5vw, 70px) !important;
  border-radius: clamp(30px, 4vw, 52px) !important;
  border: 1px solid rgba(255, 255, 255, 0.68) !important;
  background:
    radial-gradient(circle at 82% 18%, rgba(79, 163, 255, 0.28), transparent 34%),
    radial-gradient(circle at 22% 20%, rgba(171, 139, 255, 0.22), transparent 32%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.76), rgba(232, 243, 255, 0.6)) !important;
  box-shadow: 0 30px 80px rgba(34, 61, 124, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.86) !important;
  overflow: hidden;
}

.home-wide-page .home-hero-wide__content {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.06fr) minmax(360px, 0.72fr);
  gap: clamp(28px, 5vw, 76px);
  align-items: center;
}

.home-wide-page .home-hero-wide__copy {
  min-width: 0;
}

.home-wide-page .home-hero-wide [data-hero-react-root],
.home-wide-page .home-hero-wide .hero-react {
  max-width: 900px !important;
  margin: 0 !important;
  text-align: left !important;
}

.home-wide-page .home-hero-wide [data-hero-react-root] > h1,
.home-wide-page .home-hero-wide [data-hero-react-root] > p {
  text-align: left !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
}

.home-wide-page .home-hero-wide .hero-react__headline,
.home-wide-page .home-hero-wide .hero-react__title,
.home-wide-page .home-hero-wide .hero-react__description {
  text-align: left !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
}

.home-wide-page .home-hero-wide .hero-react__title {
  font-size: clamp(50px, 7vw, 104px) !important;
  line-height: 0.93 !important;
  letter-spacing: -0.06em !important;
}

.home-wide-page .home-hero-wide .hero-react__description {
  max-width: 760px !important;
  color: rgba(24, 34, 54, 0.76) !important;
  font-size: clamp(17px, 1.55vw, 23px) !important;
}

.home-wide-page .home-hero-wide__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 24px;
}

.home-wide-page .home-hero-wide__primary,
.home-wide-page .home-hero-wide__secondary {
  min-height: 52px;
  padding: 0 26px;
  align-items: center;
  justify-content: center;
}

.home-wide-page .home-hero-wide .hero-trust-pills {
  justify-content: flex-start !important;
  max-width: 900px !important;
  margin: 22px 0 0 !important;
}

.home-wide-page .home-hero-wide__panel {
  display: grid;
  gap: 18px;
  padding: clamp(18px, 2.4vw, 28px);
  border-radius: 34px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  background: rgba(255, 255, 255, 0.62);
  box-shadow: var(--home-card-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
}

.home-hero-panel__header {
  display: grid;
  gap: 4px;
}

.home-hero-panel__header span {
  color: rgba(35, 49, 76, 0.58);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.home-hero-panel__header strong {
  color: #142036;
  font-size: clamp(22px, 2vw, 32px);
  line-height: 1.05;
}

.home-hero-panel__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.home-hero-service {
  display: grid;
  gap: 8px;
  min-height: 118px;
  padding: 16px;
  border-radius: 24px;
  text-decoration: none;
  color: #fff;
  background: linear-gradient(145deg, #17233d, #2a5bff);
  box-shadow: 0 16px 34px rgba(42, 91, 255, 0.16);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.home-hero-service:hover {
  transform: translateY(-3px);
  box-shadow: 0 22px 44px rgba(42, 91, 255, 0.22);
}

.home-hero-service span {
  font-size: 14px;
  font-weight: 900;
}

.home-hero-service strong {
  align-self: end;
  font-size: 18px;
  line-height: 1.1;
}

.home-hero-service--chatgpt { background: linear-gradient(145deg, #071b16, #12a976); }
.home-hero-service--claude { background: linear-gradient(145deg, #4a1906, #ff6a2b); }
.home-hero-service--grok { background: linear-gradient(145deg, #05060a, #2e3448); }
.home-hero-service--vpn { background: linear-gradient(145deg, #06152d, #1b63ff); }

.home-hero-panel__note {
  color: rgba(24, 34, 54, 0.72);
  font-size: 14px;
  line-height: 1.5;
}
```

- [ ] **Step 4: Run static check**

Run:

```powershell
npm run test:home-wide
```

Expected: still fail only if final CTA or pricing CSS is not complete yet.

---

## Task 4: Make homepage sections wide and less boxed

**Files:**
- Modify: `assets/css/home-wide-marketplace.css`
- Modify: `index.html`

- [ ] **Step 1: Calm trust-bar copy**

In the trust bar, replace the alarming copy:

```html
<p>Ваши средства замораживаются на весь период подписки.</p>
```

with:

```html
<p>Если возникнет проблема, поддержка поможет восстановить доступ или предложит решение по условиям гарантии.</p>
```

Also adjust "Логин и пароль не нужны" to avoid overpromising:

```html
<h3>Доступны варианты без входа</h3>
<p>Для части тарифов клиент активирует доступ самостоятельно, без передачи логина и пароля.</p>
```

- [ ] **Step 2: Add wide section/card CSS**

Append to `assets/css/home-wide-marketplace.css`:

```css
.home-wide-page .trust-bar {
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.home-wide-page .trust-bar__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: clamp(12px, 1.6vw, 20px);
}

.home-wide-page .trust-bar__item,
.home-wide-page .how-card,
.home-wide-page .faq-item,
.home-wide-page .faq-sticky {
  border-radius: var(--home-card-radius) !important;
  border: 1px solid var(--home-card-border) !important;
  background: rgba(255, 255, 255, 0.68) !important;
  box-shadow: 0 16px 38px rgba(34, 61, 124, 0.09), inset 0 1px 0 rgba(255, 255, 255, 0.78) !important;
}

.home-wide-page .pricing-header,
.home-wide-page .how-header,
.home-wide-page .faq-header,
.home-wide-page .activation-video__header {
  max-width: 900px;
  margin-left: 0 !important;
  margin-right: 0 !important;
  text-align: left !important;
}

.home-wide-page .pricing-header h2,
.home-wide-page .faq-header h2,
.home-wide-page .activation-video__title,
.home-wide-page .how-title {
  text-align: left !important;
  font-size: clamp(34px, 4vw, 64px) !important;
  line-height: 0.98 !important;
  letter-spacing: -0.045em !important;
}

.home-wide-page .how-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  gap: clamp(14px, 1.7vw, 22px) !important;
}

.home-wide-page .how-card {
  min-height: 240px;
  padding: clamp(20px, 2.2vw, 30px) !important;
}

.home-wide-page .faq-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 380px);
  gap: clamp(20px, 3vw, 42px);
  align-items: start;
}
```

- [ ] **Step 3: Change how section from 3 to 4 cards**

In `index.html`, keep the existing first two cards and replace the third card with two cards:

```html
<div class="how-card">
  <div class="how-number">3</div>
  <h3>Получите инструкцию или ключ</h3>
  <p>После оплаты откроется сценарий для выбранного товара: активация по токену, выдача VPN-ключа или инструкция по дальнейшим действиям.</p>
</div>

<div class="how-card">
  <div class="how-number">4</div>
  <h3>Поддержка поможет завершить</h3>
  <p>Если автоматическая активация недоступна или что-то пошло не так, менеджер видит заказ и помогает довести услугу до результата.</p>
</div>
```

- [ ] **Step 4: Run static check**

Run:

```powershell
npm run test:home-wide
```

Expected: still fail only if final CTA is not added yet.

---

## Task 5: Widen product grid and add final CTA

**Files:**
- Modify: `index.html`
- Modify: `assets/css/home-wide-marketplace.css`

- [ ] **Step 1: Add final CTA before `</main>`**

Insert after `</section>` for `activation-video` and before `</main>`:

```html
<section class="home-final-cta" aria-labelledby="homeFinalCtaTitle">
  <div class="home-final-cta__content">
    <p class="home-final-cta__eyebrow">GPTishka</p>
    <h2 id="homeFinalCtaTitle">Готовы подключить подписку?</h2>
    <p>Выберите ChatGPT, Claude, SuperGrok или GPTishka VPN. После оплаты сайт откроет нужный сценарий подключения, а поддержка поможет, если потребуется ручная обработка.</p>
    <div class="home-final-cta__actions">
      <a href="/#pricing" class="btn">Выбрать тариф</a>
      <a href="https://t.me/aimarket_gpt" class="btn secondary" target="_blank" rel="noopener noreferrer">Написать в поддержку</a>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Add pricing/final CTA CSS**

Append to `assets/css/home-wide-marketplace.css`:

```css
.home-wide-page #pricingGrid.pricing-grid.pricing-grid--categorized {
  gap: clamp(22px, 3vw, 38px) !important;
}

.home-wide-page .pricing-grid--category {
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)) !important;
  gap: clamp(16px, 1.8vw, 24px) !important;
}

.home-wide-page #pricingGrid .price-card,
.home-wide-page .product-showcase-card,
.home-wide-page #pricingGrid .ai-directory-card {
  border-radius: var(--home-card-radius) !important;
  box-shadow: 0 18px 42px rgba(34, 61, 124, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.74) !important;
}

.home-wide-page #pricingGrid .buy-btn {
  min-height: 48px;
  border-radius: 16px !important;
}

.home-final-cta {
  position: relative;
  isolation: isolate;
  padding: clamp(28px, 5vw, 68px);
  border-radius: clamp(30px, 4vw, 48px);
  border: 1px solid rgba(255, 255, 255, 0.68);
  background:
    radial-gradient(circle at 82% 20%, rgba(42, 91, 255, 0.24), transparent 36%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.76), rgba(236, 245, 255, 0.64));
  box-shadow: 0 28px 72px rgba(34, 61, 124, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.82);
}

.home-final-cta__content {
  max-width: 860px;
}

.home-final-cta__eyebrow {
  margin: 0 0 10px;
  color: rgba(42, 91, 255, 0.8);
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.home-final-cta h2 {
  margin: 0;
  color: #142036;
  font-size: clamp(38px, 5vw, 78px);
  line-height: 0.96;
  letter-spacing: -0.055em;
}

.home-final-cta p:not(.home-final-cta__eyebrow) {
  max-width: 760px;
  margin: 18px 0 0;
  color: rgba(24, 34, 54, 0.74);
  font-size: clamp(16px, 1.4vw, 20px);
  line-height: 1.55;
}

.home-final-cta__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 24px;
}
```

- [ ] **Step 3: Run static check and confirm GREEN**

Run:

```powershell
npm run test:home-wide
```

Expected: `homepage wide layout check passed`.

- [ ] **Step 4: Commit homepage structure**

```powershell
git add index.html assets/css/home-wide-marketplace.css package.json scripts/verify-homepage-wide-layout.mjs
git commit -m "feat: add wide homepage marketplace layout"
```

---

## Task 6: Mobile and reduced-motion polish

**Files:**
- Modify: `assets/css/home-wide-marketplace.css`

- [ ] **Step 1: Add responsive rules**

Append:

```css
@media (max-width: 1180px) {
  .home-wide-page .home-hero-wide__content {
    grid-template-columns: 1fr;
  }

  .home-wide-page .home-hero-wide__panel {
    max-width: 760px;
  }

  .home-wide-page .trust-bar__grid,
  .home-wide-page .how-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }
}

@media (max-width: 760px) {
  .home-wide-page {
    --home-wide-gutter: 12px;
  }

  .home-wide-page > .hero,
  .home-wide-page > .trust-bar,
  .home-wide-page > .pricing,
  .home-wide-page > .how,
  .home-wide-page > .faq,
  .home-wide-page > .activation-video,
  .home-wide-page > .home-final-cta {
    width: min(calc(100vw - 20px), 100%) !important;
    max-width: min(calc(100vw - 20px), 100%) !important;
  }

  .home-wide-page .home-hero-wide {
    padding: 22px 16px !important;
    border-radius: 30px !important;
  }

  .home-wide-page .home-hero-wide .hero-react__title {
    font-size: clamp(42px, 13vw, 64px) !important;
    letter-spacing: -0.045em !important;
  }

  .home-wide-page .home-hero-wide__actions,
  .home-final-cta__actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .home-wide-page .home-hero-wide__actions .btn,
  .home-final-cta__actions .btn {
    width: 100%;
    min-height: 50px;
  }

  .home-hero-panel__grid,
  .home-wide-page .trust-bar__grid,
  .home-wide-page .how-grid,
  .home-wide-page .faq-layout {
    grid-template-columns: 1fr !important;
  }

  .home-wide-page .home-hero-service {
    min-height: 94px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-wide-page *,
  .home-wide-page *::before,
  .home-wide-page *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

- [ ] **Step 2: Run static check**

```powershell
npm run test:home-wide
```

Expected: pass.

- [ ] **Step 3: Commit responsive polish**

```powershell
git add assets/css/home-wide-marketplace.css
git commit -m "fix: polish wide homepage responsiveness"
```

---

## Task 7: Verification

**Files:**
- No production file edits unless verification finds issues.

- [ ] **Step 1: Run checks**

Run:

```powershell
npm run test:home-wide
npm run build:admin:api
npm run build:admin:ui
```

Expected:

- homepage wide layout check passes;
- backend TypeScript build passes;
- admin UI build passes.

- [ ] **Step 2: Start local server**

Run:

```powershell
npm run start
```

If the port is already in use, identify the printed port or existing local URL instead of killing unrelated processes.

- [ ] **Step 3: Browser visual check**

Open local homepage and verify:

- desktop 1440px: page uses wide canvas, not a narrow center island;
- desktop: hero has left offer and right service panel;
- desktop: pricing/product area uses more width;
- mobile 375px: no horizontal scroll;
- tablet 768px: cards are readable;
- `#pricing` CTA scrolls to pricing;
- `#how` CTA scrolls to how section;
- product buttons still open expected service pages or tariff flow;
- activation feed still appears and behaves as before.

- [ ] **Step 4: Regression page check**

Open:

- `/`;
- `/chatgpt`;
- `/claude`;
- `/supergrok`;
- `/store/vpn/`.

Expected: product pages are not affected by homepage-only CSS.

- [ ] **Step 5: Final diff review**

Run:

```powershell
git diff --stat HEAD~3..HEAD
git status -sb
```

Expected:

- changed files are limited to homepage wide layout plan/implementation files;
- no checkout/payment/backend logic files changed during homepage implementation.

---

## Self-review checklist

- Spec coverage:
  - Wide homepage: Tasks 2-6.
  - No activation feed change: guarded by Task 1 and verification.
  - No checkout/payment change: file map excludes modal/backend files.
  - Realistic copy, no fake counters: Tasks 3-4.
  - Responsive checks: Tasks 6-7.

- Completion-marker scan:
  - No unresolved markers or vague implementation-only steps.

- Scope:
  - This is a single homepage visual phase.
  - Admin constructor and product-page work remain separate.
