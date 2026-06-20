WITH source_products AS (
  SELECT p.*
  FROM "Product" p
  WHERE p."isArchived" = FALSE
    AND p.tags @> ARRAY['chatgpt']::TEXT[]
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(p.tags) AS tag
      WHERE lower(tag) LIKE 'delivery:%'
        AND lower(tag) NOT IN ('delivery:activation')
    )
)
INSERT INTO "Product" (
  id,
  slug,
  title,
  "titleEn",
  "iconPngUrl",
  description,
  "descriptionEn",
  "modalDescription",
  "modalDescriptionEn",
  price,
  "oldPrice",
  currency,
  category,
  tags,
  stock,
  "isActive",
  "isArchived",
  "createdAt",
  "updatedAt"
)
SELECT
  concat('manual-login-', src.id),
  concat(src.slug, '-login'),
  CASE
    WHEN lower(src.title) LIKE '%со входом%' THEN src.title
    ELSE concat(src.title, ' — со входом')
  END,
  CASE
    WHEN trim(coalesce(src."titleEn", '')) = '' THEN ''
    WHEN lower(src."titleEn") LIKE '%with login%' THEN src."titleEn"
    ELSE concat(src."titleEn", ' with login')
  END,
  src."iconPngUrl",
  src.description,
  src."descriptionEn",
  src."modalDescription",
  src."modalDescriptionEn",
  src.price,
  src."oldPrice",
  src.currency,
  src.category,
  ARRAY(
    SELECT DISTINCT tag
    FROM unnest(
      ARRAY_APPEND(
        ARRAY_APPEND(
          ARRAY(
            SELECT original_tag
            FROM unnest(src.tags) AS original_tag
            WHERE lower(original_tag) NOT LIKE 'delivery:%'
          ),
          'delivery:manual_login'
        ),
        'delivery:login'
      )
    ) AS tag
    WHERE trim(tag) <> ''
  ),
  src.stock,
  src."isActive",
  FALSE,
  now(),
  now()
FROM source_products src
WHERE NOT EXISTS (
  SELECT 1
  FROM "Product" existing
  WHERE existing.id = concat('manual-login-', src.id)
     OR existing.slug = concat(src.slug, '-login')
);
