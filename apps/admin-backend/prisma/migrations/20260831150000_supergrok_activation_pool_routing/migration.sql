-- Keep every SuperGrok duration in its own immutable SDK pool. The historical
-- one-month product slug is `supergrok-3`, so its pool is assigned explicitly.
UPDATE "Product"
SET
  tags = ARRAY(
    SELECT DISTINCT tag
    FROM unnest(
      array_remove(
        array_remove(
          array_remove(tags, 'delivery:manual_login'),
          'delivery:activation'
        ),
        'delivery:support'
      ) || ARRAY['delivery:support', 'month:1', 'activation-pool:supergrok-1']
    ) AS tag
    WHERE tag !~ '^month:' AND tag !~ '^activation-pool:'
       OR tag IN ('month:1', 'activation-pool:supergrok-1')
  ),
  activation_variants = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(COALESCE(activation_variants, '{}'::jsonb), '{withLogin,enabled}', 'false'::jsonb, true),
            '{withoutLogin,enabled}', 'true'::jsonb, true
          ),
          '{withoutLogin,deliveryType}', '"support"'::jsonb, true
        ),
        '{withoutLogin,activationSiteUrl}', '""'::jsonb, true
      ),
      '{withLogin,deliveryType}', '"support"'::jsonb, true
    ),
    '{withLogin,activationSiteUrl}', '""'::jsonb, true
  )
WHERE slug = 'supergrok-3';

UPDATE "Product"
SET
  tags = ARRAY(
    SELECT DISTINCT tag
    FROM unnest(array_remove(tags, 'delivery:manual_login') || ARRAY['delivery:support', 'month:2', 'activation-pool:supergrok-2']) AS tag
    WHERE tag !~ '^month:' AND tag !~ '^activation-pool:' AND tag !~ '^delivery:'
       OR tag IN ('delivery:support', 'month:2', 'activation-pool:supergrok-2')
  ),
  activation_variants = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(COALESCE(activation_variants, '{}'::jsonb), '{withLogin,enabled}', 'false'::jsonb, true),
        '{withoutLogin,enabled}', 'true'::jsonb, true
      ),
      '{withoutLogin,deliveryType}', '"support"'::jsonb, true
    ),
    '{withoutLogin,activationSiteUrl}', '""'::jsonb, true
  )
WHERE slug = 'supergrok-2';

UPDATE "Product"
SET
  tags = ARRAY(
    SELECT DISTINCT tag
    FROM unnest(tags || ARRAY['delivery:support', 'month:3', 'activation-pool:supergrok']) AS tag
    WHERE tag !~ '^month:' AND tag !~ '^activation-pool:' AND tag !~ '^delivery:'
       OR tag IN ('delivery:support', 'month:3', 'activation-pool:supergrok')
  ),
  activation_variants = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(COALESCE(activation_variants, '{}'::jsonb), '{withLogin,enabled}', 'false'::jsonb, true),
        '{withoutLogin,enabled}', 'true'::jsonb, true
      ),
      '{withoutLogin,deliveryType}', '"support"'::jsonb, true
    ),
    '{withoutLogin,activationSiteUrl}', '""'::jsonb, true
  )
WHERE slug = 'supergrok';
