export type ProductDeliveryType = "activation" | "credentials" | "manual_login" | "vpn" | "support" | "support_claude";
export type ProductDeliveryMethod = 1 | 2 | 3 | 4 | 5;

const DELIVERY_TAG_PREFIX = "delivery:";

export function normalizeDeliveryType(value: string): ProductDeliveryType {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    [
      "manual_login",
      "manual-login",
      "with_login",
      "with-login",
      "customer-login",
      "customer_login",
      "client-login",
      "client_login",
      "login",
    ].includes(normalized)
  ) {
    return "manual_login";
  }
  if (["credentials", "manual", "login-password", "login_password", "account"].includes(normalized)) {
    return "credentials";
  }
  if (["support", "manual-support", "manual_support", "support-chat", "support_chat", "telegram", "tg"].includes(normalized)) {
    return "support";
  }
  if (["support_claude", "support-claude", "manual-claude", "manual_claude", "claude-support", "claude_support"].includes(normalized)) {
    return "support_claude";
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

export function resolveOrderDeliveryType(
  orderDetails: unknown,
  tags: string[] | null | undefined
): ProductDeliveryType {
  if (orderDetails && typeof orderDetails === "object" && !Array.isArray(orderDetails)) {
    const selection = (orderDetails as Record<string, any>).selection;
    if (selection && typeof selection === "object" && !Array.isArray(selection)) {
      const serverDeliveryType = String((selection as Record<string, any>).serverDeliveryType || "").trim();
      if (serverDeliveryType) return normalizeDeliveryType(serverDeliveryType);

      const activationVariant = String((selection as Record<string, any>).activationVariant || "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "");
      if (activationVariant === "withoutlogin") return "activation";
      if (activationVariant === "withlogin") return "manual_login";

      const deliveryMethod = String(
        (selection as Record<string, any>).deliveryKey ||
          (selection as Record<string, any>).deliveryMethod ||
          ""
      )
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "");
      if (["link", "withoutlogin", "nologin", "token", "key", "activation", "id", "1"].includes(deliveryMethod)) {
        return "activation";
      }
      if (["login", "withlogin", "manuallogin", "customerlogin", "clientlogin"].includes(deliveryMethod)) {
        return "manual_login";
      }
    }
  }
  return resolveProductDeliveryType(tags);
}

export function applyProductDeliveryTypeTag(
  tags: string[] | null | undefined,
  deliveryType: ProductDeliveryType | null | undefined
): string[] {
  const list = Array.isArray(tags) ? tags : [];
  const cleaned = list.filter((tag) => !String(tag || "").trim().toLowerCase().startsWith(DELIVERY_TAG_PREFIX));
  const normalized = normalizeDeliveryType(String(deliveryType || "activation"));
  if (normalized === "manual_login") {
    cleaned.push("delivery:manual_login");
  } else if (normalized === "credentials") {
    cleaned.push("delivery:credentials");
  } else if (normalized === "support") {
    cleaned.push("delivery:support");
  } else if (normalized === "support_claude") {
    cleaned.push("delivery:support_claude");
  } else if (normalized === "vpn") {
    cleaned.push("delivery:vpn");
  }
  return cleaned;
}

export function deliveryTypeToMethod(deliveryType: ProductDeliveryType | null | undefined): ProductDeliveryMethod {
  const normalized = normalizeDeliveryType(String(deliveryType || "activation"));
  if (normalized === "manual_login") return 2;
  if (normalized === "credentials") return 2;
  if (normalized === "support") return 4;
  if (normalized === "support_claude") return 5;
  if (normalized === "vpn") return 3;
  return 1;
}

export function methodToDeliveryType(value: unknown): ProductDeliveryType {
  const raw = String(value ?? "").trim().toLowerCase();
  if (
    raw === "manual_login" ||
    raw === "manual-login" ||
    raw === "with_login" ||
    raw === "with-login" ||
    raw === "customer-login" ||
    raw === "customer_login" ||
    raw === "client-login" ||
    raw === "client_login" ||
    raw === "login"
  ) {
    return "manual_login";
  }
  if (raw === "2" || raw === "credentials" || raw === "manual" || raw === "login_password" || raw === "login-password") {
    return "credentials";
  }
  if (
    raw === "4" ||
    raw === "support" ||
    raw === "manual_support" ||
    raw === "manual-support" ||
    raw === "support_chat" ||
    raw === "support-chat"
  ) {
    return "support";
  }
  if (
    raw === "5" ||
    raw === "support_claude" ||
    raw === "support-claude" ||
    raw === "manual_claude" ||
    raw === "manual-claude" ||
    raw === "claude_support" ||
    raw === "claude-support"
  ) {
    return "support_claude";
  }
  if (raw === "3" || raw === "vpn" || raw === "vless" || raw === "xray" || raw === "reality") {
    return "vpn";
  }
  return "activation";
}
