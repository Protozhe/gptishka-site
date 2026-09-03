CREATE TABLE "public_notes" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "edit_token_hash" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "content" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "public_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "public_notes_slug_key" ON "public_notes"("slug");
CREATE INDEX "public_notes_updated_at_idx" ON "public_notes"("updated_at");
