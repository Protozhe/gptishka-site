-- Compatibility projection requested by external integrations.
-- Keeps existing vpn_access as source of truth without breaking runtime logic.

DROP VIEW IF EXISTS vpn_users;

CREATE VIEW vpn_users AS
SELECT
  va.id,
  NULL::text AS user_id,
  va.uuid,
  va.access_link AS vpn_link,
  va.created_at,
  va.expires_at,
  NULL::bigint AS traffic_limit
FROM vpn_access va;

