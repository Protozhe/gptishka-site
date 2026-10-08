type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function numericId(value: unknown): string {
  const id = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  return /^\d{1,80}$/.test(id) ? id : "";
}

/** Use the Metrika visitor ID when available; yclid is a fallback for ad traffic. */
export function conversionIdentifier(orderDetails: unknown): { column: "ClientId" | "Yclid"; value: string } | null {
  const attribution = record(record(orderDetails)?.attribution);
  if (!attribution) return null;
  const clientId = numericId(attribution.clientId);
  if (clientId) return { column: "ClientId", value: clientId };
  const lastTouch = record(attribution.lastTouch);
  const firstTouch = record(attribution.firstTouch);
  const yclid = numericId(lastTouch?.yclid) || numericId(firstTouch?.yclid);
  return yclid ? { column: "Yclid", value: yclid } : null;
}

/** A campaign-scoped upload must use the click ID from that campaign's touch. */
export function campaignConversionIdentifier(orderDetails: unknown, campaign: string): { column: "Yclid"; value: string } | null {
  const attribution = record(record(orderDetails)?.attribution);
  if (!attribution) return null;
  for (const touch of [record(attribution.lastTouch), record(attribution.firstTouch)]) {
    if (touch?.utm_campaign !== campaign) continue;
    const yclid = numericId(touch.yclid);
    if (yclid) return { column: "Yclid", value: yclid };
  }
  return null;
}

export function conversionCsv(input: {
  identifier: { column: "ClientId" | "Yclid"; value: string };
  target: string;
  paidAt: Date;
  price: number;
  currency: string;
}): string {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(input.target)) throw new Error("Invalid Metrika goal identifier");
  if (!numericId(input.identifier.value)) throw new Error("Invalid visitor identifier");
  if (!Number.isFinite(input.paidAt.getTime()) || input.paidAt.getTime() > Date.now()) throw new Error("Invalid payment time");
  if (!Number.isFinite(input.price) || input.price < 0) throw new Error("Invalid order price");
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error("Invalid currency");
  return [
    `${input.identifier.column},Target,DateTime,Price,Currency`,
    `${input.identifier.value},${input.target},${Math.floor(input.paidAt.getTime() / 1000)},${input.price.toFixed(2)},${input.currency}`,
    "",
  ].join("\n");
}
