ALTER TABLE "ProductShowcaseSection"
  ADD COLUMN IF NOT EXISTS "render_mode" TEXT NOT NULL DEFAULT 'auto';

