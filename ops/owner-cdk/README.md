# Owner CDK import

The existing `myadminiibot` consumer provides `/cdk`, a menu button, stock-notice buttons and replies to its own stock notice. Select the exact product/supplier, send up to 20 plain CDKs on separate lines, and confirm the count and pool. Only the MFA-bound active OWNER can use it in their private chat. Marketplace notices link to this owner bot; customers never receive an inventory or supplier notice.

Supported common inventory: Grok Plus/Premium/Super/Ultra monthly via AISOU; Codex 250/500/1000 via AISOU or AI-BUY; Claude Pro via AI-BUY. The catalog deliberately omits tariffs without a matching shared activation route.

The authenticated existing notifier peer socket dispatches this one explicit import action to `bridge.py`. It keeps reference/digest/count receipts in a root-only directory and runs `import.cjs` as the website user with the website's existing runtime configuration. The Node boundary rechecks active OWNER and uses `licenseService.importKeys`, preserving supplier, pool, duplicate, audit and binding safeguards. No purchase, card, payment, refund or activation endpoint is added. Existing stock loops continue authorized customer jobs after import.

Confirmation drafts are private, encrypted at rest, expire after 30 minutes and are immutable once their confirmation is shown. Cancellation clears pending code ciphertext. Stable references and inventory uniqueness prevent duplicated imports after repeat callbacks, restarts and an unconfirmed response. Confirmed receipts contain counts only; CDKs are not echoed into replies or diagnostics. Other administrators, groups and foreign/forwarded reply contexts cannot import.

`install.py` overlays the reviewed live consumer after exact source-hash and MFA-owner checks, preserving all existing controls and the sole `getUpdates` consumer. It also installs the common stock-wait message format in the native marketplace controller. It runs only from a committed clean deployed release, backs up code and reuses existing services; it creates no timer or desktop automation. Tests use isolated databases and mocked transports.
