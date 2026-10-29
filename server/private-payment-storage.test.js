const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { isPrivatePaymentStoragePath, blockPrivatePaymentStorage } = require('./private-payment-storage');

test('private payment files cannot bypass the guard with encoding or normalized paths', () => {
  for (const value of [
    '/payment/webmoney/storage/orders.json', '/payment/webmoney/storage/',
    '/payment/webmoney/private/settings.json', '/payment/webmoney/backup/orders.json',
    '/payment/webmoney/backups/orders.json', '/PAYMENT/WEBMONEY/STORAGE/orders.json',
    '/payment/webmoney/%73torage/orders.json', '/payment%2Fwebmoney%2Fstorage/orders.json',
    '/payment/webmoney/%2573torage/orders.json', '/payment/webmoney/unused/../storage/orders.json',
    '/payment\\webmoney\\storage\\orders.json',
  ]) assert.equal(isPrivatePaymentStoragePath(value), true, value);
});

test('public payment handlers and unrelated storefront pages remain available', () => {
  for (const value of [
    '/payment/webmoney/create.php', '/payment/webmoney/result.php',
    '/payment/webmoney/success.php', '/payment/webmoney/fail.php',
    '/api/payments/pally/callback', '/api/payments/lava/callback',
    '/payment/webmoney/storage-guide.html', '/assets/payment/storage-icon.svg',
    '/catalog/chatgpt/', '/',
  ]) assert.equal(isPrivatePaymentStoragePath(value), false, value);
});

test('HTTP guard blocks the stored fixture while preserving merchant handlers', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'payment-storage-fixture-'));
  let server;
  try {
    const storage = path.join(root, 'payment/webmoney/storage');
    await fs.mkdir(storage, { recursive: true });
    await fs.writeFile(path.join(storage, 'orders.json'), JSON.stringify({ fixtureSecret: 'private-fixture-order' }));
    const app = express();
    app.use(blockPrivatePaymentStorage);
    app.get('/payment/webmoney/result.php', (_req, res) => res.send('fixture-merchant-handler'));
    app.use(express.static(root));
    server = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const suffix of ['/payment/webmoney/storage/orders.json', '/payment/webmoney/%73torage/orders.json']) {
      const response = await fetch(base + suffix);
      assert.equal(response.status, 404);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.doesNotMatch(await response.text(), /private-fixture-order/);
    }
    const handler = await fetch(base + '/payment/webmoney/result.php');
    assert.equal(handler.status, 200);
    assert.equal(await handler.text(), 'fixture-merchant-handler');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    assert.equal(path.dirname(root), os.tmpdir());
    assert.ok(path.basename(root).startsWith('payment-storage-fixture-'));
    await fs.rm(root, { recursive: true, force: true });
  }
});
