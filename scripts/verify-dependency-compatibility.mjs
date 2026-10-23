import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const backend = createRequire(new URL('../apps/admin-backend/package.json', import.meta.url));
const ui = createRequire(new URL('../apps/admin-ui/package.json', import.meta.url));
const bcrypt = backend('bcrypt');
const nodemailer = backend('nodemailer');
const sqlite = require('sqlite3');
const { createMemoryRouter } = ui('react-router-dom');
const { defineConfig } = backend('@prisma/config');

// Existing bcrypt records retain the same 2b format and callback/Promise API.
const password = 'fixture-only-compatibility-Ж';
const hash = await bcrypt.hash(password, 4);
assert.match(hash, /^\$2[ab]\$/);
assert.equal(await bcrypt.compare(password, hash), true);
assert.equal(await bcrypt.compare(password + 'wrong', hash), false);
await new Promise((resolve, reject) => bcrypt.compare(password, hash, (e, ok) => e ? reject(e) : (assert.equal(ok, true), resolve())));

// Exercise MIME construction without a real SMTP connection or recipients.
const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
const mail = await transport.sendMail({ from: 'shop@fixture.invalid', to: 'owner@fixture.invalid', subject: 'Чек заказа', text: 'Заказ оплачен', html: '<p>Заказ оплачен</p>' });
assert.ok(Buffer.isBuffer(mail.message));
assert.match(mail.message.toString(), /Content-Type: multipart\/alternative/);
assert.deepEqual(mail.envelope.to, ['owner@fixture.invalid']);

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gptishka-sqlite-compat-'));
let db;
try {
  db = await new Promise((resolve, reject) => { const d = new sqlite.Database(path.join(directory, 'test.db'), e => e ? reject(e) : resolve(d)); });
  const exec = sql => new Promise((resolve, reject) => db.exec(sql, e => e ? reject(e) : resolve()));
  await exec('PRAGMA journal_mode=WAL; CREATE TABLE fixtures(id INTEGER PRIMARY KEY, value TEXT); BEGIN;');
  await new Promise((resolve, reject) => db.run('INSERT INTO fixtures(value) VALUES(?)', ['Клиент ✓'], function (e) { if (e) return reject(e); assert.equal(this.changes, 1); resolve(); }));
  await exec('COMMIT');
  const row = await new Promise((resolve, reject) => db.get('SELECT value FROM fixtures WHERE id=?', [1], (e, row) => e ? reject(e) : resolve(row)));
  assert.equal(row.value, 'Клиент ✓');
  await exec("BEGIN; UPDATE fixtures SET value='rollback'; ROLLBACK;");
  assert.equal((await new Promise((resolve, reject) => db.get('SELECT value FROM fixtures', (e, row) => e ? reject(e) : resolve(row)))).value, 'Клиент ✓');
} finally {
  if (db) await new Promise((resolve, reject) => db.close(e => e ? reject(e) : resolve()));
  await fs.rm(directory, { recursive: true, force: true });
}
const router = createMemoryRouter([{ path: '/admin/orders/:id', loader: ({ params }) => params.id }], { initialEntries: ['/admin/orders/fixture-order'] });
await new Promise(resolve => { if (router.state.initialized) return resolve(); const off = router.subscribe(state => { if (state.initialized) { off(); resolve(); } }); });
assert.equal(Object.values(router.state.loaderData)[0], 'fixture-order');
router.dispose();
assert.equal(defineConfig({ schema: 'prisma/schema.prisma' }).schema, 'prisma/schema.prisma');
console.log('Dependency compatibility verified: bcrypt, MIME, SQLite WAL/transactions, router, Prisma config.');
