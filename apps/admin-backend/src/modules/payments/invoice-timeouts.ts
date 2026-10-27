// Creating an unpaid invoice must not hold the storefront for 10–20 seconds.
// These budgets apply only to invoice creation, never charges or refunds.
export const PRIMARY_INVOICE_TIMEOUT_MS = 3000;
export const GATEWAY_INVOICE_TIMEOUT_MS = 4000;
