import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import path from 'node:path';

export const CAMPAIGN = '714510350';
export const COUNTER = '106969126';
export const TARGET = 'paid_codex_server';
export const CODEX_SLUGS = ['codex-250-link', 'codex-500-link', 'codex-1000-link', 'codex-250', 'codex-500', 'codex-1000'];
const DAY = 86400000;
const API = `https://api-metrika.yandex.net/management/v1/counter/${COUNTER}/offline_conversions`;

export function codexConversion(order, { since, now = new Date() }) {
  if (!Number.isFinite(+since) || +since > +now || +since < +new Date('2026-10-23T00:00:00Z')) throw new Error('Explicit prospective Codex start time required');
  if (order.status !== 'PAID' || order.source !== 'site' || !order.id || !Number.isFinite(+new Date(order.createdAt))
    || +new Date(order.createdAt) < +since || +new Date(order.createdAt) > +now) return null;
  if (!order.items?.length || order.items.some(item => !CODEX_SLUGS.includes(item.product?.slug))) return null;
  const payments = (order.payments || []).filter(payment => payment.status === 'SUCCESS'
    && ['enot', 'lava', 'pally'].includes(String(payment.provider).toLowerCase())
    && Number.isFinite(+new Date(payment.processedAt)) && +new Date(payment.processedAt) >= +since
    && +new Date(payment.processedAt) >= +now - 20 * DAY && +new Date(payment.processedAt) <= +now);
  payments.sort((a, b) => +new Date(a.processedAt) - +new Date(b.processedAt));
  const paidAt = payments[0]?.processedAt;
  if (!paidAt || !(Number(order.totalAmount) > 0) || !Number.isFinite(Number(order.totalAmount)) || order.currency !== 'RUB') return null;
  const attribution = order.orderDetails?.attribution;
  // Never borrow a click identifier from another campaign's touch.
  const touch = [attribution?.lastTouch, attribution?.firstTouch].find(t => t?.utm_campaign === CAMPAIGN
    && ['yandex'].includes(t.source || t.utm_source) && (t.medium || t.utm_medium) === 'cpc'
    && /^\d{1,80}$/.test(t.yclid || '') && Number.isFinite(+new Date(t.capturedAt))
    && +new Date(t.capturedAt) >= +now - 20 * DAY && +new Date(t.capturedAt) <= +new Date(paidAt));
  if (!touch) return null;
  return {
    key: createHash('sha256').update(`${CAMPAIGN}:${order.id}`).digest('hex'),
    yclid: touch.yclid, paidAt: Math.floor(+new Date(paidAt) / 1000),
    price: Number(order.totalAmount).toFixed(2), currency: 'RUB',
  };
}

export function conversionCsv(event) {
  return `Yclid,Target,DateTime,Price,Currency\n${event.yclid},${TARGET},${event.paidAt},${event.price},RUB\n`;
}

async function saveState(file, state) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(state)); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, file);
}

export async function sendCodexConversion(event, { ledger, token, fetchImpl = fetch }) {
  if (!path.isAbsolute(ledger) || !token || !/^[a-f0-9]{64}$/.test(event.key)) throw new Error('Codex collector configuration missing');
  await mkdir(ledger, { recursive: true, mode: 0o700 });
  const file = path.join(ledger, `${event.key}.json`);
  let handle;
  try { handle = await open(file, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let saved;
    try { saved = JSON.parse(await readFile(file, 'utf8')); }
    catch { return { status: 'SENDING', duplicatePrevented: true }; }
    if (['PROCESSED', 'LINKAGE_FAILURE'].includes(saved.status)) return { status: saved.status, duplicatePrevented: true };
    // A crash/timeout after POST may mean accepted data. Never blindly resend.
    if (!saved.uploadId) return { status: saved.status, duplicatePrevented: true };
    const response = await fetchImpl(`${API}/uploading/${saved.uploadId}`, {
      headers: { Authorization: `OAuth ${token}` }, signal: AbortSignal.timeout(20000), redirect: 'error',
    });
    if (!response.ok) return { status: saved.status, statusCheckFailed: response.status };
    const payload = await response.json();
    const status = payload.uploading?.status;
    if (typeof status !== 'string') return { status: saved.status, statusCheckFailed: true };
    await saveState(file, { ...saved, status, checkedAt: new Date().toISOString() });
    return { status, duplicatePrevented: true };
  }
  const pending = { version: 1, campaign: CAMPAIGN, target: TARGET, status: 'SENDING', createdAt: new Date().toISOString() };
  try { await handle.writeFile(JSON.stringify(pending)); await handle.sync(); } finally { await handle.close(); }
  const form = new FormData();
  form.append('file', new Blob([conversionCsv(event)], { type: 'text/csv;charset=utf-8' }), 'codex-paid.csv');
  let response;
  try {
    response = await fetchImpl(`${API}/upload?comment=codex_${event.key}`, {
      method: 'POST', headers: { Authorization: `OAuth ${token}` }, body: form,
      signal: AbortSignal.timeout(20000), redirect: 'error',
    });
  } catch {
    await saveState(file, { ...pending, status: 'UNCERTAIN' });
    return { status: 'UNCERTAIN' };
  }
  if (!response.ok) {
    // Rejections need operator review too; no retry storm or accidental replay.
    await saveState(file, { ...pending, status: 'REJECTED', httpStatus: response.status });
    return { status: 'REJECTED', httpStatus: response.status };
  }
  let payload;
  try { payload = await response.json(); } catch { return { status: 'SENDING' }; }
  const uploadId = String(payload.uploading?.id || '');
  if (!/^\d+$/.test(uploadId)) return { status: 'SENDING' };
  await saveState(file, { ...pending, status: 'SUBMITTED', uploadId });
  return { status: 'SUBMITTED' };
}
