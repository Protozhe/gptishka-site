"use strict";
// A funds hold never owns a purchase or grants permission to repeat one.
const WAIT_MS = 15 * 60 * 1000;
async function init(j) {
  await j.run(`CREATE TABLE IF NOT EXISTS funds_holds(
    scope TEXT PRIMARY KEY,started_at INTEGER NOT NULL,deadline_at INTEGER NOT NULL,
    required_minor INTEGER NOT NULL,balance_minor INTEGER NOT NULL,resolved_at INTEGER)`);
  await j.run(`CREATE TABLE IF NOT EXISTS funds_hold_notices(
    scope TEXT NOT NULL,event TEXT NOT NULL,state TEXT NOT NULL,PRIMARY KEY(scope,event))`);
}
async function hold(j, scope, required, balance, now = Date.now()) {
  if (!/^website:[a-z0-9]{20,40}$/.test(scope) || !Number.isSafeInteger(required) || required <= 0
      || !Number.isSafeInteger(balance) || balance < 0 || balance >= required) throw Error('supplier_balance_unconfirmed');
  await init(j);
  await j.run(`INSERT INTO funds_holds VALUES(?,?,?,?,?,NULL) ON CONFLICT(scope) DO UPDATE SET
    required_minor=excluded.required_minor,balance_minor=excluded.balance_minor,resolved_at=NULL`,
    [scope, now, now + WAIT_MS, required, balance]);
  return j.get('SELECT * FROM funds_holds WHERE scope=?', [scope]);
}
function card(row, event, supplier = 'AISOU') {
  if (!['AISOU','AI-BUY'].includes(supplier)) throw Error('supplier_notice_invalid');
  const deadline = new Date(row.deadline_at).toLocaleString('ru-RU', {timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  const amount = n => (n / 100).toFixed(2);
  const resolved = event === 'resolved';
  return `${resolved ? '🟢' : event === 'expired' ? '🚨' : '⏳'} <b>${supplier} · ${resolved ? 'Баланс восстановлен' : event === 'expired' ? 'Ожидание больше 15 минут' : 'Нужно пополнить баланс'}</b>\n\n`
    + `🧾 Заказ: <code>${row.scope.slice(8)}</code>\n\n`
    + `Статус: <b>${resolved ? 'продолжаем обработку' : 'ожидает средств'}</b>\n\n`
    + (resolved ? '' : `<b>Баланс ${supplier}</b>\nНужно: ¥${amount(row.required_minor)}\nДоступно: ¥${amount(row.balance_minor)}\nНе хватает: <b>¥${amount(row.required_minor-row.balance_minor)}</b>\n\n`)
    + (resolved ? 'Средств достаточно. Обработчик продолжит исходный заказ с проверкой журнала покупок.'
      : event === 'expired' ? '15 минут истекли. Пополните баланс поставщика. Заказ сохранён и продолжится автоматически после пополнения.'
      : `На устранение причины: <b>15 минут</b>, до ${deadline} (Берлин). После пополнения продолжим автоматически.`)
    + '\n\nПовторно оплачивать заказ клиенту не нужно.';
}
async function deliver(j, row, event, send, supplier = 'AISOU') {
  if (!send) return;
  // Claim before sending; an ambiguous Telegram timeout is never blindly replayed.
  const claim = await j.run("INSERT OR IGNORE INTO funds_hold_notices VALUES(?,?,'sending')", [row.scope,event]);
  if (!claim.changes) return;
  let state = 'uncertain';
  try { if (await send(card(row,event,supplier),supplier==='AI-BUY'&&event!=='resolved'?{inline_keyboard:[[{text:'💰 Пополнить AI-BUY',url:'https://t.me/myadminiibot?start=aibuy'}]]}:undefined)) state = 'sent'; } catch { /* retain the delivery uncertainty */ }
  await j.run('UPDATE funds_hold_notices SET state=? WHERE scope=? AND event=?', [state,row.scope,event]);
}
async function notify(j, row, send, now = Date.now(), supplier = 'AISOU') {
  await deliver(j,row,now >= row.deadline_at ? 'expired' : 'initial',send,supplier);
}
async function resolve(j, scope, send, now = Date.now(), supplier = 'AISOU') {
  await init(j);
  const row = await j.get('SELECT * FROM funds_holds WHERE scope=? AND resolved_at IS NULL', [scope]);
  if (!row) return;
  await j.run('UPDATE funds_holds SET resolved_at=? WHERE scope=? AND resolved_at IS NULL', [now,scope]);
  await deliver(j,row,'resolved',send,supplier);
}
async function due(j, activeScopes, send, now = Date.now(), supplier = 'AISOU') {
  await init(j);
  // A provider outage must not prevent the deadline notification. The caller
  // independently checks paid, unfinished website orders before supplying IDs.
  for (const scope of activeScopes) {
    const row = await j.get('SELECT * FROM funds_holds WHERE scope=? AND resolved_at IS NULL AND deadline_at<=?', [scope,now]);
    if (row) await notify(j,row,send,now,supplier);
  }
}
module.exports = {WAIT_MS,hold,notify,resolve,card,due};
