#!/usr/bin/env node
/**
 * apply-perf-lite.js
 *
 * Идемпотентно добавляет на страницы сайта:
 *   1) инлайновый детектор "тира" устройства (ставит body.low-visual-budget
 *      на слабых телефонах/ПК) — раньше он был только на index.html;
 *   2) подключение assets/css/perf-lite.css последним стилем.
 *
 * Запуск из корня проекта:  node scripts/apply-perf-lite.js
 * Повторный запуск безопасен — уже обработанные файлы пропускаются.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CSS_HREF = "/assets/css/perf-lite.css?v=20260726-perf-lite1";
const MARKER_JS = "gptishka-visual-budget";
const MARKER_CSS = "perf-lite.css";

// Страницы, на которых нужен лёгкий режим.
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

// Компактная версия детектора из index.html (та же логика тиров).
const TIER_SNIPPET =
  '<script data-id="' +
  MARKER_JS +
  '">!function(){try{var b=document.body;if(!b||b.dataset.visualBudget)return;' +
  'var m=window.matchMedia?window.matchMedia.bind(window):null,q=function(s){return m?m(s).matches:!1},f=null;' +
  'try{var p=new URLSearchParams(location.search||"");f=p.get("lite")||p.get("performance")}catch(e){}' +
  'try{f=f||localStorage.getItem("gptishka_force_lite")}catch(e){}' +
  'f=String(f||"").toLowerCase();var mode;' +
  'if(["1","true","on","yes","lite"].indexOf(f)>-1){mode="low"}' +
  'else if(["0","false","off","no","full"].indexOf(f)>-1){mode="rich"}' +
  'else{var mem=+(navigator.deviceMemory||0),cpu=+(navigator.hardwareConcurrency||0),' +
  'c=navigator.connection||navigator.mozConnection||navigator.webkitConnection||{},' +
  'et=String(c.effectiveType||"").toLowerCase();' +
  'mode=(q("(prefers-reduced-motion: reduce)")||(mem>0&&mem<=4)||(cpu>0&&cpu<=4)||' +
  '/android|iphone|ipad|ipod|mobile|windows phone/i.test(navigator.userAgent||"")||' +
  'c.saveData||et.indexOf("2g")>-1||et.indexOf("3g")>-1)?"low":' +
  '((mem>=12&&cpu>=10&&q("(hover: hover)")&&q("(min-width: 1400px)"))?"rich":"balanced")}' +
  'b.dataset.visualBudget=mode;' +
  'b.classList.add(mode==="low"?"low-visual-budget":(mode==="rich"?"rich-visual-budget":"balanced-visual-budget"))' +
  "}catch(e){}}();<\/script>";

function detectEol(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

let changed = 0;
let skipped = 0;
const missing = [];

for (const page of PAGES) {
  const file = path.join(ROOT, page);
  if (!fs.existsSync(file)) {
    missing.push(page);
    continue;
  }

  let html = fs.readFileSync(file, "utf8");
  const eol = detectEol(html);
  const before = html;

  // 1) CSS — последним, чтобы перебивать ранее подключённые стили.
  if (!html.includes(MARKER_CSS)) {
    const link = '<link rel="stylesheet" href="' + CSS_HREF + '" />';
    if (html.includes("</head>")) {
      html = html.replace("</head>", link + eol + "</head>");
    }
  }

  // 2) Детектор тира — сразу после <body ...>, до первой отрисовки.
  //    index.html уже содержит свою версию (выставляет dataset.visualBudget) —
  //    снippet сам себя выключит, но лишний код туда не добавляем.
  if (!html.includes(MARKER_JS) && !html.includes("visualBudget")) {
    const bodyOpen = html.match(/<body[^>]*>/i);
    if (bodyOpen) {
      html = html.replace(bodyOpen[0], bodyOpen[0] + eol + TIER_SNIPPET);
    }
  }

  if (html !== before) {
    fs.writeFileSync(file, html, "utf8");
    console.log("updated: " + page);
    changed++;
  } else {
    skipped++;
  }
}

console.log(
  "\nГотово. Изменено: " +
    changed +
    ", пропущено (уже применено): " +
    skipped +
    (missing.length ? ", не найдено: " + missing.join(", ") : "")
);
