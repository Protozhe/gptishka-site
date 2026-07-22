import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const plans = [
  { slug: "claude-max-5x", title: "CLAUDE 5X MAX", planTag: "max-5x", compactTag: "max5x", price: 10_999, sortOrder: 20 },
  { slug: "claude-max-20x", title: "CLAUDE 20X MAX", planTag: "max-20x", compactTag: "max20x", price: 22_299, sortOrder: 30 },
] as const;

async function main() {
  const template = await prisma.product.findUnique({
    where: { slug: "claude-pro" },
    include: { visualConfig: true },
  });
  const servicePage = await prisma.servicePage.findUnique({ where: { slug: "claude" } });

  if (!template) throw new Error("Claude Pro template product was not found");
  if (!servicePage) throw new Error("Claude service page was not found");

  const baseTags = template.tags.filter((tag) => !["pro", "max-5x", "max-20x", "max5x", "max20x"].includes(tag));

  const result = await prisma.$transaction(async (tx) => {
    const products = [];
    for (const plan of plans) {
      const description = `Автоматически\n1 аккаунт = 1 подписка\nСрок: 1 месяц`;
      const descriptionEn = `Automatically\n1 account = 1 subscription\nDuration: 1 month`;
      const modalDescription = `Автоматически\n1 аккаунт = 1 подписка\nВПН в подарок`;
      const modalDescriptionEn = `Automatically\n1 account = 1 subscription\nVPN as a gift`;
      const activationVariants = {
        withLogin: {
          price: plan.price,
          enabled: true,
          deliveryType: "manual_login",
          activationSiteUrl: "",
        },
        withoutLogin: {
          price: plan.price,
          enabled: false,
          deliveryType: "activation",
          activationSiteUrl: "",
        },
      } satisfies Prisma.InputJsonObject;
      const tags = Array.from(new Set([...baseTags, plan.planTag, plan.compactTag, "month:1"]));

      const product = await tx.product.upsert({
        where: { slug: plan.slug },
        create: {
          slug: plan.slug,
          title: plan.title,
          titleEn: plan.title,
          iconPngUrl: template.iconPngUrl,
          description,
          descriptionEn,
          modalDescription,
          modalDescriptionEn,
          price: plan.price,
          oldPrice: null,
          activationVariants,
          currency: template.currency,
          category: template.category,
          tags,
          stock: null,
          isActive: true,
          isArchived: false,
        },
        update: {
          title: plan.title,
          titleEn: plan.title,
          description,
          descriptionEn,
          modalDescription,
          modalDescriptionEn,
          price: plan.price,
          oldPrice: null,
          activationVariants,
          currency: template.currency,
          category: template.category,
          tags,
          stock: null,
          isActive: true,
          isArchived: false,
        },
      });

      const visual = template.visualConfig;
      await tx.productVisualConfig.upsert({
        where: { productId: product.id },
        create: {
          productId: product.id,
          cardTitle: `${plan.title}\nВПН В ПОДАРОК`,
          cardDescription: description,
          imageUrl: visual?.imageUrl || "",
          imageAlt: plan.title,
          hoverImageUrl: visual?.hoverImageUrl || "",
          hoverImageAlt: plan.title,
          backgroundType: visual?.backgroundType || "solid",
          backgroundColor: visual?.backgroundColor || "#111111",
          backgroundGradient: visual?.backgroundGradient || "",
          textColor: visual?.textColor || "",
          buttonText: visual?.buttonText || "Выбрать тариф",
          buttonStyle: visual?.buttonStyle || "primary",
          buttonBackground: visual?.buttonBackground || "",
          buttonTextColor: visual?.buttonTextColor || "",
          isVisible: true,
        },
        update: {
          cardTitle: `${plan.title}\nВПН В ПОДАРОК`,
          cardDescription: description,
          imageAlt: plan.title,
          hoverImageAlt: plan.title,
          isVisible: true,
        },
      });

      await tx.servicePageProductPlacement.upsert({
        where: { servicePageId_productId: { servicePageId: servicePage.id, productId: product.id } },
        create: { servicePageId: servicePage.id, productId: product.id, sortOrder: plan.sortOrder, isActive: true },
        update: { sortOrder: plan.sortOrder, isActive: true },
      });

      products.push({ slug: product.slug, title: product.title, price: String(product.price), sortOrder: plan.sortOrder });
    }
    return products;
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
