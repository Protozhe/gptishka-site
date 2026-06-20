CREATE TABLE "vpn_servers" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country_code" TEXT,
    "city" TEXT,
    "hostname" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 443,
    "sni" TEXT,
    "fp" TEXT DEFAULT 'chrome',
    "pbk" TEXT,
    "sid" TEXT,
    "path" TEXT DEFAULT '/',
    "access_type" TEXT NOT NULL DEFAULT 'vless_reality',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vpn_servers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vpn_servers_slug_key" ON "vpn_servers"("slug");
CREATE INDEX "vpn_servers_is_active_sort_order_idx" ON "vpn_servers"("is_active", "sort_order");
CREATE INDEX "vpn_servers_is_default_idx" ON "vpn_servers"("is_default");
