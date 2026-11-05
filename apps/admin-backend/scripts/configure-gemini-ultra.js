const fs = require("node:fs");
const path = require("node:path");

const plans = [
  { slug: "gemini-ultra-ready-1m", account: "ready", price: 14990 },
  { slug: "gemini-ultra-own-1m", account: "own", price: 16990 },
];
const image = "/assets/img/services/gemini-card.webp?v=20260810-gemini1";
const hover = "/assets/img/services/gemini-card-hover.webp?v=20260810-gemini1";
const pageCopy = {
  title: "Gemini Pro и Ultra", titleEn: "Gemini Pro and Ultra", heroTitle: "Gemini", constructorTitle: "Gemini",
  heroDescription: "Pro на 6, 12 или 24 месяца. Ultra 20× на 1 месяц — готовый аккаунт или подключение на свой.",
  constructorDescription: "Gemini Pro: работа с текстами, файлами и изображениями. После оплаты введите данные Google-аккаунта на защищённой странице заказа. Новый аккаунт — за доплату 200 ₽.",
  infoSections: [
    { title: "Gemini Pro", items: ["Подписка на 6, 12 или 24 месяца на вашем Google-аккаунте.", "После оплаты заполните защищённую форму: почта, пароль и ключ аутентификатора или один 8-значный резервный код.", "Подключение автоматическое. Статус и результат — на странице заказа."] },
    { title: "Gemini Ultra 20×", items: ["Подписка на 1 месяц с расширенными лимитами Gemini и Antigravity, инструментами Flow.", "Выберите готовый аккаунт или подключение на свой. После оплаты свяжитесь с менеджером по кнопке на странице заказа.", "Готовый аккаунт выдаётся отдельно: подписку нельзя перенести на другой аккаунт. Проверьте вход в день получения."] },
    { title: "Требования к своему аккаунту", items: ["Личный аккаунт Google без действующей платной подписки и участия в семейной группе.", "Аккаунт должен соответствовать требованиям Google к возрасту и региону. Дождитесь окончания действующей подписки.", "Новый аккаунт для Pro стоит дополнительно 200 ₽. Для Ultra готовый аккаунт — отдельный вариант с итоговой ценой."] },
    { title: "После подключения", items: ["Проверьте тариф и срок подписки в аккаунте Google.", "Смените пароль и замените переданные данные двухэтапной проверки.", "Google определяет доступные функции и лимиты. По вопросам заказа обратитесь в поддержку с его номером."] },
  ],
  faqItems: [
    { question: "Когда выполняется заказ?", answer: "Мы обрабатываем заказы ежедневно с 08:00 до 20:00 по МСК. Заказы с автоматическим подключением выполняются 24/7. Среднее время ожидания — от 5 минут до 2 часов после оплаты." },
    { question: "Чем отличаются Pro и Ultra?", answer: "Pro доступен на 6, 12 или 24 месяца. Ultra 20× — на 1 месяц, с расширенными лимитами Gemini и Antigravity и инструментами Flow. Точные возможности и лимиты отображаются в аккаунте Google." },
    { question: "Как подключается Pro?", answer: "После оплаты введите почту, пароль и ключ аутентификатора или один 8-значный резервный код в защищённую форму на странице заказа GPTishka. Там же появится результат. Ссылка для самостоятельного погашения не выдаётся." },
    { question: "Как получить Ultra?", answer: "Выберите готовый аккаунт или подключение на свой и оплатите заказ. На странице заказа нажмите «Связаться с менеджером» и сообщите номер заказа. Ultra подключает менеджер; автоматическая форма Pro для этого тарифа не используется." },
    { question: "Можно получить новый аккаунт?", answer: "Для Pro отметьте «Нужен новый аккаунт»: доплата 200 ₽. Для Ultra выберите «Готовый аккаунт» — его стоимость уже включена в цену. После оплаты свяжитесь с менеджером." },
    { question: "Что делать после активации?", answer: "Проверьте подписку, смените пароль и замените переданные данные двухэтапной проверки. По вопросам выполнения заказа, гарантии или возврата обратитесь в поддержку с номером заказа." },
  ],
};

function productData(plan) {
  const ready = plan.account === "ready";
  const label = ready ? "готовый аккаунт" : "на свой аккаунт";
  const labelEn = ready ? "ready account" : "your account";
  return {
    slug: plan.slug, title: `Gemini Ultra 20× — ${label}, 1 месяц`, titleEn: `Gemini Ultra 20× — ${labelEn}, 1 month`, iconPngUrl: image,
    description: `Gemini Ultra 20× на 1 месяц: ${label}. Расширенные лимиты Gemini и Antigravity, инструменты Flow. Подключение через менеджера после оплаты.`,
    descriptionEn: `Gemini Ultra 20× for 1 month: ${labelEn}. Higher Gemini and Antigravity limits, and Flow tools. A manager completes your order after payment.`,
    modalDescription: ready ? "Отдельный Google-аккаунт с Ultra 20× на 1 месяц. После оплаты свяжитесь с менеджером по кнопке на странице заказа. Проверьте вход в день получения." : "Ultra 20× на 1 месяц на вашем Google-аккаунте. Нужен личный аккаунт без платной подписки и семейной группы. После оплаты свяжитесь с менеджером на странице заказа, чтобы согласовать подключение.",
    modalDescriptionEn: ready ? "A separate Google Account with Ultra 20× for 1 month. After payment, use the manager button on your order page. Check the login on the day you receive it." : "Ultra 20× for 1 month on your Google Account. Use a personal account without an active paid subscription or family group. After payment, contact the manager from your order page to arrange activation.",
    price: plan.price, oldPrice: null, currency: "RUB", category: "Подписки ИИ", tags: ["gemini", "google-ai", "ultra", "month:1", `account:${plan.account}`],
    activationVariants: {
      withLogin: { enabled: !ready, price: plan.price, deliveryType: "manual_login", activationSiteUrl: null },
      withoutLogin: { enabled: ready, price: plan.price, deliveryType: "manual_login", activationSiteUrl: null },
    }, isActive: true, isArchived: false,
  };
}

async function snapshot(db) {
  const page = await db.servicePage.findUnique({ where: { slug: "gemini" } });
  const card = await db.productShowcaseServiceCard.findUnique({ where: { serviceKey: "gemini" } });
  if (!page || page.serviceKey !== "gemini" || !card) throw Error("Expected the existing Gemini page and card");
  const products = await db.product.findMany({ where: { slug: { in: plans.map(p => p.slug) } }, include: { visualConfig: true, servicePagePlacements: true } });
  if (products.some(p => p.currency !== "RUB" || !p.tags.includes("gemini"))) throw Error("SKU collision");
  return { page, card, products };
}
async function apply(db) {
  const page = await db.servicePage.update({ where: { slug: "gemini" }, data: pageCopy });
  const result = [];
  for (const [index, plan] of plans.entries()) {
    const data = productData(plan);
    // Once created, admin prices remain authoritative on subsequent runs.
    const { price, activationVariants, isActive, isArchived, ...copy } = data;
    const product = await db.product.upsert({ where: { slug: plan.slug }, create: data, update: copy });
    await db.productVisualConfig.upsert({ where: { productId: product.id },
      create: { productId: product.id, cardTitle: product.title, cardDescription: "Ultra 20× · 1 месяц", imageUrl: image, imageAlt: "Gemini Ultra", hoverImageUrl: hover, hoverImageAlt: "Gemini Ultra", backgroundType: "solid", backgroundColor: "#070b18", buttonText: "Выбрать тариф", buttonStyle: "primary", isVisible: true },
      update: { cardTitle: product.title, cardDescription: "Ultra 20× · 1 месяц" } });
    await db.servicePageProductPlacement.upsert({ where: { servicePageId_productId: { servicePageId: page.id, productId: product.id } },
      create: { servicePageId: page.id, productId: product.id, sortOrder: 40 + index * 10, isActive: true, isPinned: false }, update: {} });
    result.push({ slug: product.slug, price: String(product.price) });
  }
  await db.productShowcaseServiceCard.update({ where: { serviceKey: "gemini" }, data: { planSummary: "Pro · 6/12/24 мес. · Ultra 20× · 1 месяц" } });
  return result;
}
const writable = (row, omit = []) => Object.fromEntries(Object.entries(row).filter(([key]) => !["id", "createdAt", "updatedAt", ...omit].includes(key)));
async function rollback(db, backup, jsonNull) {
  if (backup.kind !== "gemini-ultra-v1" || backup.before?.page?.slug !== "gemini" || !Array.isArray(backup.before.products) || backup.before.products.some(p => !plans.some(plan => plan.slug === p.slug))) throw Error("Not a scoped Gemini Ultra backup");
  await db.servicePage.update({ where: { id: backup.before.page.id }, data: Object.fromEntries(Object.keys(pageCopy).map(key => [key, backup.before.page[key] ?? jsonNull])) });
  await db.productShowcaseServiceCard.update({ where: { id: backup.before.card.id }, data: { planSummary: backup.before.card.planSummary } });
  for (const plan of plans) {
    const current = await db.product.findUnique({ where: { slug: plan.slug } });
    if (!current) continue;
    const before = backup.before.products.find(p => p.slug === plan.slug);
    if (!before) {
      await db.product.update({ where: { id: current.id }, data: { isActive: false, isArchived: true } });
      await db.servicePageProductPlacement.updateMany({ where: { servicePageId: backup.before.page.id, productId: current.id }, data: { isActive: false } });
    } else {
      const data = writable(before, ["visualConfig", "servicePagePlacements"]); data.activationVariants ??= jsonNull;
      await db.product.update({ where: { id: before.id }, data });
      if (before.visualConfig) await db.productVisualConfig.update({ where: { productId: before.id }, data: writable(before.visualConfig, ["productId"]) });
    }
  }
}
async function main() {
  if (process.argv.includes("--print")) { console.log(JSON.stringify({ plans: plans.map(productData), pageCopy }, null, 2)); return; }
  const applyRequested = process.argv.includes("--apply");
  const backupPath = process.argv.find(a => a.startsWith("--backup="))?.slice(9);
  const rollbackPath = process.argv.find(a => a.startsWith("--rollback="))?.slice(11);
  if (applyRequested && (!backupPath || !path.isAbsolute(backupPath))) throw Error("--apply requires an absolute backup path");
  if (rollbackPath && (applyRequested || !path.isAbsolute(rollbackPath))) throw Error("Use only --rollback=ABSOLUTE_PATH");
  const { PrismaClient, Prisma } = require("@prisma/client"); const db = new PrismaClient();
  try {
    if (rollbackPath) { await db.$transaction(tx => rollback(tx, JSON.parse(fs.readFileSync(rollbackPath, "utf8")), Prisma.JsonNull), { isolationLevel: "Serializable" }); console.log(JSON.stringify({ restored: true })); return; }
    if (!applyRequested) { const before = await snapshot(db); console.log(JSON.stringify({ mode: "plan", existingUltra: before.products.map(({ slug, price }) => ({ slug, price })), plans, proPricesUntouched: true })); return; }
    const result = await db.$transaction(async tx => {
      const before = await snapshot(tx);
      fs.writeFileSync(backupPath, JSON.stringify({ kind: "gemini-ultra-v1", createdAt: new Date().toISOString(), before }, null, 2), { flag: "wx", mode: 0o600 });
      return apply(tx);
    }, { isolationLevel: "Serializable", timeout: 30000 });
    console.log(JSON.stringify({ mode: "apply", backupPath, result }));
  } finally { await db.$disconnect(); }
}
if (require.main === module) main().catch(() => { console.error("Gemini Ultra catalog operation failed; transaction rolled back"); process.exitCode = 1; });
module.exports = { plans, productData, pageCopy, apply, rollback };
