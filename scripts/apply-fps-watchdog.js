#!/usr/bin/env node
/*
 * Подключает сторож реального FPS (assets/js/perf-watchdog.js) на те же
 * страницы, где уже используется perf-lite.css, и добавляет в perf-lite.css
 * блок 9 (иконки соцсетей в шапке на 761–900px).
 *
 * Скрипт идемпотентный: повторный запуск только обновит ?v=, ничего не
 * продублирует. Заодно чинит страницы, на которых ссылка на perf-lite.css
 * потерялась.
 *
 * Запуск из корня репозитория:  node scripts/apply-fps-watchdog.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const VERSION = "20260726-fps1";

const CSS_FILE = path.join(ROOT, "assets", "css", "perf-lite.css");
const JS_FILE = path.join(ROOT, "assets", "js", "perf-watchdog.js");

const CSS_HREF = "/assets/css/perf-lite.css?v=" + VERSION;
const JS_SRC = "/assets/js/perf-watchdog.js?v=" + VERSION;

const PAGES = [
  "index.html",
  "chatgpt.html",
  "claude.html",
  "supergrok.html",
  "about.html",
  "contact.html",
  "guarantee.html",
  "refund.html",
  "service.html",
  "oferta.html",
  "politika.html",
  "site-map.html",
  "chatgpt-plus-cena.html",
  "chatgpt-plus-kupit.html",
  "kak-oplatit-chatgpt-v-rossii.html",
  "podklyuchenie-chatgpt-online.html",
];

const CSS_MARKER = "10. Соцсети в шапке на средних экранах";
const CSS_BLOCK = `
/* -------------------------------------------------------------
   9. ${CSS_MARKER}.

   В диапазоне 761–900px в шапке одновременно должны поместиться логотип,
   промо-плашка ChatGPT, пять быстрых ссылок, две иконки соцсетей и
   переключатель языка. Логотип и язык уже ужаты до знака и флага, дальше
   резать нечего — кроме иконок VK и Telegram. Они дублируются в подвале и
   в виджете поддержки, поэтому их скрытие не отнимает у пользователя
   способ связаться. Промо-плашку не трогаем: это основной продающий
   элемент шапки.

   Ниже 761px работает мобильная раскладка шапки — туда не вмешиваемся.
   ------------------------------------------------------------- */
@media (min-width: 761px) and (max-width: 900px) {
  html body header .header-quick-link.header-social-link.header-social-link {
    display: none !important;
  }
}
`;

function detectEol(text) {
  return text.indexOf("\r\n") !== -1 ? "\r\n" : "\n";
}

function bumpVersion(html, fileName) {
  const re = new RegExp(fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\?v=[^\"']*", "g");
  return html.replace(re, fileName + "?v=" + VERSION);
}

if (!fs.existsSync(JS_FILE)) {
  console.error("ОШИБКА: не найден " + JS_FILE + ". Сначала положите файл перф-сторожа.");
  process.exit(1);
}
if (!fs.existsSync(CSS_FILE)) {
  console.error("ОШИБКА: не найден " + CSS_FILE + ".");
  process.exit(1);
}

/* 1) CSS-блок 9 — дописываем в конец perf-lite.css. */
let css = fs.readFileSync(CSS_FILE, "utf8");
if (css.indexOf(CSS_MARKER) === -1) {
  const eol = detectEol(css);
  const block = eol === "\r\n" ? CSS_BLOCK.replace(/\n/g, "\r\n") : CSS_BLOCK;
  fs.writeFileSync(CSS_FILE, css.replace(/\s*$/, eol) + block, "utf8");
  console.log("perf-lite.css: добавлен блок 9 (соцсети 761–900px)");
} else {
  console.log("perf-lite.css: блок 9 уже на месте");
}

/* 2) Страницы: ссылка на CSS, тег сторожа, обновление ?v=. */
let changed = 0;
let skipped = 0;
const missing = [];
const healed = [];

for (const page of PAGES) {
  const file = path.join(ROOT, page);
  if (!fs.existsSync(file)) {
    missing.push(page);
    continue;
  }

  let html = fs.readFileSync(file, "utf8");
  const eol = detectEol(html);
  const before = html;

  // 2a) Ссылка на perf-lite.css. Если её нет — страница осталась без
  //     оптимизаций, возвращаем (это уже случалось при откате правок).
  if (html.indexOf("perf-lite.css") === -1) {
    const link = '<link rel="stylesheet" href="' + CSS_HREF + '" />';
    if (html.indexOf("</head>") !== -1) {
      html = html.replace("</head>", link + eol + "</head>");
      healed.push(page);
    }
  } else {
    html = bumpVersion(html, "perf-lite.css");
  }

  // 2b) Сторож FPS — последним перед </body>, с defer.
  if (html.indexOf("perf-watchdog.js") === -1) {
    const tag = '<script src="' + JS_SRC + '" defer></script>';
    if (html.indexOf("</body>") !== -1) {
      html = html.replace("</body>", tag + eol + "</body>");
    }
  } else {
    html = bumpVersion(html, "perf-watchdog.js");
  }

  if (html !== before) {
    fs.writeFileSync(file, html, "utf8");
    console.log("обновлено: " + page);
    changed++;
  } else {
    skipped++;
  }
}

console.log(
  "\nГотово. Изменено страниц: " +
    changed +
    ", без изменений: " +
    skipped +
    (healed.length ? "\nВосстановлена ссылка на perf-lite.css: " + healed.join(", ") : "") +
    (missing.length ? "\nНе найдено: " + missing.join(", ") : "")
);
