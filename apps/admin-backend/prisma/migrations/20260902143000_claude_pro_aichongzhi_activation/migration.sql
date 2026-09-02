-- Route the website Claude Pro activation variant to the new automatic provider.
UPDATE "Product"
SET activation_variants = jsonb_set(
  jsonb_set(
    jsonb_set(COALESCE(activation_variants, '{}'::jsonb), '{withoutLogin,enabled}', 'true'::jsonb, true),
    '{withoutLogin,deliveryType}', '"activation"'::jsonb, true
  ),
  '{withoutLogin,activationSiteUrl}', '"https://aichongzhi.fun/?product=claude"'::jsonb, true
)
WHERE slug = 'claude-pro';
