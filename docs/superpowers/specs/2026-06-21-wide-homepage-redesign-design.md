# Wide homepage redesign for GPTishka

Date: 2026-06-21

## Goal

Redesign only the GPTishka homepage (`/`) so it feels like a wide, modern AI/SaaS subscription marketplace instead of a narrow centered landing page with separate glued blocks.

The visual reference is the wide-canvas marketplace feeling of `https://spoteeq.ru/`, but the result must remain GPTishka: soft blue/lilac AI/SaaS styling, rounded premium cards, clean typography, and the existing service identity.

## Non-goals

Do not change:

- checkout/payment logic;
- product data, pricing, variants, promo logic, or backend APIs;
- ChatGPT, Claude, SuperGrok, and VPN product pages;
- existing payment/order modal behavior;
- admin UI or product constructor;
- Telegram order linking;
- activation feed logic and loading behavior.

The activation feed is considered already correctly implemented. It must not be redesigned, rewritten, or changed functionally in this phase.

## Scope

The phase targets homepage visual structure and UX:

- homepage hero;
- homepage content width;
- homepage product/service grid;
- homepage trust/advantages presentation;
- homepage "how it works" block;
- homepage FAQ spacing and layout if needed;
- optional final CTA near the footer;
- mobile/tablet/desktop adaptive behavior.

Primary files expected to be involved during implementation:

- `index.html`;
- `assets/css/home-cro.css`;
- `assets/css/home-stability-hotfix.css`;
- possibly `assets/css/unified-premium.css` only if existing base constraints block the homepage-only CSS.

Prefer adding homepage-specific classes and overrides rather than editing global service-page styles.

## Layout direction

Use a wide-canvas layout:

- full viewport section backgrounds;
- inner content width: `min(100% - clamp(32px, 7vw, 112px), 1520px)`;
- text blocks remain limited for readability, usually `680px-900px`;
- product grids and category rows use the wide area;
- desktop should no longer feel like a small card floating in empty space;
- mobile remains single-column and comfortable.

The redesign should reduce the "stack of separate boxes" feeling:

- avoid large outer white cards around whole sections when possible;
- use spacing, background gradients, and section headers instead of heavy frames;
- keep cards for actual products/features, not for every page section;
- keep consistent radius, shadow, and padding across same-type cards.

## Hero design

Hero should become a full-width premium first screen:

- left side: strong offer, description, CTA buttons, trust pills;
- right side on desktop: visual marketplace/service panel or live-service card;
- on mobile: right-side visual stacks below or is hidden if it harms clarity;
- primary CTA: "Выбрать тариф";
- secondary CTA: "Как это работает";
- copy must stay calm and trustworthy, not aggressive.

Do not hardcode fake counters. Existing real numbers may be used only if already present in data/source copy and not misleading.

Recommended hero meaning:

- "Подписки на ChatGPT, Claude, SuperGrok и VPN в России";
- "Оплата картой, СБП или криптовалютой";
- "Варианты с входом и без входа, поддержка до результата".

Avoid claiming all products are "без логина и пароля", because some products intentionally have a "Со входом" option.

## Product/service grid

The homepage product area should feel closer to a marketplace:

- wider grid;
- 3-4 cards per row on desktop depending on viewport;
- 2 cards on tablet where comfortable;
- 1 card on mobile;
- product cards should have clearer hierarchy: logo/image, name, short description, available options, price, CTA;
- CTA buttons should be more visible and consistent;
- hover should be present on desktop, with reduced motion respected.

Existing product links and data attributes must remain compatible with current JS.

## Trust and advantages

Keep the content factual and aligned with the real service:

- "Доступны варианты без входа";
- "Оплата картой, СБП и криптовалютой";
- "Поддержка до результата";
- "Гарантия на срок подписки";
- "Автоматическая активация там, где она доступна".

Do not introduce fake reviews, fake counters, or unverifiable claims.

## How it works

The "Как это работает" section should become a wide, clear four-step block:

1. Choose a service and tariff.
2. Select a delivery/activation option where available.
3. Pay with the available payment method.
4. Receive activation instructions, automatic activation, VPN key, or manager support depending on the product.

The wording must match actual GPTishka flows and not promise a single flow for every product.

## FAQ and final CTA

FAQ can keep its current questions but should visually align with the new wide layout.

Add or improve a final CTA before the footer if it fits the current page:

- headline: "Готовы подключить подписку?";
- text: short and factual;
- CTA: "Выбрать тариф";
- secondary support link if already available.

## Responsiveness

Check at:

- 375px;
- 768px;
- 1024px;
- 1440px;
- wide desktop if available.

Mobile priorities:

- no horizontal scroll;
- buttons at least 48px high;
- readable card text;
- no tiny multi-column layouts;
- no heavy visual effects that slow the page.

## Safety boundaries

Implementation must preserve:

- existing `#pricing` anchor;
- existing product cards' buy/link behavior;
- existing activation feed behavior;
- existing analytics scripts;
- existing language links;
- current checkout/payment modal behavior.

If a visual change requires touching checkout, backend, product pages, or the activation feed, it is out of scope for this phase.

## Verification

Required verification after implementation:

- `git diff` review before commit;
- build commands available in `package.json` that are relevant to changed assets;
- local homepage visual check desktop and mobile;
- check `/`, `/chatgpt`, `/claude`, `/supergrok`, `/store/vpn/` still open;
- verify `#pricing` scroll/anchor still works;
- verify product CTA links still open expected product pages or tariff flow;
- verify activation feed still behaves as before.

## Rollback strategy

Keep changes scoped to homepage markup and homepage CSS so rollback is simple:

- revert the homepage redesign commit;
- no database migration;
- no backend rollback required;
- no payment/provider rollback required.
