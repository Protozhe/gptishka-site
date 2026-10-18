// Run from the release root. Default: read-only plan; --apply: create an inactive draft.
// --activate is blocked until the dedicated Zovocard Pro 500 worker is integrated.
require('dotenv').config({ path: 'apps/admin-backend/.env' });
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const contract = require('./fixtures/chatgpt-pro-25x.json');
const targets = ['chatgpt-pro-5x-1', 'chatgpt-pro-20x-1', contract.slug];
const apply = process.argv.includes('--apply');
const activate = process.argv.includes('--activate');
const rename = value => String(value || '')
  .replace(/Pro 5x(?! \/ Pro 100)/g, 'Pro 5x / Pro 100')
  .replace(/Pro 20x(?! \/ Pro 200)/g, 'Pro 20x / Pro 200');
async function main() {
  if (activate && !apply) throw new Error('--activate requires --apply');
  const before = await prisma.product.findMany({ where: { slug: { in: targets } }, include: { visualConfig: true, servicePagePlacements: true } });
  const page = await prisma.servicePage.findUniqueOrThrow({ where: { slug: 'chatgpt' } });
  const exists = before.find(item => item.slug === contract.slug);
  const plan = { slug: contract.slug, price: contract.price, currency: contract.currency, activationSiteUrl: contract.activationSiteUrl, fulfillmentReady: contract.fulfillmentReady, apply, activate, existingDraft: Boolean(exists) };
  if (!apply) { console.log(JSON.stringify(plan)); return; }
  if (activate && !contract.fulfillmentReady) throw new Error('Dedicated Zovocard Pro 25x / Pro 500 worker is not configured; activation refused');
  if (exists && Number(exists.price) !== contract.price) throw new Error('Existing Pro 500 price differs; review before changing it');
  if (exists && exists.isActive && !activate) throw new Error('Product is already active; refusing to turn it off');
  const backup = path.resolve(process.env.GPTISHKA_BACKUP_DIR || '/var/backups/gptishka', 'pro25-' + new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(backup, 'before.json'), JSON.stringify({ products: before, page }, null, 2), { mode: 0o600, flag: 'wx' });
  await prisma.$transaction(async tx => {
    for (const row of before.filter(row => row.slug !== contract.slug)) {
      const data = Object.fromEntries(['title', 'titleEn', 'description', 'descriptionEn', 'modalDescription', 'modalDescriptionEn'].map(key => [key, rename(row[key])]));
      await tx.product.update({ where: { id: row.id }, data });
      if (row.visualConfig) await tx.productVisualConfig.update({ where: { productId: row.id }, data: Object.fromEntries(['cardTitle', 'cardDescription', 'imageAlt', 'hoverImageAlt'].map(key => [key, rename(row.visualConfig[key])])) });
    }
    const data = {
      title: contract.title, titleEn: contract.titleEn,
      description: 'ChatGPT Pro 25x / Pro 500 на 1 месяц. Автоматическая активация через Zovocard.',
      descriptionEn: 'ChatGPT Pro 25x / Pro 500 for 1 month. Automatic activation through Zovocard.',
      modalDescription: 'Срок: 1 месяц\nАктивация на вашем аккаунте через Zovocard',
      modalDescriptionEn: 'Duration: 1 month\nActivation on your account through Zovocard',
      price: contract.price, currency: contract.currency, category: 'Подписки ИИ', tags: contract.tags,
      isActive: activate, isArchived: false,
      activationVariants: {
        withLogin: { enabled: false, price: contract.price, deliveryType: 'manual_login', activationSiteUrl: '' },
        withoutLogin: { enabled: true, price: contract.price, deliveryType: 'activation', activationSiteUrl: contract.activationSiteUrl },
      },
    };
    const product = await tx.product.upsert({ where: { slug: contract.slug }, create: { slug: contract.slug, ...data }, update: data });
    await tx.productVisualConfig.upsert({ where: { productId: product.id }, create: { productId: product.id, cardTitle: contract.title, buttonText: 'Выбрать тариф', isVisible: true }, update: { cardTitle: contract.title } });
    await tx.servicePageProductPlacement.upsert({ where: { servicePageId_productId: { servicePageId: page.id, productId: product.id } }, create: { servicePageId: page.id, productId: product.id, sortOrder: 50, isActive: true }, update: {} });
    await tx.servicePage.update({ where: { id: page.id }, data: { heroDescription: rename(page.heroDescription), constructorDescription: rename(page.constructorDescription) } });
  });
  console.log(JSON.stringify({ ...plan, backup }));
}
main().finally(() => prisma.$disconnect()).catch(error => { console.error(error.message); process.exitCode = 1; });
