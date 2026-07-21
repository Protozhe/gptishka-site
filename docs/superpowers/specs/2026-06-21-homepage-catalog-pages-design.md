# Homepage Catalog Pages Design

## Goal

Add two lightweight catalog landing pages from the homepage shortcut cards:

- `/catalog/ai/` for all AI services in the current assortment.
- `/catalog/vpn/` for GPTishka V*N.

Also fix the mobile support mascot so the “Поддержка” label sits below the cat instead of covering it.

## Scope

In scope:

- Update homepage shortcut links.
- Add static catalog pages that route users to existing product pages.
- Add shared catalog-page CSS.
- Keep current product pages and checkout logic unchanged.
- Adjust only the homepage support widget visual override for mobile.

Out of scope:

- Payment logic.
- Product data logic.
- Admin panel.
- Dynamic backend catalog API.
- Rebuilding existing ChatGPT, Claude, SuperGrok, or V*N pages.

## Page structure

`/catalog/ai/` contains:

- Header/navigation consistent with the current site.
- Hero block: “Нейросети GPTishka”.
- Service cards:
  - ChatGPT → `/chatgpt`
  - Claude → `/claude`
  - SuperGrok → `/supergrok`
- Each card uses the existing service images and short sales copy.

`/catalog/vpn/` contains:

- Header/navigation consistent with the current site.
- Hero block: “GPTishka V*N”.
- One V*N card → `/store/vpn/`.
- Copy explains that VLESS access is issued after payment on the existing V*N product page.

## Homepage links

- `Нейросети` card href changes from `/#pricing` to `/catalog/ai/`.
- `V*N` card href changes from `/store/vpn/` to `/catalog/vpn/`.

## Support widget mobile fix

On homepage mobile only:

- Increase widget box height enough for the cat and label.
- Position `.support-widget__mascot::after` below the mascot image.
- Keep the widget click target and panel behavior unchanged.

## Verification

Run:

- `node --check server.js`
- `node --check assets/js/app.js`
- `node --check assets/js/home-promo-slider.js`
- `npm run test:home-wide`

Manual/browser checks:

- `/` shortcut cards link to the new catalog pages.
- `/catalog/ai/` shows ChatGPT, Claude, SuperGrok and links correctly.
- `/catalog/vpn/` shows GPTishka V*N and links correctly.
- Mobile homepage support label is below the cat.
- No checkout/payment behavior changed.
