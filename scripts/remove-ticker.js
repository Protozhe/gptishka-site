#!/usr/bin/env node
/**
 * remove-ticker.js — полностью убирает "ленту активаций" (site-ticker).
 *
 * Что делает:
 *   1) вырезает разметку <div id="siteTicker">...</div> со всех страниц
 *      (с подсчётом вложенности, чтобы не поломать соседние блоки);
 *   2) выключает JS-модуль ленты в assets/js/app.js — иначе он
 *      пересоздаёт элемент сам и продолжает опрашивать сервер.
 *
 * Побочный эффект (намеренный): вместе с лентой отключаются
 * периодические запросы /api/stats (каждые 15 c) и /api/heartbeat
 * (каждые 20 c) — это заметная экономия батареи и трафика на телефонах
 * и снижение нагрузки на сервер. Счётчик "онлайн" в админке перестанет
 * получать данные: чтобы вернуть всё назад, поставьте TICKER_ENABLED = true
 * в assets/js/app.js.
 *
 * Запуск из корня проекта:  node scripts/remove-ticker.js
 * Повторный запуск безопасен.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const START_MARK = '<div id="siteTicker"';

/** Вырезает сбалансированный по <div> блок, начинающийся с START_MARK. */
function stripTickerBlock(html) {
  let removed = 0;
  for (;;) {
    const start = html.indexOf(START_MARK);
    if (start === -1) break;

    let i = start;
    let depth = 0;
    let end = -1;
    const tagRe = /<(\/?)div\b[^>]*>/gi;
    tagRe.lastIndex = start;

    let match;
    while ((match = tagRe.exec(html)) !== null) {
      depth += match[1] === "/" ? -1 : 1;
      if (depth === 0) {
        end = match.index + match[0].length;
        break;
      }
    }
    if (end === -1) break; // разметка не сбалансирована — не трогаем

    // Прихватываем перевод строки после блока, чтобы не осталось пустой строки.
    let tail = end;
    if (html[tail] === "\r") tail++;
    if (html[tail] === "\n") tail++;

    html = html.slice(0, start) + html.slice(tail);
    removed++;
    i = start;
  }
  return { html, removed };
}

let pagesChanged = 0;
const htmlFiles = fs
  .readdirSync(ROOT)
  .filter((name) => name.endsWith(".html"))
  .map((name) => path.join(ROOT, name));

for (const file of htmlFiles) {
  const before = fs.readFileSync(file, "utf8");
  if (!before.includes(START_MARK)) continue;

  const { html, removed } = stripTickerBlock(before);
  if (removed > 0 && html !== before) {
    fs.writeFileSync(file, html, "utf8");
    console.log("лента убрана: " + path.basename(file) + " (блоков: " + removed + ")");
    pagesChanged++;
  }
}

// --- Выключаем JS-модуль ленты -------------------------------------------
const appJs = path.join(ROOT, "assets", "js", "app.js");
let jsPatched = false;

if (fs.existsSync(appJs)) {
  let code = fs.readFileSync(appJs, "utf8");

  if (code.includes("TICKER_ENABLED")) {
    console.log("app.js: модуль ленты уже выключен");
  } else {
    const anchor = "// Live ticker with masked activation events and split counters.";
    const idx = code.indexOf(anchor);
    const openIdx = idx === -1 ? -1 : code.indexOf("(() => {", idx);

    if (openIdx === -1) {
      console.error(
        "ВНИМАНИЕ: не нашёл начало модуля ленты в assets/js/app.js — выключите вручную."
      );
      process.exitCode = 1;
    } else {
      const eol = code.includes("\r\n") ? "\r\n" : "\n";
      const insertAt = openIdx + "(() => {".length;
      const guard =
        eol +
        "  // Лента активаций отключена: элемент не создаётся, опросы" +
        eol +
        "  // /api/stats и /api/heartbeat не запускаются. Вернуть — поставить true." +
        eol +
        "  const TICKER_ENABLED = false;" +
        eol +
        "  if (!TICKER_ENABLED) return;" +
        eol;

      code = code.slice(0, insertAt) + guard + code.slice(insertAt);
      fs.writeFileSync(appJs, code, "utf8");
      jsPatched = true;
      console.log("app.js: модуль ленты выключен (TICKER_ENABLED = false)");
    }
  }
}

console.log(
  "\nГотово. Страниц изменено: " +
    pagesChanged +
    (jsPatched ? ", JS-модуль выключен." : ".") +
    "\nНе забудьте пересобрать app.min.js:  npm run build:assets"
);
