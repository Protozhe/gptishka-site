const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const products = [
  { denomination: 2, price: 300 },
  { denomination: 5, price: 750 },
  { denomination: 10, price: 1500 },
  { denomination: 15, price: 2000 },
  { denomination: 30, price: 3800 },
  { denomination: 50, price: 5500 },
];

async function main() {
  const result = [];
  for (const item of products) {
    const slug = `itunes-us-${item.denomination}`;
    const title = `iTunes / App Store ${item.denomination} $ (США)`;
    const titleEn = `iTunes / App Store $${item.denomination} (US)`;
    const description = `Подарочная карта Apple ID региона США номиналом ${item.denomination} $. Автоматическая выдача кода после оплаты.`;
    const descriptionEn = `US Apple ID gift card with a $${item.denomination} value. Automatic code delivery after payment.`;
    const tags = [
      "itunes",
      "app-store",
      "apple-gift-card",
      "region:us",
      `denomination:${item.denomination}`,
      "delivery:code",
      "internal:checkout",
    ];
    const product = await prisma.product.upsert({
      where: { slug },
      create: {
        slug,
        title,
        titleEn,
        iconPngUrl: "",
        description,
        descriptionEn,
        modalDescription: description,
        modalDescriptionEn: descriptionEn,
        price: item.price,
        oldPrice: null,
        activationVariants: null,
        currency: "RUB",
        category: "Пополнения",
        tags,
        stock: null,
        isActive: true,
        isArchived: false,
      },
      update: {
        title,
        titleEn,
        description,
        descriptionEn,
        modalDescription: description,
        modalDescriptionEn: descriptionEn,
        price: item.price,
        oldPrice: null,
        activationVariants: null,
        currency: "RUB",
        category: "Пополнения",
        tags,
        stock: null,
        isActive: true,
        isArchived: false,
      },
      select: { id: true, slug: true, title: true, price: true, currency: true },
    });
    result.push({ ...product, price: String(product.price) });
  }
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
