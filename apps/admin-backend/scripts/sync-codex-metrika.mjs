import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { CODEX_SLUGS, codexConversion, sendCodexConversion } from './codex-metrika-core.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
dotenv.config({ path: path.join(root, 'apps/admin-backend/.env') });
const config = dotenv.config({ path: process.env.CODEX_METRIKA_CONFIG || '/etc/gptishka/codex-metrika.env', override: false }).parsed || {};
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--upload')) throw new Error('Only --upload is supported; default is read-only dry run');
const upload = args.includes('--upload');
const since = new Date(config.CODEX_METRIKA_START_AT || '');
const ledger = config.CODEX_METRIKA_LEDGER || '';
const token = config.CODEX_METRIKA_OAUTH_TOKEN || '';
if (!Number.isFinite(+since)) throw new Error('CODEX_METRIKA_START_AT is required; historical orders are never uploaded by default');
if (upload && (!token || ledger !== '/var/lib/gptishka-runtime/codex-metrika')) throw new Error('Codex collector secret/ledger configuration missing');
const prisma = new PrismaClient();
try {
  const now = new Date();
  const cutoff = new Date(Math.max(+since, +now - 20 * 86400000));
  const where = {
    status: 'PAID', source: 'site', createdAt: { gte: cutoff },
    items: { some: { product: { slug: { in: CODEX_SLUGS } } }, every: { product: { slug: { in: CODEX_SLUGS } } } },
    payments: { some: { status: 'SUCCESS', provider: { in: ['enot', 'lava', 'pally'] }, processedAt: { gte: cutoff } } },
  };
  // Scan in bounded pages. Database reads only; no order/payment mutations.
  let cursor;
  const totals = { examined: 0, eligible: 0, outcomes: {}, upload };
  do {
    const orders = await prisma.order.findMany({ where, orderBy: { id: 'asc' }, take: 250,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, source: true, status: true, createdAt: true, totalAmount: true, currency: true, orderDetails: true,
        items: { select: { product: { select: { slug: true } } } },
        payments: { select: { status: true, provider: true, processedAt: true } } },
    });
    for (const order of orders) {
      totals.examined += 1;
      const event = codexConversion(order, { since, now });
      if (!event) continue;
      totals.eligible += 1;
      if (upload) {
        // Re-read immediately before external submission to reject refunds/cancellations.
        const current = await prisma.order.findUnique({ where: { id: order.id },
          include: { items: { include: { product: true } }, payments: true } });
        const confirmed = current && codexConversion(current, { since, now: new Date() });
        if (!confirmed) continue;
        const result = await sendCodexConversion(confirmed, { ledger, token });
        totals.outcomes[result.status] = (totals.outcomes[result.status] || 0) + 1;
      }
    }
    cursor = orders.length === 250 ? orders.at(-1).id : null;
  } while (cursor);
  console.log(JSON.stringify(totals));
  if (Object.keys(totals.outcomes).some(status => ['UNCERTAIN', 'SENDING', 'REJECTED', 'LINKAGE_FAILURE'].includes(status))) process.exitCode = 2;
} finally { await prisma.$disconnect(); }
