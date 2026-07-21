# Claude Orange Page and Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `/claude` to the same page structure and order modal UX as the already-approved `/chatgpt`, with Claude-specific orange visual styling.

**Architecture:** Reuse the ChatGPT constructor page pattern and generalize only the minimum modal/constructor JavaScript needed to support `data-service-page="claude"`. Keep ChatGPT behavior stable by preserving existing function names and adding service-specific config instead of rewriting the modal from scratch.

**Tech Stack:** Static HTML, `assets/css/home-stability-hotfix.css`, vanilla JS in `assets/js/app.js`, minified `assets/js/app.min.js`, Node marker tests.

---

### Task 1: Claude marker tests

**Files:**
- Create: `scripts/check-claude-page-modal.js`

- [ ] Add a Node marker test that fails until Claude has constructor layout, orange scoped CSS, and shared modal support.
- [ ] Run `node scripts/check-claude-page-modal.js` and confirm it fails on the current old Claude page.

### Task 2: Claude page structure

**Files:**
- Modify: `claude.html`

- [ ] Convert `<main>` to `class="page service-page service-page--constructor"` with `data-service-page="claude"` and `data-service-layout="constructor"`.
- [ ] Replace the old hero/stats with a ChatGPT-style hero adapted to Claude copy and orange visual treatment.
- [ ] Add the same constructor shell, selected-plan summary, filters, buy CTA, info blocks, and FAQ structure used on ChatGPT.
- [ ] Use `/assets/img/services/claude-card.png` for the product visual.
- [ ] Update CSS/JS cache-bust values.

### Task 3: Shared AI order modal support

**Files:**
- Modify: `assets/js/app.js`
- Modify after build: `assets/js/app.min.js`

- [ ] Add a small service config for `chatgpt` and `claude`.
- [ ] Allow constructor selection logic for Claude.
- [ ] Allow the existing ChatGPT modal renderer to receive a service key and output Claude labels/logo/copy when service is Claude.
- [ ] Preserve ChatGPT modal output for ChatGPT tariffs.

### Task 4: Claude orange styles

**Files:**
- Modify: `assets/css/home-stability-hotfix.css`

- [ ] Add CSS scoped to `[data-service-page="claude"]` for orange CTA/filter/payment states.
- [ ] Add CSS scoped to `.service-page[data-service-page="claude"] ~ .chatgpt-go-order-modal` for the modal theme.
- [ ] Keep ChatGPT green styling unchanged.

### Task 5: Verification

**Commands:**
- `node scripts/check-claude-page-modal.js`
- `node scripts/check-chatgpt-modal-visual.js`
- `node scripts/check-chatgpt-order-modal.js`
- `node --check assets/js/app.js`
- `node --check assets/js/app.min.js`

- [ ] Verify `/claude` in browser on desktop/mobile.
- [ ] Verify Claude buy opens the new themed modal.
- [ ] Verify old generic modal does not open for Claude.
- [ ] Verify ChatGPT modal still keeps the approved visual state.
