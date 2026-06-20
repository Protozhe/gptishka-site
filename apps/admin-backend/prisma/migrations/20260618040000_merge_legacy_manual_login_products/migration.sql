UPDATE "Product" AS base
SET "activation_variants" = jsonb_build_object(
  'withLogin', jsonb_build_object(
    'enabled', login."isActive" AND NOT login."isArchived",
    'price', login."price",
    'deliveryType', 'manual_login'
  ),
  'withoutLogin', jsonb_build_object(
    'enabled', base."isActive" AND NOT base."isArchived",
    'price', base."price",
    'deliveryType',
      CASE
        WHEN base."tags" @> ARRAY['delivery:credentials']::text[] THEN 'credentials'
        WHEN base."tags" @> ARRAY['delivery:vpn']::text[] THEN 'vpn'
        WHEN base."tags" @> ARRAY['delivery:support']::text[] THEN 'support'
        WHEN base."tags" @> ARRAY['delivery:support_claude']::text[] THEN 'support_claude'
        ELSE 'activation'
      END
  )
)
FROM "Product" AS login
WHERE login."id" = 'manual-login-' || base."id"
  AND login."isArchived" = false
  AND base."activation_variants" IS NULL;

UPDATE "Product" AS login
SET
  "isActive" = false,
  "isArchived" = true
WHERE login."id" LIKE 'manual-login-%'
  AND EXISTS (
    SELECT 1
    FROM "Product" AS base
    WHERE login."id" = 'manual-login-' || base."id"
      AND base."activation_variants" IS NOT NULL
  );
