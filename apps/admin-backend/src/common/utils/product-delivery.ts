export type ProductDeliveryType = "activation" | "credentials" | "vpn";
export type ProductDeliveryMethod = 1 | 2 | 3;

const DELIVERY_TAG_PREFIX = "delivery:";

function normalizeDeliveryType(value: string): ProductDeliveryType {
  const normalized = String(value || "").trim().toLowerCase();
  if (["credentials", "manual", "login-password", "login_password", "account"].includes(normalized)) {
    return "credentials";
  }
  if (["vpn", "vless", "xray", "reality"].includes(normalized)) {
    return "vpn";
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
  } else if (normalized === "vpn") {
    cleaned.push("delivery:vpn");
  }
  return cleaned;
}

export function deliveryTypeToMethod(deliveryType: ProductDeliveryType | null | undefined): ProductDeliveryMethod {
  const normalized = normalizeDeliveryType(String(deliveryType || "activation"));
  if (normalized === "credentials") return 2;
  if (normalized === "vpn") return 3;
  return 1;
}

export function methodToDeliveryType(value: unknown): ProductDeliveryType {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "2" || raw === "credentials" || raw === "manual" || raw === "login_password" || raw === "login-password") {
    return "credentials";
  }
  if (raw === "3" || raw === "vpn" || raw === "vless" || raw === "xray" || raw === "reality") {
    return "vpn";
  }
  return "activation";
}
