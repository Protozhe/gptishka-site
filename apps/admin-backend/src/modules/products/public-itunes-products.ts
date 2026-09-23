import { Currency } from "@prisma/client";
import { resolveProductDeliveryType } from "../../common/utils/product-delivery";
import { resolveActivationVariant } from "../../common/utils/product-activation-variants";

type ItunesProduct = {
  slug: string;
  price: number | { toString(): string };
  currency: Currency;
  tags: string[];
  activationVariants: unknown;
};

export function buildPublicItunesProducts(products: ItunesProduct[]) {
  return products.flatMap((product) => {
    const denominationTag = product.tags.find((tag) => /^denomination:\d+$/.test(tag));
    const denomination = Number(denominationTag?.split(":")[1]);
    if (!Number.isInteger(denomination) || denomination <= 0) return [];
    const variant = resolveActivationVariant(
      product.activationVariants,
      { price: Number(product.price), deliveryType: resolveProductDeliveryType(product.tags) },
      "withoutLogin",
      "code"
    );
    if (!variant.enabled || variant.deliveryType !== "code") return [];
    // iTunes gift cards are sold in RUB. Never label a foreign-currency amount as rubles.
    if (product.currency !== "RUB") return [];
    const price = variant.price;
    if (!Number.isFinite(price) || price <= 0) return [];
    return [{ denomination, price, slug: product.slug }];
  }).sort((a, b) => a.denomination - b.denomination);
}
