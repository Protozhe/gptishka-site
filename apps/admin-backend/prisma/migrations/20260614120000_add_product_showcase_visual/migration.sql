CREATE TYPE "ProductVisualBackgroundType" AS ENUM ('solid', 'gradient', 'image');

CREATE TABLE "ProductVisualConfig" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "cardTitle" TEXT NOT NULL DEFAULT '',
  "cardDescription" TEXT NOT NULL DEFAULT '',
  "imageUrl" TEXT NOT NULL DEFAULT '',
  "imageAlt" TEXT NOT NULL DEFAULT '',
  "backgroundType" "ProductVisualBackgroundType" NOT NULL DEFAULT 'solid',
  "backgroundColor" TEXT NOT NULL DEFAULT '',
  "backgroundGradient" TEXT NOT NULL DEFAULT '',
  "buttonText" TEXT NOT NULL DEFAULT '',
  "buttonStyle" TEXT NOT NULL DEFAULT '',
  "isVisible" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProductVisualConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductShowcaseSection" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "sortOrder" INTEGER NOT NULL DEFAULT 100,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "showOnHomepage" BOOLEAN NOT NULL DEFAULT true,
  "showInCatalog" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProductShowcaseSection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductShowcasePlacement" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 100,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isPinned" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProductShowcasePlacement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductVisualConfig_productId_key" ON "ProductVisualConfig"("productId");
CREATE INDEX "ProductVisualConfig_isVisible_idx" ON "ProductVisualConfig"("isVisible");
CREATE INDEX "ProductVisualConfig_updatedAt_idx" ON "ProductVisualConfig"("updatedAt");

CREATE UNIQUE INDEX "ProductShowcaseSection_slug_key" ON "ProductShowcaseSection"("slug");
CREATE INDEX "ProductShowcaseSection_isActive_sortOrder_idx" ON "ProductShowcaseSection"("isActive", "sortOrder");
CREATE INDEX "ProductShowcaseSection_showOnHomepage_idx" ON "ProductShowcaseSection"("showOnHomepage");
CREATE INDEX "ProductShowcaseSection_showInCatalog_idx" ON "ProductShowcaseSection"("showInCatalog");

CREATE UNIQUE INDEX "ProductShowcasePlacement_productId_sectionId_key" ON "ProductShowcasePlacement"("productId", "sectionId");
CREATE INDEX "ProductShowcasePlacement_productId_idx" ON "ProductShowcasePlacement"("productId");
CREATE INDEX "ProductShowcasePlacement_sectionId_isActive_sortOrder_idx" ON "ProductShowcasePlacement"("sectionId", "isActive", "sortOrder");
CREATE INDEX "ProductShowcasePlacement_isPinned_idx" ON "ProductShowcasePlacement"("isPinned");

ALTER TABLE "ProductVisualConfig"
  ADD CONSTRAINT "ProductVisualConfig_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductShowcasePlacement"
  ADD CONSTRAINT "ProductShowcasePlacement_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductShowcasePlacement"
  ADD CONSTRAINT "ProductShowcasePlacement_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "ProductShowcaseSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
