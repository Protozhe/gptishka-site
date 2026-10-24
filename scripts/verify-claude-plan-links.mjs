import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const cases = [
  ['claude', '', false, 'pro'],
  ['claude', '?plan=pro', false, 'pro'],
  ['claude', '?plan=max-5x', false, 'max-5x'],
  ['claude', '?plan=max-20x', false, 'max-20x'],
  ['claude', '?plan=max5x', false, 'max-5x'],
  ['claude', '?plan=20x', true, 'max-20x'],
  ['claude', '?plan=%20MAX-5X%20&utm_source=yandex', false, 'max-5x'],
  ['claude', '?plan=unavailable', false, 'pro'],
  ['claude', '?plan=constructor', false, 'pro'],
  ['chatgpt', '', false, 'plus'],
  ['chatgpt', '?plan=pro', false, 'pro-5x'],
  ['chatgpt', '?plan=pro-20x', false, 'pro-20x'],
  ['chatgpt', '?plan=pro500', false, 'pro-25x'],
  ['chatgpt', '', true, 'all'],
  ['gemini', '', false, 'all'],
];
for (const path of ['main.js', 'assets/js/app.js', 'assets/js/app.min.js']) {
  const source = fs.readFileSync(path, 'utf8');
  const start = source.indexOf('  const requestedServicePlan = (() => {');
  const end = source.indexOf('  const servicePageState = {', start);
  assert.ok(start >= 0 && end > start, path);
  const selector = source.slice(start, end) + '\nrequestedServicePlan;';
  for (const [service, search, english, expected] of cases) {
    const actual = vm.runInNewContext(selector, {
      URLSearchParams,
      window: { location: { search } },
      servicePageRootEl: { getAttribute: () => service },
      isEnglishRequest: () => english,
    });
    assert.equal(actual, expected, `${path}: ${service} ${search}`);
  }
}
console.log(`Claude plan links: ${cases.length * 3} URL selection and other-service regression cases passed.`);
