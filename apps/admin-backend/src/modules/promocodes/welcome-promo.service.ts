import { DiscountType, PromoCodeKind } from "@prisma/client";
import { prisma } from "../../config/prisma";

export const WELCOME_PROMO_CODE = "WELCOME34";
export const WELCOME_PROMO_DISCOUNT_PERCENT = 34;

export async function ensureWelcomePromoCode(): Promise<void> {
  const existing = await prisma.promoCode.findUnique({
    where: { code: WELCOME_PROMO_CODE },
    select: { id: true },
  });

  if (existing) {
    return;
  }

  try {
    await prisma.promoCode.create({
      data: {
        code: WELCOME_PROMO_CODE,
        kind: PromoCodeKind.GENERAL,
        discountType: DiscountType.PERCENT,
        discountValue: WELCOME_PROMO_DISCOUNT_PERCENT,
        discountPercent: WELCOME_PROMO_DISCOUNT_PERCENT,
        ownerLabel: "new-users",
        campaign: "welcome",
        note: "Welcome promo for new users (first paid order)",
        isActive: true,
      },
    });

    console.info(`[promo] created default welcome promo code ${WELCOME_PROMO_CODE}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("unique constraint")) {
      return;
    }
    throw error;
  }
}
