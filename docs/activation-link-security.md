# Private activation links

Public order status, reconciliation and activation require an order access token. Orders without a token hash fail closed. Admin recovery initializes their hash and issues a signed link; it does not mark an order paid or start activation.

Checkout tokens and legacy r1 recovery links expire seven days after order creation. New r2 recovery links expire seven days after issuance; both expiry and order/hash binding are signed. Recently sent r1 links retain their remaining seven-day window. Expired links can be replaced through the authenticated admin link dialog. The revoke button rotates the order hash, invalidating previous checkout/recovery links and creating a fresh link. Revocation does not change a subscription or payment status.

Sensitive API responses use no-store. Public customer support points to GPTishka support, not a supplier. Delivered digital codes and Gemini activation links remain visible to the authorized customer by design.

Private activation/receipt pages and URLs carrying t do not load third-party analytics. Consequently browser-side conversion goals do not run on those private pages; other public-page analytics remains active. Attribution capture stores clean URLs only.

Application request logs omit query strings and referrers. Configure Nginx access logs with a format containing request_method, uri and server_protocol, never request, request_uri, args or http_referer. Existing token-bearing logs must be sanitized and restricted; preserve forensic originals only in a root-only backup. Nginx error logs have a separate format: restrict their permissions and inspect them separately for token-bearing URLs.

Activation and manual credential JSON files are written with mode 0600. CDKs remain plaintext inside the trusted backend database/runtime; this change does not introduce encryption at rest or protect against root/database administrator access.
