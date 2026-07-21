# Homepage Catalog Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build separate homepage catalog landing pages for AI services and V*N, then fix the mobile support mascot label.

**Architecture:** Use static HTML pages for `/catalog/ai/` and `/catalog/vpn/` because the pages only route users to already-working product pages. Add a focused CSS file for catalog layout and keep checkout/product JavaScript untouched.

**Tech Stack:** Static HTML, existing CSS assets, existing support widget script, existing Node/Express static routing.

---

### Task 1: Create catalog page CSS

**Files:**
- Create: `assets/css/home-catalog-pages.css`

- [ ] **Step 1: Add page layout styles**

Create `assets/css/home-catalog-pages.css` with styles for:

```css
.catalog-page {
  width: min(1240px, calc(100vw - 40px));
  margin: clamp(28px, 4vw, 58px) auto clamp(64px, 8vw, 110px);
  color: #162033;
}

.catalog-hero {
  position: relative;
  overflow: hidden;
  border-radius: clamp(28px, 4vw, 46px);
  padding: clamp(34px, 5vw, 70px);
  border: 1px solid rgba(255, 255, 255, 0.66);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.74), rgba(230, 242, 255, 0.58));
  box-shadow: 0 26px 72px rgba(34, 61, 124, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.82);
}

.catalog-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(16px, 2vw, 26px);
  margin-top: clamp(20px, 3vw, 34px);
}
```

- [ ] **Step 2: Add responsive rules**

Add media queries:

```css
@media (max-width: 900px) {
  .catalog-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .catalog-page {
    width: min(calc(100vw - 20px), 100%);
    margin-top: 18px;
  }
}
```

### Task 2: Create `/catalog/ai/`

**Files:**
- Create: `catalog/ai/index.html`

- [ ] **Step 1: Add static AI catalog page**

Create a page with:

```html
<main class="catalog-page catalog-page--ai">
  <section class="catalog-hero">
    <a class="catalog-back" href="/">← Главная</a>
    <p class="catalog-eyebrow">Каталог</p>
    <h1>Нейросети GPTishka</h1>
    <p>Выберите сервис: ChatGPT, Claude или SuperGrok. Дальше откроется готовая страница с тарифами, оплатой и подключением.</p>
  </section>
  <section class="catalog-grid" aria-label="Нейросети">
    <a class="catalog-card catalog-card--chatgpt" href="/chatgpt">...</a>
    <a class="catalog-card catalog-card--claude" href="/claude">...</a>
    <a class="catalog-card catalog-card--grok" href="/supergrok">...</a>
  </section>
</main>
```

Use existing images:

- `/assets/img/services/chatgpt-card.png`
- `/assets/img/services/claude-card.png?v=20260618-claude-logo2`
- `/assets/img/services/grok-card.png?v=20260618-grok-logo4`

### Task 3: Create `/catalog/vpn/`

**Files:**
- Create: `catalog/vpn/index.html`

- [ ] **Step 1: Add static V*N catalog page**

Create a page with:

```html
<main class="catalog-page catalog-page--vpn">
  <section class="catalog-hero">
    <a class="catalog-back" href="/">← Главная</a>
    <p class="catalog-eyebrow">Каталог</p>
    <h1>GPTishka V*N</h1>
    <p>Выберите V*N и перейдите на готовую страницу покупки. После оплаты доступный VLESS-ключ выдаётся через текущую систему.</p>
  </section>
  <section class="catalog-grid catalog-grid--single" aria-label="V*N">
    <a class="catalog-card catalog-card--vpn" href="/store/vpn/">...</a>
  </section>
</main>
```

Use existing images:

- `/assets/img/services/vstar-card.png?v=20260622-vstar1

### Task 4: Update homepage shortcut links and support mascot CSS

**Files:**
- Modify: `index.html`
- Modify: `assets/css/home-wide-marketplace.css`

- [ ] **Step 1: Change shortcut links**

Change:

```html
href="/#pricing"
```

to:

```html
href="/catalog/ai/"
```

Change:

```html
href="/store/vpn/"
```

to:

```html
href="/catalog/vpn/"
```

Only update the homepage shortcut card, not the promo slider CTA.

- [ ] **Step 2: Fix mobile support label**

In the mobile homepage override, set:

```css
.home-wide-body #gptishka-support-widget.support-widget {
  width: 92px;
  height: 142px;
}

.home-wide-body #gptishka-support-widget .support-widget__mascot {
  width: 86px;
  height: 118px;
}

.home-wide-body #gptishka-support-widget .support-widget__mascot::after {
  bottom: -18px;
}
```

### Task 5: Verify

**Files:**
- Test: `scripts/verify-homepage-wide-layout.mjs`

- [ ] **Step 1: Run checks**

Run:

```powershell
npm run test:home-wide
node --check server.js
node --check assets/js/app.js
node --check assets/js/home-promo-slider.js
```

Expected:

- home-wide layout check passed
- all `node --check` commands exit `0`

- [ ] **Step 2: Browser smoke test**

Open:

- `http://localhost:4017/`
- `http://localhost:4017/catalog/ai/`
- `http://localhost:4017/catalog/vpn/`

Expected:

- Homepage shortcut cards navigate to catalog pages.
- AI catalog links to `/chatgpt`, `/claude`, `/supergrok`.
- V*N catalog links to `/store/vpn/`.
- Mobile support label sits below the cat.
