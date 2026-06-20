import { Prisma } from "@prisma/client";
import { normalizeActivationSiteUrl } from "./activation-site";
import { normalizeDeliveryType, type ProductDeliveryType } from "./product-delivery";

export type ProductActivationVariantKey = "withLogin" | "withoutLogin";

export type ProductActivationVariant = {
  enabled: boolean;
  price: number;
  deliveryType: ProductDeliveryType;
  activationSiteUrl: string;
};

export type ProductActivationVariants = Record<ProductActivationVariantKey, ProductActivationVariant>;

function normalizePrice(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : Math.max(0, Number(fallback || 0));
}

export function normalizeProductActivationVariants(
  value: unknown,
  fallback: { price: number; deliveryType: ProductDeliveryType }
): ProductActivationVariants | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, any>;
  const withLogin = source.withLogin && typeof source.withLogin === "object" ? source.withLogin : {};
  const withoutLogin = source.withoutLogin && typeof source.withoutLogin === "object" ? source.withoutLogin : {};

  return {
    withLogin: {
      enabled: withLogin.enabled !== false,
      price: normalizePrice(withLogin.price, fallback.price),
      deliveryType: normalizeDeliveryType(String(withLogin.deliveryType || "manual_login")),
      activationSiteUrl: normalizeActivationSiteUrl(withLogin.activationSiteUrl),
    },
    withoutLogin: {
      enabled: withoutLogin.enabled !== false,
      price: normalizePrice(withoutLogin.price, fallback.price),
      deliveryType: normalizeDeliveryType(String(withoutLogin.deliveryType || "activation")),
      activationSiteUrl: normalizeActivationSiteUrl(withoutLogin.activationSiteUrl),
    },
  };
}

export function activationVariantsToJson(value: ProductActivationVariants | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value ? (value as unknown as Prisma.InputJsonValue) : Prisma.JsonNull;
}

export function resolveActivationVariant(
  value: unknown,
  fallback: { price: number; deliveryType: ProductDeliveryType },
  requestedKey?: unknown,
  requestedDeliveryMethod?: unknown
) {
  const variants = normalizeProductActivationVariants(value, fallback);
  if (!variants) {
    return {
      key: null,
      enabled: true,
      price: fallback.price,
      deliveryType: fallback.deliveryType,
      activationSiteUrl: "",
    };
  }

  const explicitKey = String(requestedKey || "").trim();
  const deliveryMethod = String(requestedDeliveryMethod || "").trim().toLowerCase();
  const key: ProductActivationVariantKey =
    explicitKey === "withLogin" || deliveryMethod === "login" ? "withLogin" : "withoutLogin";
  const selected = variants[key];
  return { key, ...selected };
}
