import fs from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const plans = [
  { slug: "claude-5x-max", label: "Claude Max 5x" },
  { slug: "claude-20x-max", label: "Claude Max 20x" },
] as const;

const apply = process.argv.includes("--apply");
const backupPath = process.argv.find((arg) => arg.startsWith("--backup="))?.slice("--backup=".length);

async function main() {
  if (apply && (!backupPath || !path.isAbsolute(backupPath))) {
    throw new Error("--apply requires an absolute --backup=PATH for the original rows");
  }

  const products = await prisma.product.findMany({
    where: { slug: { in: plans.map((plan) => plan.slug) } },
    include: { visualConfig: true, servicePagePlacements: true },
  });
  if (products.length !== plans.length) {
    throw new Error("Both existing Claude Max products must be present; no new products will be created");
  }
  const servicePage = await prisma.servicePage.findUnique({ where: { slug: "claude" } });
  if (!servicePage) throw new Error("Claude service page is missing");

  const changes = plans.map((plan) => {
    const product = products.find((item) => item.slug === plan.slug);
    if (!product || !product.visualConfig) throw new Error(`${plan.slug} has no existing visual configuration`);
    if (!product.servicePagePlacements.some((item) => item.servicePageId === servicePage.id && item.isActive)) {
      throw new Error(`${plan.slug} has no active Claude page placement`);
    }
    const price = Number(product.price);
    if (!Number.isFinite(price) || price <= 0) throw new Error(`${plan.slug} has no valid admin price`);
    const variants = product.activationVariants && typeof product.activationVariants === "object" && !Array.isArray(product.activationVariants)
      ? product.activationVariants as Record<string, any>
      : {};
    const activationVariants = {
      ...variants,
      withLogin: {
        ...(variants.withLogin || {}),
        price,
        enabled: true,
        deliveryType: "manual_login",
      },
      withoutLogin: {
        ...(variants.withoutLogin || {}),
        enabled: false,
      },
    } as Prisma.InputJsonObject;
    const tags = Array.from(new Set([
      ...product.tags.filter((tag) => !["delivery:support_claude", "badge:new"].includes(tag)),
      "delivery:manual_login",
    ]));
    return {
      product,
      plan,
      price,
      activationVariants,
      tags,
      description: `Подключение ${plan.label} на ваш аккаунт со входом. После оплаты менеджер свяжется с вами и запросит данные для подключения.\nСрок: 1 месяц`,
      descriptionEn: `${plan.label} is connected to your account with sign-in. After payment, a manager will contact you to request the details needed for activation.\nDuration: 1 month`,
      modalDescription: "После оплаты менеджер свяжется с вами и запросит данные аккаунта Claude для подключения. В форме заказа логин и пароль не требуются.",
      modalDescriptionEn: "After payment, a manager will contact you to request your Claude account details for activation. No login or password is required in the order form.",
      cardDescription: "Со входом в аккаунт · менеджер свяжется после оплаты",
    };
  });

  const summary = changes.map(({ product, price }) => ({
    slug: product.slug,
    price,
    currentlyActive: product.isActive,
    plannedDelivery: "manual_login only",
  }));
  if (!apply) {
    console.log(JSON.stringify({ dryRun: true, summary }, null, 2));
    return;
  }

  fs.writeFileSync(backupPath!, JSON.stringify({
    createdAt: new Date().toISOString(),
    products,
  }, null, 2), { flag: "wx", mode: 0o600 });

  await prisma.$transaction(async (tx) => {
    for (const change of changes) {
      await tx.product.update({
        where: { slug: change.product.slug },
        data: {
          description: change.description,
          descriptionEn: change.descriptionEn,
          modalDescription: change.modalDescription,
          modalDescriptionEn: change.modalDescriptionEn,
          tags: change.tags,
          activationVariants: change.activationVariants,
          isActive: true,
          isArchived: false,
        },
      });
      await tx.productVisualConfig.update({
        where: { productId: change.product.id },
        data: { cardDescription: change.cardDescription, isVisible: true },
      });
    }
  });
  console.log(JSON.stringify({ applied: true, backupPath, summary }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
