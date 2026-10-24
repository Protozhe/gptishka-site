import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const html = fs.readFileSync(new URL('../redeem-start.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('function validateTokenNow'));
const source = ts.createSourceFile('activation.js', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const functions = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(source));
  ts.forEachChild(node, visit);
}
visit(source);
const timers = new Map();
let timerId = 0;
const events = new Map();
const calls = [];
const context = vm.createContext({
  AbortController, console,
  previewMode: false, isCredentialsDelivery: false, isPerplexityManualFlow: false,
  isCodexCreditsFlow: false, isChatGptGoFlow: false, isSupportTokenDelivery: false,
  isGrokSsoFlow:false,isClaudeZovoFlow:false,
  activationWaitingForKey: false, activationInFlight: false, orderId: 'fixture-order', orderLinkToken: 'fixture-link',
  tokenInput: {value: '', addEventListener: (name, fn) => events.set(name, fn)},
  tokenWarn: {}, startBtn: {}, tokenValidatedOk: false, lastValidateReason: '',
  validateTimer: null, validationRevision: 0, validationController: null,
  TOKEN_VALIDATE_DEBOUNCE_MS: 600,
  updateTokenMeta() {},
  window: {addEventListener: (name, fn) => events.set(name, fn)},
  document: {hidden: false, addEventListener: (name, fn) => events.set(name, fn)},
  setTimeout(fn, ms) { const id = ++timerId; timers.set(id, {fn, ms}); return id; },
  clearTimeout(id) { timers.delete(id); },
  fetch(url, options) {
    return new Promise((resolve, reject) => {
      calls.push({resolve, token: JSON.parse(options.body).token});
      options.signal.addEventListener('abort', () => reject(new Error('aborted')));
    });
  },
});
for (const name of ['getTokenForSubmit', 'updateStartButtonState', 'scheduleValidateToken', 'validateTokenNow']) {
  vm.runInContext(functions.get(name), context);
}
const eventStart = script.indexOf("tokenInput.addEventListener('input'");
const eventEnd = script.indexOf("toggleMaskBtn.addEventListener", eventStart);
vm.runInContext(script.slice(eventStart, eventEnd), context);
const response = (ok) => ({ok: true, json: async () => ({ok})});
const flush = () => new Promise(resolve => setImmediate(resolve));

// Mobile change/restore events must save the replacement, without relying only on input.
context.tokenInput.value = '{"accessToken":"fixture-new"}';
events.get('change')();
assert.equal(context.startBtn.disabled, true);
const debounce = [...timers.values()].find(t => t.ms === 600);
debounce.fn();
calls.at(-1).resolve(response(true));
await flush();
assert.equal(context.startBtn.disabled, false);
assert.equal(calls.at(-1).token, context.tokenInput.value);

// An old failed response must not disable a newer valid token.
context.tokenInput.value = 'fixture-old';
const old = context.validateTokenNow();
context.tokenInput.value = '{"accessToken":"fixture-latest"}';
const latest = context.validateTokenNow();
calls.at(-1).resolve(response(true));
await latest;
await old;
assert.equal(context.startBtn.disabled, false);

// A hanging request must end with an actionable message, then permit recovery.
const hanging = context.validateTokenNow();
[...timers.values()].find(t => t.ms === 15000).fn();
assert.equal(await hanging, false);
assert.match(context.tokenWarn.textContent, /Не удалось сохранить/);
events.get('pageshow')();
assert.ok([...timers.values()].some(t => t.ms === 600));

// Execute the actual backend storage guard with an order number as token.
const serviceText = fs.readFileSync(new URL('../apps/admin-backend/src/modules/orders/orders.service.ts', import.meta.url), 'utf8');
const serviceSource = ts.createSourceFile('orders.ts', serviceText, ts.ScriptTarget.Latest, true);
let method;
function findMethod(node) {
  if (ts.isMethodDeclaration(node) && node.name?.getText(serviceSource) === 'storeActivationClientToken') method = node.getText(serviceSource);
  ts.forEachChild(node, findMethod);
}
findMethod(serviceSource);
const no = () => false;
let writes = 0;
const backend = vm.createContext({
  assertOrderTokenAccess: async () => ({id: 'fixture-order', status: 'PAID'}),
  getOrderWithFirstItem: async () => ({items: [{product: {slug: 'chatgpt-plus-1'}}]}),
  resolveOrderDeliveryType: () => 'activation', readActivationSiteUrlFromOrderDetails: () => '',
  isMidjourneyProductSlug: no, isSunoPaymentLinkOrder: no, isDevinProductSlug: no,
  isVerificationSupportProduct: no,
  isClaudeZovoProduct:no,isAisouGrokProduct:no,
  canonicalProductKey: x => x, resolveTokenActivationFlowForProduct: () => 'activation',
  isSupportLikeDeliveryType: no, isSupportActivationFlow: no,
  parseClientTokenInput: raw => ({raw, extracted: raw, json: null}), buildTokenMeta: () => ({}),
  MAX_CLIENT_TOKEN_LENGTH: 50000, isCodexCreditsProductKey: no, isChatGptGoProductKey: no,
  normalizeActivationRecordForRead: x => x,
  activationStore: {findByOrderId: () => null, upsert: () => writes++},
  AppError: class extends Error {},
});
const js = ts.transpileModule(`globalThis.service = {${method}};`, {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText;
vm.runInContext(js, backend);
await assert.rejects(backend.service.storeActivationClientToken('fixture-order', 'fixture-order'), /Вставлен номер заказа/);
assert.equal(writes, 0);
// Transient polling errors must keep checking without enabling another submit.
let completed = false;
Object.assign(context, {
  currentTaskId: 'reconcile-fixture', retryNewKeyBtn: {},
  setStatus(tone, text) { context.statusTone = tone; context.statusText = text; },
  resolveActivationSuccessFallback: async () => false,
  markActivationCompleted() { completed = true; },
  clearActivationResumeStorage() {}, hideActionButtons() {}, showReviewReward() {},
});
vm.runInContext(functions.get('checkTaskStatus'), context);
context.fetch = async (_url, options) => {
  assert.equal(options.cache, 'no-store');
  return {ok: false, status: 502, json: async () => ({})};
};
assert.equal(await context.checkTaskStatus(), false);
assert.equal(context.startBtn.disabled, true);
assert.equal(context.retryNewKeyBtn.disabled, true);
assert.equal(context.statusTone, 'pending');
context.fetch = async () => ({ok: true, json: async () => ({pending: true})});
assert.equal(await context.checkTaskStatus(), false);
context.fetch = async () => ({ok: true, json: async () => ({success: true})});
assert.equal(await context.checkTaskStatus(), true);
assert.equal(completed, true);
// A submit transport failure is uncertain, must not be resubmitted, and must
// retain only allowlisted diagnostics rather than request data or raw errors.
const providerFunctions = new Map();
function findProviderFunctions(node) {
  if (ts.isFunctionDeclaration(node) && node.name) providerFunctions.set(node.name.text, node.getText(serviceSource));
  ts.forEachChild(node, findProviderFunctions);
}
findProviderFunctions(serviceSource);
let submits = 0;
let transportFailure = Object.assign(new Error('AIEE transport failed'), {transportExitCode: 28});
const provider = vm.createContext({
  isAieeProviderBase: () => true, isIosProviderBase: () => false,
  recoverCompletedChongzhiJsonTask: async () => null,
  async callChongzhiJsonApi(_base, action) {
    if (action === 'query_code') return {status: 200, json: {success: true, status: 'available'}};
    if (action === 'verify_code') return {status: 200, json: {success: true, sid: 'fixture-session'}};
    if (action === 'validate_token') return {status: 200, json: {success: true}};
    submits++;
    throw transportFailure;
  },
  Error,
});
vm.runInContext(ts.transpileModule(providerFunctions.get('startChongzhiJsonTask'), {
  compilerOptions: {target: ts.ScriptTarget.ES2022},
}).outputText, provider);
const uncertain = await provider.startChongzhiJsonTask({cdk: 'fixture-key', userCandidates: ['{"fixture":true}']}, 'fixture-provider');
assert.equal(submits, 1);
assert.match(uncertain.taskId, /^reconcile-/);
assert.equal(uncertain.immediateSuccess, false);
assert.equal(uncertain.providerPayload.submissionDiagnostics.transportExitCode, 28);
transportFailure = new Error('secret-fixture-payload');
const redacted = await provider.startChongzhiJsonTask({cdk: 'fixture-key', userCandidates: ['{"fixture":true}']}, 'fixture-provider');
assert.equal(JSON.stringify(redacted.providerPayload).includes('secret-fixture-payload'), false);
console.log('Activation replacement, stale response, timeout recovery, polling recovery and invalid order-number rejection passed.');
