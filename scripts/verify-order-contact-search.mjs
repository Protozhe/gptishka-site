import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const file='apps/admin-backend/src/modules/orders/order-contact-search.ts';
const module={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports});
const {orderContactSearch}=module.exports;
const filters=JSON.parse(JSON.stringify(orderContactSearch('123456789')));
assert(filters.some(x=>x.orderDetails?.path.join('.')==='contact.telegram'&&x.orderDetails.string_contains==='123456789'));
assert(filters.some(x=>x.orderDetails?.path.join('.')==='contact.telegramId'&&x.orderDetails.equals===123456789));
assert(filters.some(x=>x.payments?.some.payload.path.join('.')==='orderDetails.contact.telegramUserId'));
for(const q of ['@fixture_user','https://t.me/fixture_user/','fixture_user']) {
  assert(orderContactSearch(q).every(x=>(x.orderDetails?.string_contains??x.payments?.some.payload.string_contains??x.telegramUsername?.contains)==='fixture_user'));
}
assert.equal(orderContactSearch('  ').length,0);
assert.equal(orderContactSearch('9999999999999999999').some(x=>x.orderDetails?.equals!==undefined),false);
for(const filter of filters) {
  const path=filter.orderDetails?.path||filter.payments?.some.payload.path;
  if(path)assert.match(path.join('.'),/^(orderDetails\.)?contact\.telegram(Username|UserId|Id)?$/);
}
const repo=fs.readFileSync('apps/admin-backend/src/modules/orders/orders.repository.ts','utf8');
assert.match(repo,/\.\.\.orderContactSearch\(searchQuery\)/);
assert.match(repo,/prisma\.order\.count\(\{ where \}\)/);
console.log('Order contact search: JSON string/numeric IDs, payment fallback, Telegram links, scoped fields and shared pagination filter passed.');
