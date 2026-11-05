const fs = require("node:fs");
const path = require("node:path");

const plans = [
  { slug: "gemini-pro-6m", months: 6, price: 2490 },
  { slug: "gemini-pro-12m", months: 12, price: 3490 },
  { slug: "gemini-pro-24m", months: 24, price: 4990 },
];
const slugs = ["gemini-pro-12", "gemini-pro-18", ...plans.map((plan) => plan.slug)];
const image = "/assets/img/services/gemini-card.webp?v=20260810-gemini1";
const hover = "/assets/img/services/gemini-card-hover.webp?v=20260810-gemini1";
const pageCopy = {
  heroDescription: "Gemini Pro на вашем Google-аккаунте. Выберите подписку на 6, 12 или 24 месяца.",
  constructorDescription: "После оплаты на странице заказа GPTishka укажите почту Google, пароль и ключ аутентификатора или 8-значный резервный код. Подписка активируется автоматически. Новый аккаунт — за доплату 200 ₽.",
  infoSections: [
    { title: "Перед покупкой", items: ["Нужен личный аккаунт Google без активной платной подписки и участия в семейной группе.", "Должна быть включена двухэтапная проверка. Для подключения нужны почта аккаунта, пароль и ключ приложения-аутентификатора или один 8-значный резервный код.", "Аккаунт должен соответствовать требованиям Google к возрасту и поддерживаемому региону."] },
    { title: "Как проходит подключение", ordered: true, items: ["Выберите срок подписки и оплатите заказ.", "Введите данные в защищённую форму на странице заказа GPTishka. Ссылка для самостоятельного погашения не выдаётся.", "Дождитесь результата подключения на этой же странице."] },
    { title: "Новый аккаунт", items: ["Добавьте новый аккаунт за 200 ₽ при выборе тарифа.", "После оплаты свяжитесь с менеджером и укажите номер заказа. Данные вашего текущего аккаунта не нужны.", "Подписка будет на новом аккаунте: перенести её на существующий аккаунт нельзя."] },
    { title: "После активации", items: ["Проверьте подписку в аккаунте Google.", "Смените пароль и замените переданный ключ аутентификатора или резервный код.", "Функции и лимиты регулирует Google. При вопросах обратитесь в поддержку с номером заказа."] },
  ],
  faqItems: [
    { question: "Что нужно для подключения?", answer: "Почта Google-аккаунта, пароль и ключ аутентификатора или один 8-значный резервный код. Вводите их только в защищённую форму на странице оплаченного заказа GPTishka." },
    { question: "Вы выдаёте ссылку активации?", answer: "Нет. Подключение и отслеживание статуса проходят на странице вашего заказа GPTishka." },
    { question: "Можно получить новый аккаунт?", answer: "Да. Выберите новый аккаунт за доплату 200 ₽ и после оплаты свяжитесь с менеджером. Данные вашего текущего аккаунта не нужны." },
    { question: "Какие сроки доступны?", answer: "6, 12 и 24 месяца. Итоговая стоимость отображается до оплаты." },
    { question: "Как обратиться в поддержку?", answer: "Нажмите ссылку поддержки и укажите номер заказа. Не отправляйте пароли в переписке." },
  ],
};

function productData(plan) {
  return {
    slug: plan.slug, title: `Gemini Pro — ${plan.months} ${plan.months === 24 ? "месяца" : "месяцев"}`,
    titleEn: `Gemini Pro — ${plan.months} months`, iconPngUrl: image,
    description: `Gemini Pro на ${plan.months} месяцев на вашем Google-аккаунте. Автоматическая активация после ввода данных на странице заказа GPTishka.`,
    descriptionEn: `Gemini Pro for ${plan.months} months on your Google Account. Automatic activation after entering your details on your GPTishka order page.`,
    modalDescription: "Для активации после оплаты нужны почта Google, пароль и ключ аутентификатора или один 8-значный резервный код. Ввод данных — на странице заказа GPTishka. Новый аккаунт — за доплату 200 ₽.",
    modalDescriptionEn: "After payment, activation requires your Google email, password and authenticator key or one 8-digit backup code. Enter these on your GPTishka order page. A new account costs an extra ₽200.",
    price: plan.price, oldPrice: null, currency: "RUB", category: "Подписки ИИ",
    tags: ["gemini", "google-ai", "pro", `month:${plan.months}`],
    activationVariants: {
      withLogin: { enabled: true, price: plan.price, deliveryType: "activation", activationSiteUrl: "https://aichongzhi.fun" },
      withoutLogin: { enabled: false, price: plan.price, deliveryType: "activation", activationSiteUrl: "https://aichongzhi.fun" },
    },
    isActive: true, isArchived: false,
  };
}

async function snapshot(db) {
  const products = await db.product.findMany({ where: { slug: { in: slugs } }, include: { visualConfig: true, servicePagePlacements: true }, orderBy: { slug: "asc" } });
  const page = await db.servicePage.findUnique({ where: { slug: "gemini" } });
  const card = await db.productShowcaseServiceCard.findUnique({ where: { serviceKey: "gemini" } });
  if (!page || page.serviceKey !== "gemini" || !card || !products.find((product) => product.slug === "gemini-pro-18")) {
    throw new Error("Expected existing Gemini page and legacy product; refusing a broad catalog update");
  }
  return { products, page, card };
}

async function apply(db) {
  const result = [];
  const page = await db.servicePage.update({ where: { slug: "gemini" }, data: pageCopy });
  for (const [index, plan] of plans.entries()) {
    const existing = await db.product.findUnique({ where: { slug: plan.slug } });
    if (existing && (existing.currency !== "RUB" || !existing.tags.includes("gemini"))) throw new Error("Existing Gemini slug belongs to another product");
    const product = await db.product.upsert({ where: { slug: plan.slug }, create: productData(plan), update: productData(plan) });
    await db.productVisualConfig.upsert({ where: { productId: product.id },
      create: { productId: product.id, cardTitle: product.title, cardDescription: `${plan.months} мес. · автоматическое подключение`, imageUrl: image, imageAlt: "Gemini Pro", hoverImageUrl: hover, hoverImageAlt: "Gemini Pro", backgroundType: "solid", backgroundColor: "#070b18", buttonText: "Выбрать тариф", buttonStyle: "primary", isVisible: true },
      update: { cardTitle: product.title, cardDescription: `${plan.months} мес. · автоматическое подключение` },
    });
    await db.servicePageProductPlacement.upsert({ where: { servicePageId_productId: { servicePageId: page.id, productId: product.id } },
      create: { servicePageId: page.id, productId: product.id, sortOrder: (index + 1) * 10, isActive: true, isPinned: false },
      update: { isActive: true },
    });
    result.push({ slug: plan.slug, price: String(product.price) });
  }
  // Keep the historical product, references, keys and paid-order activation links.
  await db.product.update({ where: { slug: "gemini-pro-18" }, data: { isActive: false, isArchived: true } });
  await db.productShowcaseServiceCard.update({ where: { serviceKey: "gemini" }, data: { planSummary: "Pro · 6, 12 или 24 месяца", priceText: "от 2 490 RUB" } });
  return result;
}

function writable(row, omit = []) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !["id", "createdAt", "updatedAt", ...omit].includes(key)));
}
async function rollback(db, backup, jsonNull) {
  if (backup.kind !== "gemini-plans-v1" || !backup.before?.page || backup.before.page.slug !== "gemini" ||
      backup.before.products.some((product) => !slugs.includes(product.slug))) throw new Error("Not a scoped Gemini backup");
  const old = backup.before.products.find((product) => product.slug === "gemini-pro-18");
  await db.product.update({ where: { id: old.id }, data: { isActive: old.isActive, isArchived: old.isArchived } });
  await db.servicePage.update({ where: { id: backup.before.page.id }, data: Object.fromEntries(Object.keys(pageCopy).map((key) => [key, backup.before.page[key] ?? jsonNull])) });
  await db.productShowcaseServiceCard.update({ where: { id: backup.before.card.id }, data: { planSummary: backup.before.card.planSummary, priceText: backup.before.card.priceText } });
  for (const plan of plans) {
    const current = await db.product.findUnique({ where: { slug: plan.slug } });
    if (!current) continue;
    const before = backup.before.products.find((product) => product.slug === plan.slug);
    if (!before) {
      await db.product.update({ where: { id: current.id }, data: { isActive: false, isArchived: true } });
      await db.servicePageProductPlacement.updateMany({ where: { servicePageId: backup.before.page.id, productId: current.id }, data: { isActive: false } });
    } else {
      const data = writable(before, ["visualConfig", "servicePagePlacements"]);
      data.activationVariants ??= jsonNull;
      await db.product.update({ where: { id: before.id }, data });
      if (before.visualConfig) await db.productVisualConfig.update({ where: { productId: before.id }, data: writable(before.visualConfig, ["productId"]) });
      const placement = before.servicePagePlacements.find((item) => item.servicePageId === backup.before.page.id);
      await db.servicePageProductPlacement.updateMany({
        where: { servicePageId: backup.before.page.id, productId: before.id },
        data: placement ? { sortOrder: placement.sortOrder, isActive: placement.isActive, isPinned: placement.isPinned } : { isActive: false },
      });
    }
  }
}

async function main() {
  if (process.argv.includes("--print")) { console.log(JSON.stringify({ plans: plans.map(productData), pageCopy }, null, 2)); return; }
  const backupPath = process.argv.find((arg) => arg.startsWith("--backup="))?.slice(9);
  const rollbackPath = process.argv.find((arg) => arg.startsWith("--rollback="))?.slice(11);
  const applyRequested = process.argv.includes("--apply");
  if (applyRequested && (!backupPath || !path.isAbsolute(backupPath))) throw new Error("--apply requires an absolute --backup=PATH");
  if (rollbackPath && (applyRequested || !path.isAbsolute(rollbackPath))) throw new Error("Use only --rollback=ABSOLUTE_PATH");
  const { PrismaClient, Prisma } = require("@prisma/client"); const db = new PrismaClient();
  try {
    if (rollbackPath) {
      const backup = JSON.parse(fs.readFileSync(rollbackPath, "utf8"));
      await db.$transaction((tx) => rollback(tx, backup, Prisma.JsonNull), { isolationLevel: "Serializable" });
      console.log(JSON.stringify({ restored: true })); return;
    }
    if (!applyRequested) { const before = await snapshot(db); console.log(JSON.stringify({ mode: "plan", existing: before.products.map(({ slug, price, isActive }) => ({ slug, price, isActive })), plans, newAccountSurcharge: 200 })); return; }
    const result = await db.$transaction(async (tx) => {
      const before = await snapshot(tx);
      fs.writeFileSync(backupPath, JSON.stringify({ kind: "gemini-plans-v1", createdAt: new Date().toISOString(), before }, null, 2), { flag: "wx", mode: 0o600 });
      return apply(tx);
    }, { isolationLevel: "Serializable", timeout: 30_000 });
    console.log(JSON.stringify({ mode: "apply", backupPath, result }));
  } finally { await db.$disconnect(); }
}
if (require.main === module) main().catch(() => { console.error("Gemini catalog operation failed; transaction rolled back"); process.exitCode = 1; });
module.exports = { plans, productData, pageCopy, apply, rollback };
