# Admin Product Service Constructor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin-driven constructor that can edit existing service pages and create new public service pages with products, theme, hero, variants, and the existing checkout modal behavior.

**Architecture:** Add `ServicePage` and `ServicePageProductPlacement` as backend-owned configuration, expose admin/public APIs, and let the storefront render a generic service page from that configuration. Keep existing static pages and checkout/payment logic as backward-compatible fallbacks.

**Tech Stack:** Prisma + Express + Zod + TypeScript backend, React/Vite/Tailwind admin UI, vanilla JS storefront in `assets/js/app.js`, Express storefront server in `server.js`, Node test runner for backend utility tests.

---

## Scope and execution notes

- Do not delete existing product fields or data.
- Do not rewrite payment, promo, CDK, VPN, or activation engines.
- Do not generate physical HTML files from the admin panel.
- Keep existing URLs working: `/chatgpt`, `/claude`, `/supergrok`, `/store/vpn`.
- Keep commits small. Each task below ends with a commit.
- The repository is already dirty. Before each task, check `git status --short` and only stage files from that task.

## File structure

### Backend data and APIs

- Modify `apps/admin-backend/prisma/schema.prisma`
  - Add `ServicePage` and `ServicePageProductPlacement`.
  - Add `Product.servicePagePlacements`.
- Create `apps/admin-backend/prisma/migrations/20260619090000_add_service_pages/migration.sql`
  - SQL for the new tables and indexes.
- Create `apps/admin-backend/src/modules/products/public-product-presenter.ts`
  - Shared public product projection currently embedded in `public-products.routes.ts`.
- Modify `apps/admin-backend/src/modules/products/public-products.routes.ts`
  - Import shared presenter functions.
- Create `apps/admin-backend/src/modules/service-pages/service-pages.schemas.ts`
  - Zod schemas for admin create/update/placements.
- Create `apps/admin-backend/src/modules/service-pages/service-pages.service.ts`
  - CRUD, normalization, theme tokens, public payload builder.
- Create `apps/admin-backend/src/modules/service-pages/service-pages.controller.ts`
  - Thin Express handlers.
- Create `apps/admin-backend/src/modules/service-pages/service-pages.routes.ts`
  - Admin and public routers.
- Create `apps/admin-backend/src/modules/service-pages/service-pages.test.ts`
  - Node tests for slug/path normalization and theme fallback.
- Modify `apps/admin-backend/src/app.ts`
  - Register admin/public service page routers.
- Create `apps/admin-backend/scripts/backfill-service-pages.ts`
  - Idempotently create built-in service page records and placements.

### Admin UI

- Modify `apps/admin-ui/src/pages/ProductsPage.tsx`
  - Turn the form into the “one page constructor” flow.
  - Add service page query/mutations.
  - Add service page selector/editor block.
  - Hide old noisy fields from the main scenario.
Do not split `ProductsPage.tsx` during the first implementation pass. Keep changes in the existing file so the task remains focused. Extract components only after the feature is working and verified.

### Storefront

- Create `service.html`
  - Generic public service page shell.
- Modify `server.js`
  - Add `/api/public/service-pages` proxy.
  - Add dynamic service page route guarded by backend existence check.
- Modify `assets/js/app.js`
  - Fetch service page config.
  - Apply hero/theme/info/FAQ dynamically.
  - Generalize service labels for custom service keys.
  - Keep existing ChatGPT/Claude/Grok/VPN behavior.
- Build/update `assets/js/app.min.js`
  - Keep minified asset in sync with `app.js`.
- Modify `assets/css/home-stability-hotfix.css`
  - Add generic theme CSS variables for service pages.

### Verification scripts

- Create `scripts/check-dynamic-service-page.js`
  - Browser/DOM check for a generated service page.
- Reuse existing:
  - `scripts/check-chatgpt-order-modal.js`
  - `scripts/check-claude-page-modal.js`
  - `scripts/check-supergrok-page-modal.js`
  - `scripts/check-vpn-page-modal.js`

---

## Task 1: Prisma schema for service pages

**Files:**
- Modify: `apps/admin-backend/prisma/schema.prisma`
- Create: `apps/admin-backend/prisma/migrations/20260619090000_add_service_pages/migration.sql`

- [ ] **Step 1: Update Prisma schema**

In `apps/admin-backend/prisma/schema.prisma`, add this relation field inside `model Product` near `showcasePlacements`:

```prisma
  servicePagePlacements ServicePageProductPlacement[]
```

Add these models after `ProductShowcasePlacement`:

```prisma
model ServicePage {
  id                 String                        @id @default(cuid())
  slug               String                        @unique
  path               String                        @unique
  serviceKey         String                        @map("service_key")
  title              String
  titleEn            String                        @default("") @map("title_en")
  heroEyebrow        String                        @default("Тарифные планы") @map("hero_eyebrow")
  heroTitle          String                        @default("") @map("hero_title")
  heroDescription    String                        @default("") @map("hero_description")
  heroVideoUrl       String                        @default("") @map("hero_video_url")
  heroImageUrl       String                        @default("") @map("hero_image_url")
  heroLogoUrl        String                        @default("") @map("hero_logo_url")
  theme              String                        @default("custom")
  accentColor        String                        @default("#35f28f") @map("accent_color")
  accentGradient     String                        @default("") @map("accent_gradient")
  darkOverlay        String                        @default("") @map("dark_overlay")
  colorOverlay       String                        @default("") @map("color_overlay")
  constructorTitle   String                        @default("") @map("constructor_title")
  constructorDescription String                    @default("") @map("constructor_description")
  infoSections       Json?                         @map("info_sections")
  faqItems           Json?                         @map("faq_items")
  paymentCaptionLava String                        @default("СБП 0% и карты 3.2%") @map("payment_caption_lava")
  paymentCaptionEnot String                        @default("Карты 3.2% и СБП 0%") @map("payment_caption_enot")
  isActive           Boolean                       @default(true) @map("is_active")
  isIndexed          Boolean                       @default(true) @map("is_indexed")
  sortOrder          Int                           @default(100) @map("sort_order")
  placements         ServicePageProductPlacement[]
  createdAt          DateTime                      @default(now()) @map("created_at")
  updatedAt          DateTime                      @updatedAt @map("updated_at")

  @@index([isActive, sortOrder])
  @@index([serviceKey])
  @@map("service_pages")
}

model ServicePageProductPlacement {
  id            String      @id @default(cuid())
  servicePageId String      @map("service_page_id")
  servicePage   ServicePage @relation(fields: [servicePageId], references: [id], onDelete: Cascade)
  productId     String      @map("product_id")
  product       Product     @relation(fields: [productId], references: [id], onDelete: Cascade)
  sortOrder     Int         @default(100) @map("sort_order")
  isActive      Boolean     @default(true) @map("is_active")
  isPinned      Boolean     @default(false) @map("is_pinned")
  createdAt     DateTime    @default(now()) @map("created_at")
  updatedAt     DateTime    @updatedAt @map("updated_at")

  @@unique([servicePageId, productId])
  @@index([productId])
  @@index([servicePageId, isActive, sortOrder])
  @@index([isPinned])
  @@map("service_page_product_placements")
}
```

- [ ] **Step 2: Add SQL migration**

Create `apps/admin-backend/prisma/migrations/20260619090000_add_service_pages/migration.sql` with:

```sql
CREATE TABLE "service_pages" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "service_key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "title_en" TEXT NOT NULL DEFAULT '',
  "hero_eyebrow" TEXT NOT NULL DEFAULT 'Тарифные планы',
  "hero_title" TEXT NOT NULL DEFAULT '',
  "hero_description" TEXT NOT NULL DEFAULT '',
  "hero_video_url" TEXT NOT NULL DEFAULT '',
  "hero_image_url" TEXT NOT NULL DEFAULT '',
  "hero_logo_url" TEXT NOT NULL DEFAULT '',
  "theme" TEXT NOT NULL DEFAULT 'custom',
  "accent_color" TEXT NOT NULL DEFAULT '#35f28f',
  "accent_gradient" TEXT NOT NULL DEFAULT '',
  "dark_overlay" TEXT NOT NULL DEFAULT '',
  "color_overlay" TEXT NOT NULL DEFAULT '',
  "constructor_title" TEXT NOT NULL DEFAULT '',
  "constructor_description" TEXT NOT NULL DEFAULT '',
  "info_sections" JSONB,
  "faq_items" JSONB,
  "payment_caption_lava" TEXT NOT NULL DEFAULT 'СБП 0% и карты 3.2%',
  "payment_caption_enot" TEXT NOT NULL DEFAULT 'Карты 3.2% и СБП 0%',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_indexed" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 100,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_pages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_page_product_placements" (
  "id" TEXT NOT NULL,
  "service_page_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 100,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_pinned" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_page_product_placements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_pages_slug_key" ON "service_pages"("slug");
CREATE UNIQUE INDEX "service_pages_path_key" ON "service_pages"("path");
CREATE INDEX "service_pages_is_active_sort_order_idx" ON "service_pages"("is_active", "sort_order");
CREATE INDEX "service_pages_service_key_idx" ON "service_pages"("service_key");
CREATE UNIQUE INDEX "service_page_product_placements_service_page_id_product_id_key" ON "service_page_product_placements"("service_page_id", "product_id");
CREATE INDEX "service_page_product_placements_product_id_idx" ON "service_page_product_placements"("product_id");
CREATE INDEX "service_page_product_placements_service_page_id_is_active_sort_order_idx" ON "service_page_product_placements"("service_page_id", "is_active", "sort_order");
CREATE INDEX "service_page_product_placements_is_pinned_idx" ON "service_page_product_placements"("is_pinned");

ALTER TABLE "service_page_product_placements"
  ADD CONSTRAINT "service_page_product_placements_service_page_id_fkey"
  FOREIGN KEY ("service_page_id") REFERENCES "service_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_page_product_placements"
  ADD CONSTRAINT "service_page_product_placements_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Validate Prisma schema**

Run:

```powershell
npm --workspace @gptishka/admin-backend exec prisma validate
```

Expected: Prisma reports the schema is valid.

- [ ] **Step 4: Generate Prisma client**

Run:

```powershell
npm --workspace @gptishka/admin-backend run prisma:generate
```

Expected: Prisma Client generation succeeds.

- [ ] **Step 5: Commit**

```powershell
git add apps/admin-backend/prisma/schema.prisma apps/admin-backend/prisma/migrations/20260619090000_add_service_pages/migration.sql
git commit -m "feat: add service page schema"
```

---

## Task 2: Shared public product presenter

**Files:**
- Create: `apps/admin-backend/src/modules/products/public-product-presenter.ts`
- Modify: `apps/admin-backend/src/modules/products/public-products.routes.ts`
- Test: `apps/admin-backend/src/modules/products/public-product-presenter.test.ts`

- [ ] **Step 1: Write presenter test**

Create `apps/admin-backend/src/modules/products/public-product-presenter.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicProducts } from "./public-product-presenter";

test("buildPublicProducts expands enabled activation variants into separate public products", () => {
  const items = buildPublicProducts(
    {
      id: "product-1",
      slug: "chatgpt-go",
      title: "ChatGPT Go",
      titleEn: "",
      description: "Описание",
      descriptionEn: "",
      modalDescription: "",
      modalDescriptionEn: "",
      price: 1290,
      oldPrice: null,
      activationVariants: {
        withLogin: {
          enabled: true,
          price: 1290,
          deliveryType: "manual_login",
          activationSiteUrl: "",
        },
        withoutLogin: {
          enabled: true,
          price: 990,
          deliveryType: "activation",
          activationSiteUrl: "https://9977ai.vip/go.php",
        },
      },
      currency: "RUB",
      category: "ChatGPT",
      tags: ["delivery:manual_login"],
      stock: null,
      visualConfig: null,
      showcasePlacements: [],
    },
    "ru"
  );

  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((item) => [item.slug, item.activationVariant, item.price, item.deliveryType]),
    [
      ["chatgpt-go-login", "withLogin", 1290, "manual_login"],
      ["chatgpt-go-link", "withoutLogin", 990, "activation"],
    ]
  );
});
```

- [ ] **Step 2: Run test to verify it fails before extraction**

Run:

```powershell
node --test apps/admin-backend/src/modules/products/public-product-presenter.test.ts
```

Expected: FAIL because `public-product-presenter.ts` does not exist.

- [ ] **Step 3: Create presenter file**

Create `apps/admin-backend/src/modules/products/public-product-presenter.ts` by moving the pure helper logic from `public-products.routes.ts` into exported functions. The exported surface must be:

```ts
export type PublicProductLang = "ru" | "en";

export function buildPublicProduct(
  item: any,
  lang: PublicProductLang,
  variant?: { key: "withLogin" | "withoutLogin"; price: number; deliveryType: any }
) {
  // Copy the current buildPublicProduct implementation from public-products.routes.ts here.
}

export function buildPublicProducts(item: any, lang: PublicProductLang) {
  // Copy the current buildPublicProducts implementation from public-products.routes.ts here.
}

export function fallbackSectionsFromProducts(products: any[], lang: PublicProductLang) {
  // Copy the current fallbackSectionsFromProducts implementation from public-products.routes.ts here.
}
```

The file must also include these helper functions moved unchanged from `public-products.routes.ts`:

- `resolveBadge`
- `localizedCategory`
- `localizedTitle`
- `localizedDescription`
- `localizedModalDescription`
- `buildVisualPayload`
- `buildShowcasePayload`

Use these imports at the top of the new file:

```ts
import { Currency } from "@prisma/client";
import { deliveryTypeToMethod, resolveProductDeliveryType } from "../../common/utils/product-delivery";
import { toRub } from "../../common/utils/fx";
import { normalizeProductActivationVariants } from "../../common/utils/product-activation-variants";
```

- [ ] **Step 4: Update public products route**

In `apps/admin-backend/src/modules/products/public-products.routes.ts`:

1. Remove the moved helper functions.
2. Add:

```ts
import { buildPublicProducts, fallbackSectionsFromProducts } from "./public-product-presenter";
```

3. Keep the route handlers unchanged except that they call the imported helpers.

- [ ] **Step 5: Run presenter test**

Run:

```powershell
node --test apps/admin-backend/src/modules/products/public-product-presenter.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run backend build**

Run:

```powershell
npm run build:admin:api
```

Expected: TypeScript build succeeds.

- [ ] **Step 7: Commit**

```powershell
git add apps/admin-backend/src/modules/products/public-product-presenter.ts apps/admin-backend/src/modules/products/public-product-presenter.test.ts apps/admin-backend/src/modules/products/public-products.routes.ts
git commit -m "refactor: share public product presenter"
```

---

## Task 3: Service page backend module

**Files:**
- Create: `apps/admin-backend/src/modules/service-pages/service-pages.schemas.ts`
- Create: `apps/admin-backend/src/modules/service-pages/service-pages.service.ts`
- Create: `apps/admin-backend/src/modules/service-pages/service-pages.controller.ts`
- Create: `apps/admin-backend/src/modules/service-pages/service-pages.routes.ts`
- Create: `apps/admin-backend/src/modules/service-pages/service-pages.test.ts`
- Modify: `apps/admin-backend/src/app.ts`

- [ ] **Step 1: Write service page unit tests**

Create `apps/admin-backend/src/modules/service-pages/service-pages.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeServicePageInput,
  normalizeServicePagePath,
  normalizeServicePageSlug,
  resolveServicePageTheme,
} from "./service-pages.service";

test("normalizeServicePageSlug creates clean lowercase slugs", () => {
  assert.equal(normalizeServicePageSlug(" ChatGPT Plus "), "chatgpt-plus");
  assert.equal(normalizeServicePageSlug("Claude Pro"), "claude-pro");
  assert.equal(normalizeServicePageSlug(""), "");
});

test("normalizeServicePagePath keeps root slash and strips trailing slash", () => {
  assert.equal(normalizeServicePagePath("chatgpt"), "/chatgpt");
  assert.equal(normalizeServicePagePath("/store/vpn/"), "/store/vpn");
  assert.equal(normalizeServicePagePath("/"), "");
  assert.equal(normalizeServicePagePath("/api/test"), "");
  assert.equal(normalizeServicePagePath("/admin"), "");
});

test("resolveServicePageTheme returns known theme tokens", () => {
  assert.equal(resolveServicePageTheme("emerald").accentColor, "#35f28f");
  assert.equal(resolveServicePageTheme("orange").accentColor, "#ff8a3d");
  assert.equal(resolveServicePageTheme("black").accentColor, "#f5f7fb");
  assert.equal(resolveServicePageTheme("dark-blue").accentColor, "#4aa8ff");
});

test("normalizeServicePageInput derives slug path and service key", () => {
  const input = normalizeServicePageInput({
    title: "Midjourney",
    slug: "",
    path: "",
    serviceKey: "",
    theme: "custom",
    accentColor: "#abcdef",
  });

  assert.equal(input.slug, "midjourney");
  assert.equal(input.path, "/midjourney");
  assert.equal(input.serviceKey, "midjourney");
  assert.equal(input.accentColor, "#abcdef");
});
```

- [ ] **Step 2: Run tests to verify they fail before module exists**

Run:

```powershell
node --test apps/admin-backend/src/modules/service-pages/service-pages.test.ts
```

Expected: FAIL because service page module does not exist.

- [ ] **Step 3: Create schemas**

Create `apps/admin-backend/src/modules/service-pages/service-pages.schemas.ts`:

```ts
import { z } from "zod";

const nullableText = (max = 2048) =>
  z
    .union([z.string().max(max), z.null()])
    .optional()
    .transform((value) => String(value || "").trim());

const jsonArray = z.union([z.array(z.any()), z.null()]).optional().transform((value) => Array.isArray(value) ? value : []);

export const servicePageSchema = z.object({
  slug: nullableText(80),
  path: nullableText(160),
  serviceKey: nullableText(80),
  title: z.string().min(2).max(120),
  titleEn: nullableText(120),
  heroEyebrow: nullableText(80),
  heroTitle: nullableText(120),
  heroDescription: nullableText(700),
  heroVideoUrl: nullableText(2048),
  heroImageUrl: nullableText(2048),
  heroLogoUrl: nullableText(2048),
  theme: nullableText(40),
  accentColor: nullableText(40),
  accentGradient: nullableText(500),
  darkOverlay: nullableText(500),
  colorOverlay: nullableText(500),
  constructorTitle: nullableText(120),
  constructorDescription: nullableText(700),
  infoSections: jsonArray,
  faqItems: jsonArray,
  paymentCaptionLava: nullableText(120),
  paymentCaptionEnot: nullableText(120),
  isActive: z.boolean().default(true),
  isIndexed: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(100),
});

export const servicePageUpdateSchema = servicePageSchema.partial();

export const servicePagePlacementSchema = z.object({
  productId: z.string().min(10),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(100),
  isActive: z.boolean().default(true),
  isPinned: z.boolean().default(false),
});

export const servicePagePlacementUpdateSchema = z.object({
  sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
  isPinned: z.boolean().optional(),
});

export const servicePageStatusSchema = z.object({
  isActive: z.boolean(),
});
```

- [ ] **Step 4: Create service**

Create `apps/admin-backend/src/modules/service-pages/service-pages.service.ts` with:

```ts
import slugify from "../../common/utils/slugify";
import { AppError } from "../../common/errors/app-error";
import { prisma } from "../../config/prisma";
import { writeAuditLog } from "../audit/audit.service";
import { buildPublicProducts } from "../products/public-product-presenter";

type Actor = { userId?: string; ip?: string; userAgent?: string };
type ServicePageInput = Record<string, any>;

const RESERVED_PATHS = new Set([
  "admin",
  "api",
  "assets",
  "uploads",
  "data",
  "store/vpn/activate",
  "payment",
  "success",
  "fail",
  "cart",
  "redeem-start",
]);

const THEME_TOKENS: Record<string, { theme: string; accentColor: string; accentGradient: string; darkOverlay: string; colorOverlay: string }> = {
  emerald: {
    theme: "emerald",
    accentColor: "#35f28f",
    accentGradient: "linear-gradient(135deg,#35f28f,#18c878,#0f8f5c)",
    darkOverlay: "linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.58))",
    colorOverlay: "linear-gradient(135deg,rgba(0,255,120,.34),rgba(0,130,80,.22),rgba(0,0,0,.22))",
  },
  orange: {
    theme: "orange",
    accentColor: "#ff8a3d",
    accentGradient: "linear-gradient(135deg,#ffb36a,#ff7a2f,#d94a17)",
    darkOverlay: "linear-gradient(180deg,rgba(0,0,0,.16),rgba(0,0,0,.56))",
    colorOverlay: "linear-gradient(135deg,rgba(255,138,61,.34),rgba(255,91,34,.24),rgba(0,0,0,.22))",
  },
  black: {
    theme: "black",
    accentColor: "#f5f7fb",
    accentGradient: "linear-gradient(135deg,#f5f7fb,#8b95a7,#111827)",
    darkOverlay: "linear-gradient(180deg,rgba(0,0,0,.24),rgba(0,0,0,.68))",
    colorOverlay: "linear-gradient(135deg,rgba(255,255,255,.16),rgba(80,90,110,.18),rgba(0,0,0,.34))",
  },
  "dark-blue": {
    theme: "dark-blue",
    accentColor: "#4aa8ff",
    accentGradient: "linear-gradient(135deg,#66c7ff,#2479ff,#102a7a)",
    darkOverlay: "linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.62))",
    colorOverlay: "linear-gradient(135deg,rgba(74,168,255,.30),rgba(28,70,180,.24),rgba(0,0,0,.28))",
  },
  custom: {
    theme: "custom",
    accentColor: "#35f28f",
    accentGradient: "linear-gradient(135deg,#35f28f,#18c878,#0f8f5c)",
    darkOverlay: "linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.58))",
    colorOverlay: "linear-gradient(135deg,rgba(0,255,120,.28),rgba(0,130,80,.18),rgba(0,0,0,.20))",
  },
};

export function normalizeServicePageSlug(value: string) {
  return slugify(String(value || "").trim());
}

export function normalizeServicePagePath(value: string) {
  const raw = String(value || "").trim().replace(/^https?:\/\/[^/]+/i, "");
  const noQuery = raw.split("?")[0].split("#")[0].trim();
  const withSlash = noQuery.startsWith("/") ? noQuery : `/${noQuery}`;
  const cleaned = withSlash.replace(/\/{2,}/g, "/").replace(/\/+$/g, "");
  const key = cleaned.replace(/^\/+/, "").toLowerCase();
  if (!key || RESERVED_PATHS.has(key) || key.startsWith("api/") || key.startsWith("admin/") || key.includes(".")) return "";
  return cleaned;
}

export function resolveServicePageTheme(theme: string) {
  const key = String(theme || "custom").trim().toLowerCase();
  return THEME_TOKENS[key] || THEME_TOKENS.custom;
}

export function normalizeServicePageInput(input: ServicePageInput) {
  const title = String(input.title || "").trim();
  const slug = normalizeServicePageSlug(input.slug || title);
  const path = normalizeServicePagePath(input.path || slug);
  const serviceKey = normalizeServicePageSlug(input.serviceKey || slug);
  const theme = resolveServicePageTheme(input.theme || "custom");

  if (!title) throw new AppError("Service page title is required", 422);
  if (!slug) throw new AppError("Service page slug is required", 422);
  if (!path) throw new AppError("Service page path is invalid", 422);
  if (!serviceKey) throw new AppError("Service page key is required", 422);

  return {
    slug,
    path,
    serviceKey,
    title,
    titleEn: String(input.titleEn || "").trim(),
    heroEyebrow: String(input.heroEyebrow || "Тарифные планы").trim(),
    heroTitle: String(input.heroTitle || title).trim(),
    heroDescription: String(input.heroDescription || "").trim(),
    heroVideoUrl: String(input.heroVideoUrl || "").trim(),
    heroImageUrl: String(input.heroImageUrl || "").trim(),
    heroLogoUrl: String(input.heroLogoUrl || "").trim(),
    theme: String(input.theme || theme.theme).trim() || theme.theme,
    accentColor: String(input.accentColor || theme.accentColor).trim(),
    accentGradient: String(input.accentGradient || theme.accentGradient).trim(),
    darkOverlay: String(input.darkOverlay || theme.darkOverlay).trim(),
    colorOverlay: String(input.colorOverlay || theme.colorOverlay).trim(),
    constructorTitle: String(input.constructorTitle || title).trim(),
    constructorDescription: String(input.constructorDescription || "").trim(),
    infoSections: Array.isArray(input.infoSections) ? input.infoSections : [],
    faqItems: Array.isArray(input.faqItems) ? input.faqItems : [],
    paymentCaptionLava: String(input.paymentCaptionLava || "СБП 0% и карты 3.2%").trim(),
    paymentCaptionEnot: String(input.paymentCaptionEnot || "Карты 3.2% и СБП 0%").trim(),
    isActive: input.isActive !== false,
    isIndexed: input.isIndexed !== false,
    sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 100,
  };
}

const pageInclude = {
  placements: {
    orderBy: [{ isPinned: "desc" as const }, { sortOrder: "asc" as const }, { createdAt: "asc" as const }],
    include: {
      product: {
        include: {
          visualConfig: true,
          showcasePlacements: {
            where: { isActive: true },
            include: { section: true },
          },
        },
      },
    },
  },
};

function publicPagePayload(page: any, lang: "ru" | "en") {
  const products = (Array.isArray(page.placements) ? page.placements : [])
    .filter((placement: any) => placement.isActive !== false && placement.product?.isActive !== false && placement.product?.isArchived !== true)
    .flatMap((placement: any) => buildPublicProducts(placement.product, lang));

  return {
    page: {
      id: page.id,
      slug: page.slug,
      path: page.path,
      serviceKey: page.serviceKey,
      title: lang === "en" ? page.titleEn || page.title : page.title,
      heroEyebrow: page.heroEyebrow,
      heroTitle: page.heroTitle || page.title,
      heroDescription: page.heroDescription,
      heroVideoUrl: page.heroVideoUrl,
      heroImageUrl: page.heroImageUrl,
      heroLogoUrl: page.heroLogoUrl,
      constructorTitle: page.constructorTitle || page.title,
      constructorDescription: page.constructorDescription,
      infoSections: Array.isArray(page.infoSections) ? page.infoSections : [],
      faqItems: Array.isArray(page.faqItems) ? page.faqItems : [],
      paymentCaptionLava: page.paymentCaptionLava,
      paymentCaptionEnot: page.paymentCaptionEnot,
      isIndexed: page.isIndexed !== false,
    },
    theme: {
      theme: page.theme,
      accentColor: page.accentColor,
      accentGradient: page.accentGradient,
      darkOverlay: page.darkOverlay,
      colorOverlay: page.colorOverlay,
    },
    products,
    meta: {
      title: `${page.title} — тарифные планы | GPTishka`,
      description: page.heroDescription || page.constructorDescription || "",
      canonical: page.path,
    },
  };
}

export const servicePagesService = {
  async list() {
    return prisma.servicePage.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: pageInclude,
    });
  },

  async getById(id: string) {
    const page = await prisma.servicePage.findUnique({ where: { id }, include: pageInclude });
    if (!page) throw new AppError("Service page not found", 404);
    return page;
  },

  async getPublicBySlug(slugOrPath: string, lang: "ru" | "en") {
    const raw = String(slugOrPath || "").trim();
    const path = normalizeServicePagePath(raw);
    const slug = normalizeServicePageSlug(raw.replace(/^\/+/, ""));
    const page = await prisma.servicePage.findFirst({
      where: {
        isActive: true,
        OR: [{ slug }, ...(path ? [{ path }] : [])],
      },
      include: pageInclude,
    });
    if (!page) throw new AppError("Service page not found", 404);
    return publicPagePayload(page, lang);
  },

  async create(input: ServicePageInput, actor?: Actor) {
    const data = normalizeServicePageInput(input);
    const created = await prisma.servicePage.create({ data, include: pageInclude });
    await writeAuditLog({ userId: actor?.userId, entityType: "service_page", entityId: created.id, action: "create", after: created, ip: actor?.ip, userAgent: actor?.userAgent });
    return created;
  },

  async update(id: string, input: ServicePageInput, actor?: Actor) {
    const before = await prisma.servicePage.findUnique({ where: { id } });
    if (!before) throw new AppError("Service page not found", 404);
    const data = normalizeServicePageInput({ ...before, ...input });
    const updated = await prisma.servicePage.update({ where: { id }, data, include: pageInclude });
    await writeAuditLog({ userId: actor?.userId, entityType: "service_page", entityId: id, action: "update", before, after: updated, ip: actor?.ip, userAgent: actor?.userAgent });
    return updated;
  },

  async patchStatus(id: string, isActive: boolean, actor?: Actor) {
    const before = await prisma.servicePage.findUnique({ where: { id } });
    if (!before) throw new AppError("Service page not found", 404);
    const updated = await prisma.servicePage.update({ where: { id }, data: { isActive }, include: pageInclude });
    await writeAuditLog({ userId: actor?.userId, entityType: "service_page", entityId: id, action: "patch_status", before, after: updated, ip: actor?.ip, userAgent: actor?.userAgent });
    return updated;
  },

  async remove(id: string, actor?: Actor) {
    const before = await prisma.servicePage.findUnique({ where: { id }, include: pageInclude });
    if (!before) throw new AppError("Service page not found", 404);
    await prisma.servicePage.delete({ where: { id } });
    await writeAuditLog({ userId: actor?.userId, entityType: "service_page", entityId: id, action: "delete", before, ip: actor?.ip, userAgent: actor?.userAgent });
  },

  async addPlacement(servicePageId: string, input: any, actor?: Actor) {
    const page = await prisma.servicePage.findUnique({ where: { id: servicePageId } });
    if (!page) throw new AppError("Service page not found", 404);
    const product = await prisma.product.findUnique({ where: { id: String(input.productId || "") } });
    if (!product) throw new AppError("Product not found", 404);
    const placement = await prisma.servicePageProductPlacement.upsert({
      where: { servicePageId_productId: { servicePageId, productId: product.id } },
      create: {
        servicePageId,
        productId: product.id,
        sortOrder: Number(input.sortOrder || 100),
        isActive: input.isActive !== false,
        isPinned: input.isPinned === true,
      },
      update: {
        sortOrder: Number(input.sortOrder || 100),
        isActive: input.isActive !== false,
        isPinned: input.isPinned === true,
      },
      include: { product: { include: { visualConfig: true } }, servicePage: true },
    });
    await writeAuditLog({ userId: actor?.userId, entityType: "service_page_product_placement", entityId: placement.id, action: "upsert", after: placement, ip: actor?.ip, userAgent: actor?.userAgent });
    return placement;
  },

  async updatePlacement(id: string, input: any, actor?: Actor) {
    const before = await prisma.servicePageProductPlacement.findUnique({ where: { id } });
    if (!before) throw new AppError("Service page placement not found", 404);
    const updated = await prisma.servicePageProductPlacement.update({
      where: { id },
      data: {
        ...(input.sortOrder !== undefined ? { sortOrder: Number(input.sortOrder) } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.isPinned !== undefined ? { isPinned: input.isPinned } : {}),
      },
      include: { product: { include: { visualConfig: true } }, servicePage: true },
    });
    await writeAuditLog({ userId: actor?.userId, entityType: "service_page_product_placement", entityId: id, action: "update", before, after: updated, ip: actor?.ip, userAgent: actor?.userAgent });
    return updated;
  },

  async removePlacement(id: string, actor?: Actor) {
    const before = await prisma.servicePageProductPlacement.findUnique({ where: { id } });
    if (!before) throw new AppError("Service page placement not found", 404);
    await prisma.servicePageProductPlacement.delete({ where: { id } });
    await writeAuditLog({ userId: actor?.userId, entityType: "service_page_product_placement", entityId: id, action: "delete", before, ip: actor?.ip, userAgent: actor?.userAgent });
  },
};
```

- [ ] **Step 5: Create controller**

Create `apps/admin-backend/src/modules/service-pages/service-pages.controller.ts`:

```ts
import { Request, Response } from "express";
import { asyncHandler } from "../../common/http/async-handler";
import { servicePagesService } from "./service-pages.service";

function actor(req: Request) {
  return {
    userId: req.auth?.userId,
    ip: req.requestMeta?.ip,
    userAgent: req.requestMeta?.userAgent,
  };
}

export const listServicePages = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ items: await servicePagesService.list() });
});

export const getServicePage = asyncHandler(async (req: Request, res: Response) => {
  res.json(await servicePagesService.getById(String(req.params.id || "")));
});

export const createServicePage = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await servicePagesService.create(req.body, actor(req)));
});

export const updateServicePage = asyncHandler(async (req: Request, res: Response) => {
  res.json(await servicePagesService.update(String(req.params.id || ""), req.body, actor(req)));
});

export const patchServicePageStatus = asyncHandler(async (req: Request, res: Response) => {
  res.json(await servicePagesService.patchStatus(String(req.params.id || ""), Boolean(req.body.isActive), actor(req)));
});

export const deleteServicePage = asyncHandler(async (req: Request, res: Response) => {
  await servicePagesService.remove(String(req.params.id || ""), actor(req));
  res.status(204).send();
});

export const addServicePagePlacement = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await servicePagesService.addPlacement(String(req.params.id || ""), req.body, actor(req)));
});

export const updateServicePagePlacement = asyncHandler(async (req: Request, res: Response) => {
  res.json(await servicePagesService.updatePlacement(String(req.params.id || ""), req.body, actor(req)));
});

export const deleteServicePagePlacement = asyncHandler(async (req: Request, res: Response) => {
  await servicePagesService.removePlacement(String(req.params.id || ""), actor(req));
  res.status(204).send();
});

export const getPublicServicePage = asyncHandler(async (req: Request, res: Response) => {
  const lang = String(req.query.lang || "ru").toLowerCase().startsWith("en") ? "en" : "ru";
  res.json(await servicePagesService.getPublicBySlug(String(req.params.slug || ""), lang));
});
```

- [ ] **Step 6: Create routes**

Create `apps/admin-backend/src/modules/service-pages/service-pages.routes.ts`:

```ts
import { Router } from "express";
import { validateBody } from "../../common/middleware/validation";
import { allowRoles, requireAuth } from "../auth/auth.middleware";
import {
  addServicePagePlacement,
  createServicePage,
  deleteServicePage,
  deleteServicePagePlacement,
  getPublicServicePage,
  getServicePage,
  listServicePages,
  patchServicePageStatus,
  updateServicePage,
  updateServicePagePlacement,
} from "./service-pages.controller";
import {
  servicePagePlacementSchema,
  servicePagePlacementUpdateSchema,
  servicePageSchema,
  servicePageStatusSchema,
  servicePageUpdateSchema,
} from "./service-pages.schemas";

export const servicePagesAdminRouter = Router();

servicePagesAdminRouter.use(requireAuth);
servicePagesAdminRouter.get("/", allowRoles(["OWNER", "ADMIN", "MANAGER"]), listServicePages);
servicePagesAdminRouter.get("/:id", allowRoles(["OWNER", "ADMIN", "MANAGER"]), getServicePage);
servicePagesAdminRouter.post("/", allowRoles(["OWNER", "ADMIN"]), validateBody(servicePageSchema), createServicePage);
servicePagesAdminRouter.put("/:id", allowRoles(["OWNER", "ADMIN", "MANAGER"]), validateBody(servicePageUpdateSchema), updateServicePage);
servicePagesAdminRouter.patch("/:id/status", allowRoles(["OWNER", "ADMIN"]), validateBody(servicePageStatusSchema), patchServicePageStatus);
servicePagesAdminRouter.delete("/:id", allowRoles(["OWNER", "ADMIN"]), deleteServicePage);
servicePagesAdminRouter.post("/:id/products", allowRoles(["OWNER", "ADMIN", "MANAGER"]), validateBody(servicePagePlacementSchema), addServicePagePlacement);
servicePagesAdminRouter.put("/placements/:id", allowRoles(["OWNER", "ADMIN", "MANAGER"]), validateBody(servicePagePlacementUpdateSchema), updateServicePagePlacement);
servicePagesAdminRouter.delete("/placements/:id", allowRoles(["OWNER", "ADMIN", "MANAGER"]), deleteServicePagePlacement);

export const servicePagesPublicRouter = Router();
servicePagesPublicRouter.get("/service-pages/:slug", getPublicServicePage);
```

- [ ] **Step 7: Register routes**

In `apps/admin-backend/src/app.ts`, add import:

```ts
import { servicePagesAdminRouter, servicePagesPublicRouter } from "./modules/service-pages/service-pages.routes";
```

Register before existing public products router:

```ts
  app.use("/api/admin/service-pages", servicePagesAdminRouter);
  app.use("/api/public", servicePagesPublicRouter);
```

- [ ] **Step 8: Run service page tests**

Run:

```powershell
node --test apps/admin-backend/src/modules/service-pages/service-pages.test.ts
```

Expected: PASS.

- [ ] **Step 9: Run backend build**

Run:

```powershell
npm run build:admin:api
```

Expected: PASS.

- [ ] **Step 10: Commit**

```powershell
git add apps/admin-backend/src/modules/service-pages apps/admin-backend/src/app.ts
git commit -m "feat: add service page api"
```

---

## Task 4: Backfill built-in service pages

**Files:**
- Create: `apps/admin-backend/scripts/backfill-service-pages.ts`
- Modify: `apps/admin-backend/package.json`

- [ ] **Step 1: Create backfill script**

Create `apps/admin-backend/scripts/backfill-service-pages.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type BuiltInPage = {
  slug: string;
  path: string;
  serviceKey: string;
  title: string;
  theme: string;
  accentColor: string;
  accentGradient: string;
  heroDescription: string;
  match: (product: { title: string; category: string; tags: string[]; deliveryType?: string | null }) => boolean;
};

const pages: BuiltInPage[] = [
  {
    slug: "chatgpt",
    path: "/chatgpt",
    serviceKey: "chatgpt",
    title: "ChatGPT",
    theme: "emerald",
    accentColor: "#35f28f",
    accentGradient: "linear-gradient(135deg,#35f28f,#18c878,#0f8f5c)",
    heroDescription: "Оформите подписку ChatGPT без лишних сложностей. Выберите тариф, оплатите заказ, а GPTishka возьмёт подключение на себя — с поддержкой и гарантией на весь срок подписки.",
    match: (product) => /chatgpt|openai/i.test(`${product.title} ${product.category} ${product.tags.join(" ")}`),
  },
  {
    slug: "claude",
    path: "/claude",
    serviceKey: "claude",
    title: "Claude",
    theme: "orange",
    accentColor: "#ff8a3d",
    accentGradient: "linear-gradient(135deg,#ffb36a,#ff7a2f,#d94a17)",
    heroDescription: "Оформите подписку Claude без лишних сложностей. Выберите тариф, оплатите заказ, а GPTishka возьмёт подключение на себя — с поддержкой и гарантией на весь срок подписки.",
    match: (product) => /claude/i.test(`${product.title} ${product.category} ${product.tags.join(" ")}`),
  },
  {
    slug: "supergrok",
    path: "/supergrok",
    serviceKey: "grok",
    title: "SuperGrok",
    theme: "black",
    accentColor: "#f5f7fb",
    accentGradient: "linear-gradient(135deg,#f5f7fb,#8b95a7,#111827)",
    heroDescription: "Оформите подписку SuperGrok без лишних сложностей. Выберите тариф, оплатите заказ, а GPTishka возьмёт подключение на себя — с поддержкой и гарантией на весь срок подписки.",
    match: (product) => /supergrok|grok|xai/i.test(`${product.title} ${product.category} ${product.tags.join(" ")}`),
  },
  {
    slug: "gptishka-vpn",
    path: "/store/vpn",
    serviceKey: "vpn",
    title: "GPTishka VPN",
    theme: "dark-blue",
    accentColor: "#4aa8ff",
    accentGradient: "linear-gradient(135deg,#66c7ff,#2479ff,#102a7a)",
    heroDescription: "Подключите GPTishka VPN с автоматической выдачей VLESS-ключа после оплаты.",
    match: (product) => /vpn|vless|reality/i.test(`${product.title} ${product.category} ${product.tags.join(" ")} ${product.deliveryType || ""}`),
  },
];

async function main() {
  const products = await prisma.product.findMany({
    where: { isArchived: false },
    select: { id: true, title: true, category: true, tags: true, deliveryType: true },
    orderBy: [{ createdAt: "asc" }],
  });

  for (const page of pages) {
    const record = await prisma.servicePage.upsert({
      where: { slug: page.slug },
      create: {
        slug: page.slug,
        path: page.path,
        serviceKey: page.serviceKey,
        title: page.title,
        heroEyebrow: "Тарифные планы",
        heroTitle: page.title,
        heroDescription: page.heroDescription,
        theme: page.theme,
        accentColor: page.accentColor,
        accentGradient: page.accentGradient,
        constructorTitle: page.title,
        constructorDescription: page.heroDescription,
        sortOrder: pages.indexOf(page) * 10 + 10,
      },
      update: {
        path: page.path,
        serviceKey: page.serviceKey,
        title: page.title,
        heroTitle: page.title,
        theme: page.theme,
        accentColor: page.accentColor,
        accentGradient: page.accentGradient,
      },
    });

    let sortOrder = 10;
    for (const product of products.filter(page.match)) {
      await prisma.servicePageProductPlacement.upsert({
        where: {
          servicePageId_productId: {
            servicePageId: record.id,
            productId: product.id,
          },
        },
        create: {
          servicePageId: record.id,
          productId: product.id,
          sortOrder,
          isActive: true,
          isPinned: false,
        },
        update: {
          sortOrder,
          isActive: true,
        },
      });
      sortOrder += 10;
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 2: Add package script**

In `apps/admin-backend/package.json`, add:

```json
"backfill:service-pages": "tsx scripts/backfill-service-pages.ts"
```

Place it after the existing `"bootstrap:user"` script and add a comma to the previous line.

- [ ] **Step 3: Run TypeScript build**

Run:

```powershell
npm run build:admin:api
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add apps/admin-backend/scripts/backfill-service-pages.ts apps/admin-backend/package.json
git commit -m "feat: add service page backfill"
```

---

## Task 5: Admin constructor data wiring

**Files:**
- Modify: `apps/admin-ui/src/pages/ProductsPage.tsx`

- [ ] **Step 1: Add service page types**

Near existing product types in `ProductsPage.tsx`, add:

```ts
type ServicePageProductPlacement = {
  id: string;
  servicePageId: string;
  productId: string;
  sortOrder: number;
  isActive: boolean;
  isPinned: boolean;
};

type ServicePage = {
  id: string;
  slug: string;
  path: string;
  serviceKey: string;
  title: string;
  titleEn?: string;
  heroEyebrow?: string;
  heroTitle?: string;
  heroDescription?: string;
  heroVideoUrl?: string;
  heroImageUrl?: string;
  heroLogoUrl?: string;
  theme?: string;
  accentColor?: string;
  accentGradient?: string;
  darkOverlay?: string;
  colorOverlay?: string;
  constructorTitle?: string;
  constructorDescription?: string;
  infoSections?: unknown[];
  faqItems?: unknown[];
  paymentCaptionLava?: string;
  paymentCaptionEnot?: string;
  isActive: boolean;
  isIndexed: boolean;
  sortOrder: number;
  placements?: ServicePageProductPlacement[];
};
```

Extend `type Product` with:

```ts
  servicePagePlacements?: ServicePageProductPlacement[];
```

- [ ] **Step 2: Add service page state**

Inside `ProductsPage`, add state:

```ts
  const [servicePageMode, setServicePageMode] = useState<"existing" | "new">("existing");
  const [selectedServicePageId, setSelectedServicePageId] = useState("");
  const [servicePageDraft, setServicePageDraft] = useState<Partial<ServicePage>>({
    title: "",
    slug: "",
    path: "",
    serviceKey: "",
    theme: "custom",
    accentColor: "#35f28f",
    accentGradient: "linear-gradient(135deg,#35f28f,#18c878,#0f8f5c)",
    heroEyebrow: "Тарифные планы",
    heroTitle: "",
    heroDescription: "",
    constructorTitle: "",
    constructorDescription: "",
    paymentCaptionLava: "СБП 0% и карты 3.2%",
    paymentCaptionEnot: "Карты 3.2% и СБП 0%",
    isActive: true,
    isIndexed: true,
    sortOrder: 100,
  });
  const [servicePagePlacementEnabled, setServicePagePlacementEnabled] = useState(true);
  const [servicePagePlacementSortOrder, setServicePagePlacementSortOrder] = useState("100");
```

- [ ] **Step 3: Add queries and mutations**

Near existing React Query calls, add:

```ts
  const servicePages = useQuery({
    queryKey: ["service-pages"],
    queryFn: async () => (await api.get("/service-pages")).data as { items: ServicePage[] },
  });

  const createServicePage = useMutation({
    mutationFn: async (payload: Partial<ServicePage>) => (await api.post("/service-pages", payload)).data as ServicePage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["service-pages"] }),
  });

  const updateServicePage = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<ServicePage> }) =>
      (await api.put(`/service-pages/${id}`, payload)).data as ServicePage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["service-pages"] }),
  });

  const addServicePagePlacement = useMutation({
    mutationFn: async ({ servicePageId, productId, sortOrder, isActive }: { servicePageId: string; productId: string; sortOrder: number; isActive: boolean }) =>
      (await api.post(`/service-pages/${servicePageId}/products`, { productId, sortOrder, isActive, isPinned: false })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-pages"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
```

- [ ] **Step 4: Reset service page form state**

In the existing form reset function, add:

```ts
    setServicePageMode("existing");
    setSelectedServicePageId("");
    setServicePageDraft({
      title: "",
      slug: "",
      path: "",
      serviceKey: "",
      theme: "custom",
      accentColor: "#35f28f",
      accentGradient: "linear-gradient(135deg,#35f28f,#18c878,#0f8f5c)",
      heroEyebrow: "Тарифные планы",
      heroTitle: "",
      heroDescription: "",
      constructorTitle: "",
      constructorDescription: "",
      paymentCaptionLava: "СБП 0% и карты 3.2%",
      paymentCaptionEnot: "Карты 3.2% и СБП 0%",
      isActive: true,
      isIndexed: true,
      sortOrder: 100,
    });
    setServicePagePlacementEnabled(true);
    setServicePagePlacementSortOrder("100");
```

- [ ] **Step 5: Load service page state on edit**

In `onEdit(item: Product)`, after visual config setup, add:

```ts
    const servicePlacement = Array.isArray(item.servicePagePlacements) ? item.servicePagePlacements[0] : null;
    if (servicePlacement) {
      setServicePageMode("existing");
      setSelectedServicePageId(servicePlacement.servicePageId);
      setServicePagePlacementEnabled(servicePlacement.isActive !== false);
      setServicePagePlacementSortOrder(String(servicePlacement.sortOrder ?? 100));
    } else {
      setServicePageMode("existing");
      setSelectedServicePageId("");
      setServicePagePlacementEnabled(true);
      setServicePagePlacementSortOrder("100");
    }
```

Task 9 updates the backend product payload to include `servicePagePlacements`. During Task 5, keep this edit in place; it will compile after Task 9 or after adding a temporary optional field to the local UI type.

- [ ] **Step 6: Save service page and placement after product save**

In `onSubmitProductForm`, after product create/update returns a product id and after visual save succeeds, call this helper:

```ts
  async function saveServicePagePlacementForProduct(productId: string) {
    let servicePageId = selectedServicePageId;

    if (servicePageMode === "new") {
      const createdPage = await createServicePage.mutateAsync({
        ...servicePageDraft,
        title: String(servicePageDraft.title || title || "").trim(),
        heroTitle: String(servicePageDraft.heroTitle || servicePageDraft.title || title || "").trim(),
        constructorTitle: String(servicePageDraft.constructorTitle || servicePageDraft.title || title || "").trim(),
      });
      servicePageId = createdPage.id;
      setSelectedServicePageId(createdPage.id);
    } else if (selectedServicePageId && servicePageDraft.id === selectedServicePageId) {
      await updateServicePage.mutateAsync({ id: selectedServicePageId, payload: servicePageDraft });
    }

    if (servicePageId) {
      await addServicePagePlacement.mutateAsync({
        servicePageId,
        productId,
        sortOrder: Number(servicePagePlacementSortOrder || 100),
        isActive: servicePagePlacementEnabled,
      });
    }
  }
```

Call it for both update and create flows:

```ts
      await saveServicePagePlacementForProduct(editingId);
```

and:

```ts
      await saveServicePagePlacementForProduct(createdId);
```

- [ ] **Step 7: Run admin UI build**

Run:

```powershell
npm run build:admin:ui
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add apps/admin-ui/src/pages/ProductsPage.tsx
git commit -m "feat: wire service pages into product editor"
```

---

## Task 6: Admin constructor visual layout

**Files:**
- Modify: `apps/admin-ui/src/pages/ProductsPage.tsx`

- [ ] **Step 1: Replace top form layout with constructor sections**

Change the top `<form className="grid gap-2 md:grid-cols-4">` into:

```tsx
<form className="space-y-4" onSubmit={onSubmitProductForm}>
```

Create section wrappers in this order and move the current controls into them without renaming the state variables or event handlers:

1. `1. Основа товара`
   - wrapper class: `rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950`
   - contains: `title`, `titleEn`, category controls, `description`, `descriptionEn`, `durationLabelRu`, `durationLabelEn`.
2. `2. Страница сервиса`
   - wrapper class: `rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950`
   - contains the full service page panel markup from Step 2.
3. `3. Варианты покупки`
   - wrapper class: `rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950`
   - contains the current `activationVariantTab`, `withLogin`, and `withoutLogin` UI.
4. `4. Визуал и модалка`
   - wrapper class: `rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950`
   - contains `ProductVisualPreview`, visual inputs that remain in the main flow, `modalDescription`, and `modalDescriptionEn`.
5. `Дополнительно: tags и технические настройки`
   - use a `<details>` wrapper with class `rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900`
   - contains tags, legacy delivery fallback, raw technical values, disabled-product danger actions, and any legacy controls that should not distract daily editing.

- [ ] **Step 2: Add service page panel markup**

Inside section “2. Страница сервиса”, add:

```tsx
<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
  <div className="grid gap-3 md:grid-cols-2">
    <div className="md:col-span-2 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        className={`rounded-lg px-3 py-2 text-sm font-semibold ${servicePageMode === "existing" ? "bg-cyan-600 text-white" : "text-slate-600 dark:text-slate-300"}`}
        onClick={() => setServicePageMode("existing")}
      >
        Выбрать существующую
      </button>
      <button
        type="button"
        className={`rounded-lg px-3 py-2 text-sm font-semibold ${servicePageMode === "new" ? "bg-cyan-600 text-white" : "text-slate-600 dark:text-slate-300"}`}
        onClick={() => setServicePageMode("new")}
      >
        Создать новую
      </button>
    </div>

    {servicePageMode === "existing" && (
      <label className="grid gap-1 md:col-span-2">
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Страница сервиса</span>
        <select className="input" value={selectedServicePageId} onChange={(e) => setSelectedServicePageId(e.target.value)}>
          <option value="">Не привязывать к странице</option>
          {(servicePages.data?.items || []).map((page) => (
            <option key={page.id} value={page.id}>
              {page.title} — {page.path}
            </option>
          ))}
        </select>
      </label>
    )}

    <input className="input" placeholder="Название страницы, например Midjourney" value={servicePageDraft.title || ""} onChange={(e) => setServicePageDraft((prev) => ({ ...prev, title: e.target.value }))} />
    <input className="input" placeholder="URL, например /midjourney" value={servicePageDraft.path || ""} onChange={(e) => setServicePageDraft((prev) => ({ ...prev, path: e.target.value }))} />
    <input className="input" placeholder="serviceKey, например midjourney" value={servicePageDraft.serviceKey || ""} onChange={(e) => setServicePageDraft((prev) => ({ ...prev, serviceKey: e.target.value }))} />
    <select className="input" value={servicePageDraft.theme || "custom"} onChange={(e) => setServicePageDraft((prev) => ({ ...prev, theme: e.target.value }))}>
      <option value="emerald">ChatGPT / зеленый</option>
      <option value="orange">Claude / оранжевый</option>
      <option value="black">Grok / черный</option>
      <option value="dark-blue">VPN / темно-синий</option>
      <option value="custom">Свой цвет</option>
    </select>
    <input className="input" placeholder="#35f28f" value={servicePageDraft.accentColor || ""} onChange={(e) => setServicePageDraft((prev) => ({ ...prev, accentColor: e.target.value }))} />
    <input className="input" placeholder="linear-gradient(135deg,#35f28f,#18c878,#0f8f5c)" value={servicePageDraft.accentGradient || ""} onChange={(e) => setServicePageDraft((prev) => ({ ...prev, accentGradient: e.target.value }))} />
    <input className="input" placeholder="Hero label" value={servicePageDraft.heroEyebrow || ""} onChange={(e) => setServicePageDraft((prev) => ({ ...prev, heroEyebrow: e.target.value }))} />
    <input className="input" placeholder="Hero title" value={servicePageDraft.heroTitle || ""} onChange={(e) => setServicePageDraft((prev) => ({ ...prev, heroTitle: e.target.value }))} />
    <textarea className="input min-h-20 md:col-span-2" placeholder="Описание hero" value={servicePageDraft.heroDescription || ""} onChange={(e) => setServicePageDraft((prev) => ({ ...prev, heroDescription: e.target.value }))} />
    <input className="input md:col-span-2" placeholder="URL видео hero" value={servicePageDraft.heroVideoUrl || ""} onChange={(e) => setServicePageDraft((prev) => ({ ...prev, heroVideoUrl: e.target.value }))} />
    <input className="input md:col-span-2" placeholder="URL картинки/логотипа hero" value={servicePageDraft.heroImageUrl || ""} onChange={(e) => setServicePageDraft((prev) => ({ ...prev, heroImageUrl: e.target.value }))} />

    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={servicePagePlacementEnabled} onChange={(e) => setServicePagePlacementEnabled(e.target.checked)} />
      Показывать этот товар на странице
    </label>
    <input className="input" inputMode="numeric" placeholder="Порядок товара" value={servicePagePlacementSortOrder} onChange={(e) => setServicePagePlacementSortOrder(e.target.value)} />
  </div>

  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
    <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Preview</div>
    <div className="mt-3 rounded-2xl p-4 text-white" style={{ background: servicePageDraft.accentGradient || servicePageDraft.accentColor || "#111827" }}>
      <div className="text-xs uppercase tracking-[0.18em] opacity-70">{servicePageDraft.heroEyebrow || "Тарифные планы"}</div>
      <div className="mt-2 text-2xl font-black">{servicePageDraft.heroTitle || servicePageDraft.title || title || "Название сервиса"}</div>
      <p className="mt-2 text-xs opacity-80">{servicePageDraft.heroDescription || "Описание страницы будет здесь."}</p>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Move noisy fields into `details`**

The main form must not show:

- icon PNG controls;
- badge controls;
- text alignment controls;
- raw `buttonStyle` input.

If any of these are still present, move them into the `details` block or remove the JSX while leaving backend fields untouched.

- [ ] **Step 4: Run admin UI build**

Run:

```powershell
npm run build:admin:ui
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/admin-ui/src/pages/ProductsPage.tsx
git commit -m "feat: redesign product editor as constructor"
```

---

## Task 7: Storefront generic service API proxy and dynamic route

**Files:**
- Modify: `server.js`
- Create: `service.html`

- [ ] **Step 1: Add public service page proxy**

In `server.js`, after `/api/public/showcase`, add:

```js
  app.get("/api/public/service-pages/:slug", async (req, res) => {
    const lang = String(req.query?.lang || "ru").toLowerCase().startsWith("en") ? "en" : "ru";
    const slug = String(req.params.slug || "").trim();

    try {
      const { response } = await fetchAdminWithFallback(
        `/api/public/service-pages/${encodeURIComponent(slug)}?lang=${lang}`,
        {
          headers: buildAdminProxyHeaders(req, { method: "GET" }),
        },
        {
          timeoutMs: 8000,
          retryStatuses: [502, 503, 504],
        }
      );

      const body = await response.text();
      res.status(response.status);
      const contentType = response.headers.get("content-type");
      if (contentType) res.setHeader("Content-Type", contentType);
      return res.send(body);
    } catch (_) {
      return res.status(502).json({ error: "Service page API unavailable" });
    }
  });
```

- [ ] **Step 2: Add service existence helper**

Near `sendFreshHtml`, add:

```js
  async function resolveDynamicServicePage(req) {
    const rawPath = String(req.path || "").replace(/^\/+/, "").replace(/\/+$/g, "");
    if (!rawPath || rawPath.includes(".") || rawPath.startsWith("api/") || rawPath.startsWith("admin/")) return null;
    const reserved = new Set(["cart", "payment", "success", "fail", "redeem-start", "store/vpn/activate"]);
    if (reserved.has(rawPath)) return null;

    try {
      const { response } = await fetchAdminWithFallback(
        `/api/public/service-pages/${encodeURIComponent(rawPath)}?lang=ru`,
        { headers: buildAdminProxyHeaders(req, { method: "GET" }) },
        { timeoutMs: 2500, retryStatuses: [502, 503, 504] }
      );
      if (!response.ok) return null;
      const payload = await response.json();
      if (!payload?.page?.serviceKey) return null;
      return payload.page;
    } catch (_) {
      return null;
    }
  }
```

- [ ] **Step 3: Create generic template**

Create `service.html`:

```html
<!DOCTYPE html>
<html lang="ru">
<head>
<script src="/assets/js/analytics-init.js?v=20260305a" defer></script>
<meta charset="UTF-8" />
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="512x512" href="/assets/img/site-icon.png">
<link rel="apple-touch-icon" href="/assets/img/site-icon.png">
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="index, follow">
<title>GPTishka — тарифные планы</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Montserrat:wght@700;800&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/logo.min.css">
<link rel="stylesheet" href="/assets/css/theme.min.css?v=20260516fix4">
<link rel="stylesheet" href="/assets/css/unified-premium.css?v=20260322-cardalign7" />
<link rel="stylesheet" href="/assets/css/trust-promo.css?v=20260305g">
<link rel="preload" href="/assets/css/support-widget.css?v=20260315b" as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="/assets/css/support-widget.css?v=20260315b" /></noscript>
<link rel="stylesheet" href="/assets/css/home-cro.css?v=20260324-cro12" />
<link rel="stylesheet" href="/assets/css/home-stability-hotfix.css?v=20260619-service-constructor1" />
</head>
<body>
<div class="page-overlay"></div>
<header>
  <div class="nav">
    <a href="/" class="logo-link">
      <img loading="eager" decoding="async" fetchpriority="high" width="300" height="127" src="/assets/img/logo.png?v=20260531lcp1" alt="GPTишка" class="logo-img">
    </a>
    <nav>
      <a href="/">Главная</a>
      <a href="/#pricing" class="active">Тарифы</a>
      <a href="/#how">Как это работает</a>
      <a href="/#activationVideo">Как активировать</a>
      <a href="/#faq">Вопросы и ответы</a>
    </nav>
  </div>
</header>

<main class="page service-page service-page--constructor service-page--dynamic" data-service-page="" data-service-layout="constructor">
  <section class="service-hero service-hero--dynamic">
    <video class="service-hero__video" autoplay muted loop playsinline preload="auto" hidden></video>
    <div class="service-hero__green-overlay"></div>
    <div class="service-hero__dark-overlay"></div>
    <a class="service-back-link" href="/#pricing">← Все сервисы</a>
    <div class="service-hero__content">
      <span class="service-hero__eyebrow">Тарифные планы</span>
      <h1>GPTishka</h1>
      <p>Выберите тариф, оплатите заказ, а GPTishka возьмёт подключение на себя.</p>
    </div>
  </section>

  <section class="service-plans-section" id="plans">
    <div class="service-constructor-shell">
      <div class="service-product-gallery" aria-hidden="true"></div>
      <div class="service-constructor-card">
        <div class="service-constructor-head">
          <div class="service-constructor-brand">
            <span>Тарифные планы</span>
            <h2>GPTishka</h2>
          </div>
          <div class="service-constructor-price">
            <strong id="serviceConstructorPrice">—</strong>
          </div>
        </div>
        <div class="service-filter-stack service-filter-stack--constructor" aria-label="Фильтры тарифов">
          <div id="servicePlanFilters"></div>
          <div id="serviceDeliveryFilters"></div>
          <div id="serviceDurationFilters"></div>
        </div>
        <div class="service-selected-plan" id="servicePlansGrid" aria-live="polite"></div>
        <div class="service-constructor-description">
          <h3>GPTishka</h3>
          <p>Описание появится после загрузки настроек страницы.</p>
          <div class="service-delivery-help"></div>
        </div>
      </div>
    </div>
  </section>

  <section class="service-info-section service-info-section--dynamic" data-service-info-section></section>
  <section class="service-faq-section" id="faq" data-service-faq-section></section>
</main>

<div class="payment-method-modal" id="cartPaymentModal" hidden aria-hidden="true"></div>

<footer>
  <div class="footer-links-primary">
    <a class="footer-link" href="/oferta.html">Публичная оферта</a> &middot; <a class="footer-link" href="/politika.html">Политика конфиденциальности</a> &middot; <a class="footer-link" href="/refund.html">Условия возврата</a>
  </div>
  <span class="footer-copy">&copy; 2026 GPTishka. Все права защищены, копирование запрещено.</span>
</footer>
<script src="/assets/js/app.min.js?v=20260619-service-constructor1" defer></script>
<script src="/assets/js/support-widget.js?v=20260609-aiiisupport1" defer></script>
</body>
</html>
```

- [ ] **Step 4: Add dynamic route before fallback**

In `server.js`, before the existing catch-all `app.get("*", ...)`, add:

```js
  app.get(["/:serviceSlug", "/:serviceSlug/"], async (req, res, next) => {
    const page = await resolveDynamicServicePage(req);
    if (!page) return next();
    return sendFreshHtml(res, path.join(__dirname, "service.html"));
  });
```

Do not add a wildcard dynamic route for nested paths in this task; `/store/vpn` remains explicit.

- [ ] **Step 5: Run storefront smoke check**

Run:

```powershell
node -c server.js
```

Expected: no syntax errors.

- [ ] **Step 6: Commit**

```powershell
git add server.js service.html
git commit -m "feat: add dynamic service page shell"
```

---

## Task 8: Storefront reads service page config

**Files:**
- Modify: `assets/js/app.js`
- Modify: `assets/js/app.min.js`
- Modify: `assets/css/home-stability-hotfix.css`

- [ ] **Step 1: Add service page state**

In `assets/js/app.js`, near existing service page variables, add:

```js
  let dynamicServicePagePayload = null;
```

- [ ] **Step 2: Add fetch helper**

Near existing public product fetch helpers, add:

```js
  async function fetchServicePageConfig(serviceKey) {
    const key = String(serviceKey || "").trim() || String(location.pathname || "").replace(/^\/+|\/+$/g, "");
    if (!key) return null;
    try {
      const response = await fetch("/api/public/service-pages/" + encodeURIComponent(key) + "?lang=" + lang, { cache: "no-store" });
      if (!response.ok) return null;
      return await response.json();
    } catch (_) {
      return null;
    }
  }
```

- [ ] **Step 3: Apply theme**

Add:

```js
  function applyServicePageTheme(payload) {
    if (!servicePageRootEl || !payload || !payload.theme) return;
    const theme = payload.theme;
    servicePageRootEl.dataset.serviceTheme = String(theme.theme || "custom");
    servicePageRootEl.style.setProperty("--service-accent", String(theme.accentColor || "#35f28f"));
    servicePageRootEl.style.setProperty("--service-accent-gradient", String(theme.accentGradient || "linear-gradient(135deg,#35f28f,#18c878,#0f8f5c)"));
    servicePageRootEl.style.setProperty("--service-dark-overlay", String(theme.darkOverlay || "linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.58))"));
    servicePageRootEl.style.setProperty("--service-color-overlay", String(theme.colorOverlay || "linear-gradient(135deg,rgba(0,255,120,.28),rgba(0,130,80,.18),rgba(0,0,0,.20))"));
  }
```

- [ ] **Step 4: Apply hero/content**

Add:

```js
  function applyServicePageContent(payload) {
    if (!servicePageRootEl || !payload || !payload.page) return;
    const page = payload.page;
    const key = normalizeAiServiceKey(page.serviceKey || page.slug || getServicePageKey());
    servicePageRootEl.setAttribute("data-service-page", key);

    const eyebrow = servicePageRootEl.querySelector(".service-hero__eyebrow");
    const title = servicePageRootEl.querySelector(".service-hero__content h1");
    const description = servicePageRootEl.querySelector(".service-hero__content p");
    const constructorBrand = servicePageRootEl.querySelector(".service-constructor-brand h2");
    const constructorBrandLabel = servicePageRootEl.querySelector(".service-constructor-brand span");
    const constructorDescriptionTitle = servicePageRootEl.querySelector(".service-constructor-description h3");
    const constructorDescriptionText = servicePageRootEl.querySelector(".service-constructor-description p");
    const video = servicePageRootEl.querySelector(".service-hero__video");

    if (eyebrow) eyebrow.textContent = page.heroEyebrow || "Тарифные планы";
    if (title) title.textContent = page.heroTitle || page.title || "GPTishka";
    if (description) description.textContent = page.heroDescription || "";
    if (constructorBrand) constructorBrand.textContent = page.constructorTitle || page.title || "GPTishka";
    if (constructorBrandLabel) constructorBrandLabel.textContent = page.heroEyebrow || "Тарифные планы";
    if (constructorDescriptionTitle) constructorDescriptionTitle.textContent = page.constructorTitle || page.title || "GPTishka";
    if (constructorDescriptionText) constructorDescriptionText.textContent = page.constructorDescription || page.heroDescription || "";

    if (video && page.heroVideoUrl) {
      video.hidden = false;
      video.innerHTML = '<source src="' + escapeHtml(page.heroVideoUrl) + '" type="video/mp4">';
      try { video.load(); } catch (_) {}
    }

    if (payload.meta && payload.meta.title) document.title = payload.meta.title;
  }
```

- [ ] **Step 5: Apply info and FAQ**

Add:

```js
  function renderDynamicServiceInfo(payload) {
    const section = document.querySelector("[data-service-info-section]");
    if (!section || !payload?.page) return;
    const items = Array.isArray(payload.page.infoSections) ? payload.page.infoSections : [];
    if (!items.length) {
      section.innerHTML = "";
      section.hidden = true;
      return;
    }
    section.hidden = false;
    section.innerHTML =
      '<div class="service-section-title"><h2>Возможности</h2><p>' + escapeHtml(payload.page.title || "") + "</p></div>" +
      '<div class="service-info-grid">' +
      items.map((item) => (
        '<article class="service-info-card"><h3>' + escapeHtml(String(item?.title || "")) + "</h3><p>" + escapeHtml(String(item?.text || "")) + "</p></article>"
      )).join("") +
      "</div>";
  }

  function renderDynamicServiceFaq(payload) {
    const section = document.querySelector("[data-service-faq-section]");
    if (!section || !payload?.page) return;
    const items = Array.isArray(payload.page.faqItems) ? payload.page.faqItems : [];
    if (!items.length) {
      section.innerHTML = "";
      section.hidden = true;
      return;
    }
    section.hidden = false;
    section.innerHTML =
      '<div class="service-section-title"><h2>Часто задаваемые вопросы</h2><p>Короткие ответы на самые частые вопросы</p></div>' +
      '<div class="service-faq-list">' +
      items.map((item, index) => (
        '<article class="service-faq-item' + (index === 0 ? " active" : "") + '"><button class="service-faq-question" type="button">' + escapeHtml(String(item?.question || "")) + '<span></span></button><div class="service-faq-answer"><p>' + escapeHtml(String(item?.answer || "")) + "</p></div></article>"
      )).join("") +
      "</div>";
  }
```

- [ ] **Step 6: Use service page products**

In service page initialization, before rendering service page items from `/api/public/products`, fetch config:

```js
    dynamicServicePagePayload = await fetchServicePageConfig(getServicePageKey());
    if (dynamicServicePagePayload) {
      applyServicePageTheme(dynamicServicePagePayload);
      applyServicePageContent(dynamicServicePagePayload);
      renderDynamicServiceInfo(dynamicServicePagePayload);
      renderDynamicServiceFaq(dynamicServicePagePayload);
      servicePageItems = Array.isArray(dynamicServicePagePayload.products) ? dynamicServicePagePayload.products : servicePageItems;
    }
```

Place this inside the existing service page product-loading flow before `renderServicePageFromItems()`.

- [ ] **Step 7: Add generic CSS variables**

In `assets/css/home-stability-hotfix.css`, add:

```css
.service-page--dynamic .service-hero__green-overlay {
  background: var(--service-color-overlay, linear-gradient(135deg, rgba(0,255,120,.28), rgba(0,130,80,.18), rgba(0,0,0,.20)));
}

.service-page--dynamic .service-hero__dark-overlay {
  background: var(--service-dark-overlay, linear-gradient(180deg, rgba(0,0,0,.18), rgba(0,0,0,.58)));
}

.service-page--dynamic .buy-btn,
.service-page--dynamic .chatgpt-order-submit {
  background: var(--service-accent-gradient, linear-gradient(135deg,#35f28f,#18c878,#0f8f5c));
}

.service-page--dynamic .service-filter-chip.is-active,
.service-page--dynamic .chatgpt-payment-option:has(input:checked) {
  border-color: color-mix(in srgb, var(--service-accent, #35f28f) 70%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--service-accent, #35f28f) 36%, transparent);
}
```

- [ ] **Step 8: Minify JS**

Use the existing minification process used in the repo. If no script exists, run:

```powershell
npx terser assets/js/app.js -c -m -o assets/js/app.min.js
```

Expected: `assets/js/app.min.js` updates successfully.

- [ ] **Step 9: Run syntax check**

Run:

```powershell
node --check assets/js/app.js
node --check server.js
```

Expected: both pass.

- [ ] **Step 10: Commit**

```powershell
git add assets/js/app.js assets/js/app.min.js assets/css/home-stability-hotfix.css
git commit -m "feat: render service pages from admin config"
```

---

## Task 9: Product repository includes service placements

**Files:**
- Modify: `apps/admin-backend/src/modules/products/products.repository.ts`

- [ ] **Step 1: Add include object**

At the top of `products.repository.ts`, after imports, add:

```ts
const productInclude = {
  images: true,
  visualConfig: true,
  showcasePlacements: {
    include: {
      section: true,
    },
    orderBy: [{ isPinned: "desc" as const }, { sortOrder: "asc" as const }],
  },
  servicePagePlacements: {
    include: {
      servicePage: true,
    },
    orderBy: [{ isPinned: "desc" as const }, { sortOrder: "asc" as const }],
  },
};
```

- [ ] **Step 2: Replace repeated includes**

Replace each repository include that currently repeats `images`, `visualConfig`, and `showcasePlacements` with:

```ts
include: productInclude,
```

Do this in:

- `list`
- `findById`
- `create`
- `update`
- `bulkPrice`

- [ ] **Step 3: Run backend build**

Run:

```powershell
npm run build:admin:api
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add apps/admin-backend/src/modules/products/products.repository.ts
git commit -m "feat: expose product service page placements"
```

---

## Task 10: Verification scripts

**Files:**
- Create: `scripts/check-dynamic-service-page.js`

- [ ] **Step 1: Create script**

Create `scripts/check-dynamic-service-page.js`:

```js
const { chromium } = require("playwright");

const url = process.argv[2] || "http://localhost:4000/chatgpt";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  await page.goto(url, { waitUntil: "networkidle" });

  const result = await page.evaluate(() => {
    const root = document.querySelector("[data-service-page]");
    const heroTitle = document.querySelector(".service-hero__content h1")?.textContent?.trim() || "";
    const plansGrid = document.querySelector("#servicePlansGrid");
    const buyButton = document.querySelector(".pay-now-btn");
    return {
      servicePage: root?.getAttribute("data-service-page") || "",
      heroTitle,
      hasPlansGrid: Boolean(plansGrid),
      hasBuyButton: Boolean(buyButton),
      buyButtonText: buyButton?.textContent?.trim() || "",
    };
  });

  console.log(JSON.stringify(result, null, 2));

  if (!result.servicePage) throw new Error("Missing data-service-page");
  if (!result.heroTitle) throw new Error("Missing hero title");
  if (!result.hasPlansGrid) throw new Error("Missing servicePlansGrid");
  if (!result.hasBuyButton) throw new Error("Missing buy button");

  await browser.close();
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Run existing page checks**

With local storefront/admin backend running, run:

```powershell
node scripts/check-dynamic-service-page.js http://localhost:4000/chatgpt
node scripts/check-dynamic-service-page.js http://localhost:4000/claude
node scripts/check-dynamic-service-page.js http://localhost:4000/supergrok
node scripts/check-dynamic-service-page.js http://localhost:4000/store/vpn/
```

Expected: each prints JSON with `hasBuyButton: true`.

- [ ] **Step 3: Run existing modal checks**

Run available scripts:

```powershell
node scripts/check-chatgpt-order-modal.js
node scripts/check-claude-page-modal.js
node scripts/check-supergrok-page-modal.js
node scripts/check-vpn-page-modal.js
```

Expected: all checks pass. If a script expects production URL, update only the script input/base URL, not product logic.

- [ ] **Step 4: Commit**

```powershell
git add scripts/check-dynamic-service-page.js
git commit -m "test: add dynamic service page smoke check"
```

---

## Task 11: Final local verification

**Files:**
- No source edits expected.

- [ ] **Step 1: Full backend build**

Run:

```powershell
npm run build:admin:api
```

Expected: PASS.

- [ ] **Step 2: Full admin UI build**

Run:

```powershell
npm run build:admin:ui
```

Expected: PASS.

- [ ] **Step 3: Backend tests**

Run:

```powershell
node --test apps/admin-backend/src/common/utils/product-delivery.test.ts
node --test apps/admin-backend/src/common/utils/activation-site.test.ts
node --test apps/admin-backend/src/modules/products/public-product-presenter.test.ts
node --test apps/admin-backend/src/modules/service-pages/service-pages.test.ts
```

Expected: all pass.

- [ ] **Step 4: Storefront syntax checks**

Run:

```powershell
node --check server.js
node --check assets/js/app.js
```

Expected: both pass.

- [ ] **Step 5: Browser verification**

Verify in browser:

- `/chatgpt` still renders and opens correct modal.
- `/claude` still renders and opens correct modal.
- `/supergrok` still renders and opens correct modal.
- `/store/vpn/` still renders and opens VPN modal.
- New dynamic service URL opens after creating a `ServicePage`.
- Product editor opens old products without losing data.
- Product editor creates a new service page and links product to it.
- “Без входа” does not show login/password in checkout.
- `activation` orders still route to `redeem-start`.
- `vpn` orders still return VLESS.

- [ ] **Step 6: Final commit if verification adjustments were needed**

If no fixes were needed, do not create an empty commit. If fixes touched known feature files, stage the relevant subset explicitly:

```powershell
git add server.js service.html assets/js/app.js assets/js/app.min.js assets/css/home-stability-hotfix.css apps/admin-ui/src/pages/ProductsPage.tsx apps/admin-backend/src/modules/service-pages apps/admin-backend/src/modules/products apps/admin-backend/src/app.ts
git commit -m "fix: stabilize service constructor verification"
```
