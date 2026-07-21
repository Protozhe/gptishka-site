# Homepage Promo Slider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin-editable homepage promo/news slider that replaces the current hero trust badges and process panel.

**Architecture:** Add a dedicated homepage banner model and module instead of mixing editorial banners with product showcase sections. The storefront renders a resilient static fallback and upgrades it with active slides from public API.

**Tech Stack:** Node.js, Express, Prisma, React admin UI, static HTML/CSS/JS storefront.

---

### Task 1: Static homepage contract test

**Files:**
- Modify: `scripts/verify-homepage-wide-layout.mjs`

- [ ] **Step 1: Write the failing static check**

Update the script to assert:

```js
assert(html.includes('data-home-promo-slider'), "homepage must include promo slider root");
assert(!html.includes('class="home-hero-process"'), "old process panel must be removed from homepage");
assert(!html.includes('class="hero-trust-pills"'), "old trust pills must be removed from homepage");
assert(html.includes("/assets/js/home-promo-slider.js?v="), "homepage promo slider JS must be linked with cache bust");
assert(css.includes(".home-promo-slider"), "wide CSS must style the promo slider");
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm run test:home-wide
```

Expected: FAIL because `data-home-promo-slider` and JS/CSS are not implemented yet.

### Task 2: Backend homepage banners API

**Files:**
- Modify: `apps/admin-backend/prisma/schema.prisma`
- Create: `apps/admin-backend/src/modules/homepage/homepage-banners.service.ts`
- Create: `apps/admin-backend/src/modules/homepage/homepage-banners.routes.ts`
- Modify: `apps/admin-backend/src/app.ts`
- Modify: `apps/admin-backend/src/modules/files/files.service.ts`

- [ ] **Step 1: Add Prisma model**

Add `HomepageBannerSlide` with editable fields for badge, title, description, button, background, colors, active state and order.

- [ ] **Step 2: Add route/service CRUD**

Create admin routes for list/create/update/delete/reorder/upload image and public route for active slides.

- [ ] **Step 3: Build API**

Run:

```bash
npm run build:admin:api
```

Expected: PASS.

### Task 3: Admin UI editor

**Files:**
- Create: `apps/admin-ui/src/pages/HomepageBannersPage.tsx`
- Modify: `apps/admin-ui/src/main.tsx`
- Modify: `apps/admin-ui/src/layout/AdminLayout.tsx`

- [ ] **Step 1: Add route and nav item**

Add admin route `/homepage-banners` and menu item “Главная”.

- [ ] **Step 2: Add editor page**

Implement list/editor with create, update, delete, active toggle, sort order, image upload/delete and visual preview.

- [ ] **Step 3: Build UI**

Run:

```bash
npm run build:admin:ui
```

Expected: PASS.

### Task 4: Storefront slider

**Files:**
- Modify: `index.html`
- Modify: `assets/css/home-wide-marketplace.css`
- Create: `assets/js/home-promo-slider.js`

- [ ] **Step 1: Replace old homepage blocks**

Remove `hero-trust-pills` and `home-hero-process` from `index.html`. Add fallback slider markup with 3-5 slides and cache-busted JS.

- [ ] **Step 2: Add slider CSS**

Add premium dark/glass slider styles, image background support, overlay, dots, arrows, mobile layout and reduced motion handling.

- [ ] **Step 3: Add slider JS**

Fetch `/api/public/homepage/banners`, render active slides if present, otherwise keep fallback slides. Add autoplay, dots, previous/next and pause on hover/focus.

- [ ] **Step 4: Verify static homepage check GREEN**

Run:

```bash
npm run test:home-wide
```

Expected: PASS.

### Task 5: Local visual verification

**Files:**
- No planned code changes unless visual bugs are found.

- [ ] **Step 1: Start local storefront/admin as needed**

Run local server commands that match existing project scripts.

- [ ] **Step 2: Open homepage in the in-app browser**

Show the local homepage and inspect the promo slider visually.

- [ ] **Step 3: Verify key widths**

Check desktop and mobile widths for no horizontal scroll, readable text, clickable button and smooth animation.

- [ ] **Step 4: Report changed files and remaining decisions**

List changed files, checks run, and whether the banner is ready for deploy.
