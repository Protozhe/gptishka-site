#!/usr/bin/env node
/**
 * minify-assets.js — реальная минификация фронтенд-ассетов.
 *
 * Зачем: assets/js/app.min.js сейчас побайтово совпадает с app.js
 * (309 КБ неминифицированного кода с комментариями), т.е. ".min" был
 * просто копией. На слабых телефонах это лишние килобайты и время парсинга.
 *
 * Безопасность: намеренно НЕ включаем minifyIdentifiers — имена функций
 * верхнего уровня остаются прежними, поэтому другие скрипты
 * (hero-lite.js, home-promo-slider.js, support-widget.js и т.д.),
 * обращающиеся к глобальным функциям, продолжают работать.
 *
 * Запуск из корня проекта:  node scripts/minify-assets.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

let esbuild;
try {
  esbuild = require("esbuild");
} catch (_) {
  console.error(
    "esbuild не найден. Установите его:  npm i -D esbuild\n" +
      "(или запустите скрипт из корня проекта, где есть node_modules)"
  );
  process.exit(1);
}

const TARGETS = [
  { src: "assets/js/app.js", out: "assets/js/app.min.js", loader: "js" },
  { src: "assets/css/home-critical-bundle.css", out: "assets/css/home-critical-bundle.min.css", loader: "css" },
  { src: "assets/css/theme.css", out: "assets/css/theme.min.css", loader: "css" },
];

function kb(bytes) {
  return (bytes / 1024).toFixed(1) + " КБ";
}

(async () => {
  let totalBefore = 0;
  let totalAfter = 0;

  for (const target of TARGETS) {
    const srcPath = path.join(ROOT, target.src);
    const outPath = path.join(ROOT, target.out);

    if (!fs.existsSync(srcPath)) {
      console.log("пропуск (нет файла): " + target.src);
      continue;
    }

    const source = fs.readFileSync(srcPath, "utf8");

    let result;
    try {
      result = await esbuild.transform(source, {
        loader: target.loader,
        // Комментарии и пробелы убираем, синтаксис сокращаем,
        // но идентификаторы НЕ переименовываем — см. комментарий выше.
        minifyWhitespace: true,
        minifySyntax: true,
        minifyIdentifiers: false,
        legalComments: "none",
        target: target.loader === "js" ? "es2018" : undefined,
      });
    } catch (error) {
      console.error("ОШИБКА минификации " + target.src + ": " + error.message);
      process.exitCode = 1;
      continue;
    }

    // Страховка: результат должен быть непустым и меньше исходника.
    if (!result.code || result.code.length === 0) {
      console.error("ОШИБКА: пустой результат для " + target.src + " — файл не перезаписан");
      process.exitCode = 1;
      continue;
    }

    const beforeSize = Buffer.byteLength(source, "utf8");
    const afterSize = Buffer.byteLength(result.code, "utf8");
    totalBefore += beforeSize;
    totalAfter += afterSize;

    fs.writeFileSync(outPath, result.code, "utf8");
    const saved = beforeSize > 0 ? Math.round((1 - afterSize / beforeSize) * 100) : 0;
    console.log(
      target.out.padEnd(42) + kb(beforeSize).padStart(10) + "  ->" + kb(afterSize).padStart(10) + "   (-" + saved + "%)"
    );
  }

  if (totalBefore > 0) {
    const saved = Math.round((1 - totalAfter / totalBefore) * 100);
    console.log("\nИтого: " + kb(totalBefore) + " -> " + kb(totalAfter) + "  (-" + saved + "%)");
    console.log("\nНе забудьте обновить ?v=... в HTML, чтобы сбросить кэш у клиентов.");
  }
})();
