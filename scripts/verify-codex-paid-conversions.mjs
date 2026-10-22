import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { codexConversion, conversionCsv, sendCodexConversion } from '../apps/admin-backend/scripts/codex-metrika-core.mjs';

const since = new Date('2026-10-23T00:00:00Z');
const now = new Date('2026-10-23T12:00:00Z');
const order = { id: 'test-order', status: 'PAID', source: 'site', createdAt: since, totalAmount: 1500, currency: 'RUB',
  items: [{ product: { slug: 'codex-250-link' } }],
  payments: [{ status: 'SUCCESS', provider: 'pally', processedAt: new Date('2026-10-23T11:00:00Z') }],
  orderDetails: { attribution: { lastTouch: { utm_campaign: '714510350', source: 'yandex', medium: 'cpc', yclid: '1234567890', capturedAt: '2026-10-23T10:00:00Z' } } } };
const event = codexConversion(order, { since, now });
assert(event);
assert.equal(conversionCsv(event), 'Yclid,Target,DateTime,Price,Currency\n1234567890,paid_codex_server,1792753200,1500.00,RUB\n');
for (const change of [{ status: 'PENDING' }, { status: 'REFUNDED' }, { source: 'telegram' }, { totalAmount: 0 }, { currency: 'USD' },
  { payments: [{ status: 'SUCCESS', provider: 'stub', processedAt: now }] }, { payments: [] },
  { items: [{ product: { slug: 'chatgpt-plus' } }] }, { items: [...order.items, { product: { slug: 'chatgpt-plus' } }] },
  { orderDetails: { attribution: { lastTouch: { ...order.orderDetails.attribution.lastTouch, utm_campaign: '714516200' } } } },
  { orderDetails: { attribution: { lastTouch: { ...order.orderDetails.attribution.lastTouch, capturedAt: '2026-09-01' } } } },
  { createdAt: new Date('2026-10-22') }]) assert.equal(codexConversion({ ...order, ...change }, { since, now }), null);
assert.throws(() => codexConversion(order, { since: new Date('invalid'), now }));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'codex-conversions-'));
try {
  let posts = 0;
  const fetchImpl = async (url, options) => {
    assert(url.startsWith('https://api-metrika.yandex.net/management/v1/counter/106969126/'));
    if (options.method === 'POST') {
      posts += 1;
      const csv = await options.body.get('file').text();
      assert(!/email|token|test-order|session|password/i.test(csv));
      return { ok: true, json: async () => ({ uploading: { id: 123 } }) };
    }
    return { ok: true, json: async () => ({ uploading: { status: 'PROCESSED' } }) };
  };
  const settings = { ledger: temporary, token: 'synthetic-secret', fetchImpl };
  assert.equal((await sendCodexConversion(event, settings)).status, 'SUBMITTED');
  assert.equal((await sendCodexConversion(event, settings)).status, 'PROCESSED');
  assert.equal((await sendCodexConversion(event, { ...settings, fetchImpl: async () => { throw new Error('Completed conversions must not be polled'); } })).status, 'PROCESSED');
  assert.equal(posts, 1);
  const uncertain = { ...event, key: 'a'.repeat(64) };
  assert.equal((await sendCodexConversion(uncertain, { ...settings, fetchImpl: async () => { throw new Error('timeout'); } })).status, 'UNCERTAIN');
  assert.equal((await sendCodexConversion(uncertain, settings)).status, 'UNCERTAIN');
  assert.equal(posts, 1);
  const concurrent = { ...event, key: 'b'.repeat(64) };
  await Promise.all([sendCodexConversion(concurrent, settings), sendCodexConversion(concurrent, settings)]);
  assert.equal(posts, 2);
  assert.equal(JSON.parse(await readFile(path.join(temporary, `${event.key}.json`), 'utf8')).status, 'PROCESSED');
} finally { await rm(temporary, { recursive: true, force: true }); }
console.log('Codex-only paid conversions: strict campaign/product/payment guards, privacy, durable deduplication, timeout and restart safety verified. No network requests or real orders.');
