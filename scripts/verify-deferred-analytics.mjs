import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const script = fs.readFileSync(path.join(root, "assets", "js", "analytics-init.js"), "utf8");
const tracked = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (
      [".git", "node_modules", "visual-baseline"].includes(entry.name) ||
      entry.name.toLowerCase().includes("backup") ||
      entry.name.startsWith("scratch-") ||
      entry.name.startsWith("_")
    ) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (entry.name.endsWith(".html")) tracked.push(fullPath);
  }
}
walk(root);

assert.ok(script.includes('window.ym(YM_ID, "init"'), "Yandex init must remain queued immediately.");
assert.ok(script.includes('type: "pageView"'), "Mail.ru page view must remain queued immediately.");
assert.match(script, /window\.addEventListener\("load", scheduleAfterLoad/);
assert.match(script, /window\.setTimeout\(startExternalAnalytics, 4000\)/);
for (const eventName of ["pointerdown", "touchstart", "keydown", "scroll"]) {
  assert.ok(script.includes(`"${eventName}"`), `${eventName} interaction trigger is missing.`);
}
assert.ok(
  script.indexOf("function startExternalAnalytics") < script.lastIndexOf("tmrScript.src = TMR_SCRIPT_SRC"),
  "External analytics injection must stay inside the delayed loader.",
);

const listeners = new Map();
const timers = new Map();
const inserted = [];
let timerId = 0;
const windowMock = {
  addEventListener(name, callback) {
    listeners.set(name, callback);
  },
  removeEventListener(name, callback) {
    if (listeners.get(name) === callback) listeners.delete(name);
  },
  setTimeout(callback, delay) {
    timerId += 1;
    timers.set(timerId, { callback, delay });
    return timerId;
  },
  clearTimeout(id) {
    timers.delete(id);
  },
};
const anchor = { parentNode: { insertBefore(node) { inserted.push(node); } } };
const documentMock = {
  readyState: "loading",
  referrer: "",
  scripts: [],
  head: { appendChild(node) { inserted.push(node); } },
  createElement(tagName) { return { tagName }; },
  getElementById() { return null; },
  getElementsByTagName() { return [anchor]; },
};
vm.runInNewContext(script, {
  window: windowMock,
  document: documentMock,
  location: { href: "https://www.gptishka.shop/" },
  Date,
});
assert.equal(inserted.length, 0, "External analytics must not load during initial execution.");
assert.equal(windowMock._tmr.length, 1, "Mail.ru page view must be queued immediately.");
assert.equal(windowMock.ym.a.length, 1, "Yandex init must be queued immediately.");
assert.ok(listeners.has("load"), "Load scheduler is missing.");
listeners.get("load")();
assert.equal([...timers.values()][0].delay, 4000, "Post-load delay changed.");
listeners.get("pointerdown")();
assert.equal(inserted.length, 2, "First interaction must load both analytics scripts.");
assert.deepEqual(
  inserted.map(node => node.src).sort(),
  ["https://mc.yandex.ru/metrika/tag.js?id=106969126", "https://top-fwz1.mail.ru/js/code.js"].sort(),
);
assert.equal(timers.size, 0, "Interaction must cancel the delayed timer.");

const pages = tracked.filter(file => fs.readFileSync(file, "utf8").includes("/assets/js/analytics-init.js"));
assert.ok(pages.length >= 48, `Expected at least 48 analytics pages, found ${pages.length}.`);
for (const file of pages) {
  assert.ok(
    fs.readFileSync(file, "utf8").includes("/assets/js/analytics-init.js?v=20260813-yandex-attribution1"),
    `${path.relative(root, file)} has a stale analytics cache version.`,
  );
}

console.log(`Deferred analytics wiring verified across ${pages.length} HTML pages.`);
