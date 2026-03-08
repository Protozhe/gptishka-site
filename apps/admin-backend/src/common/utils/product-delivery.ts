export type ProductDeliveryType = "activation" | "credentials";

const DELIVERY_TAG_PREFIX = "delivery:";

function normalizeDeliveryType(value: string): ProductDeliveryType {
  const normalized = String(value || "").trim().toLowerCase();
  if (["credentials", "manual", "login-password", "login_password", "account"].includes(normalized)) {
    return "credentials";
  }
  return "activation";
}

export function resolveProductDeliveryType(tags: string[] | null | undefined): ProductDeliveryType {
  const list = Array.isArray(tags) ? tags : [];
  const raw = list
    .map((tag) => String(tag || "").trim().toLowerCase())
    .find((tag) => tag.startsWith(DELIVERY_TAG_PREFIX));
  if (!raw) return "activation";
  return normalizeDeliveryType(raw.slice(DELIVERY_TAG_PREFIX.length));
}

export function applyProductDeliveryTypeTag(
  tags: string[] | null | undefined,
  deliveryType: ProductDeliveryType | null | undefined
): string[] {
  const list = Array.isArray(tags) ? tags : [];
  const cleaned = list.filter((tag) => !String(tag || "").trim().toLowerCase().startsWith(DELIVERY_TAG_PREFIX));
  const normalized = normalizeDeliveryType(String(deliveryType || "activation"));
  if (normalized === "credentials") {
    cleaned.push("delivery:credentials");
  }
  return cleaned;
}

