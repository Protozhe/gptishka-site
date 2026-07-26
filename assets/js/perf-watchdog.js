/*
 * GPTishka: сторож реального FPS.
 *
 * Инлайновый детектор в <head> угадывает «мощность» устройства по
 * navigator.deviceMemory и hardwareConcurrency. Эти цифры ничего не знают
 * о том, включено ли аппаратное ускорение в браузере. Если пользователь
 * его выключил (или драйвер в чёрном списке), то формально мощная машина
 * рисует страницу процессором, и blur/тени начинают стоить десятки
 * миллисекунд на кадр — сайт выглядит «сломанным».
 *
 * Сторож меряет фактическую частоту кадров уже после загрузки и, если она
 * низкая, переводит страницу в лёгкий режим — независимо от того, что
 * показали характеристики железа. Решение запоминается на вкладку, чтобы
 * на следующих страницах не было мигания.
 *
 * Только вниз: в rich/balanced обратно не поднимаем, иначе на любой
 * случайной просадке страница начнёт мигать оформлением.
 */
(function () {
  "use strict";

  var SESSION_KEY = "gptishka_fps_low";
  var FPS_FLOOR = 40; // ниже этого порога программный рендеринг практически гарантирован
  var SAMPLE_MS = 500; // длительность одного замера
  var SETTLE_MS = 600; // пауза после load, чтобы не мерить пик загрузки

  function body() {
    return document.body;
  }

  function alreadyLow() {
    var b = body();
    return !!b && (b.dataset.visualBudget === "low" || b.classList.contains("low-visual-budget"));
  }

  /* Явный выбор пользователя (?lite=/?performance= или localStorage)
     сторож не переопределяет — это ручной переключатель. */
  function userForcedMode() {
    var value = null;
    try {
      var params = new URLSearchParams(window.location.search || "");
      value = params.get("lite") || params.get("performance");
    } catch (e) {}
    if (!value) {
      try {
        value = localStorage.getItem("gptishka_force_lite");
      } catch (e) {}
    }
    return String(value || "").trim();
  }

  function downgrade(reason, fps) {
    var b = body();
    if (!b || alreadyLow()) return;

    b.classList.remove("rich-visual-budget");
    b.classList.remove("balanced-visual-budget");
    /* На главной класс градиента управляет тяжёлым фоном — тоже переводим
       в облегчённый вариант, иначе останется дорогой градиент. */
    if (b.classList.contains("home-gradient-page")) {
      b.classList.remove("home-gradient-page");
      b.classList.add("home-gradient-page-lite");
    }
    b.classList.add("low-visual-budget");
    b.dataset.visualBudget = "low";
    b.dataset.visualBudgetReason = reason;
    if (typeof fps === "number") {
      b.dataset.visualBudgetFps = String(Math.round(fps));
    }

    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch (e) {}
  }

  /* Один замер: считаем кадры за SAMPLE_MS реального времени.
     Возвращаем null, если вкладка ушла в фон — там rAF искусственно
     замедляется и любой замер даст ложное «тормозит». */
  function sample(done) {
    if (document.hidden) {
      done(null);
      return;
    }
    var frames = 0;
    var started = performance.now();

    var tick = function (now) {
      if (document.hidden) {
        done(null);
        return;
      }
      frames++;
      if (now - started < SAMPLE_MS) {
        requestAnimationFrame(tick);
        return;
      }
      var elapsed = now - started;
      done(elapsed > 0 ? (frames * 1000) / elapsed : null);
    };

    requestAnimationFrame(tick);
  }

  /* Вкладка в фоне: requestAnimationFrame и таймеры там намеренно
     замедляются браузером, любой замер даст ложное «тормозит». Ждём, пока
     вкладку откроют, и меряем уже тогда. */
  var retries = 0;
  function whenVisible(fn) {
    if (retries >= 3) return;
    retries++;
    var handler = function () {
      if (document.hidden) return;
      document.removeEventListener("visibilitychange", handler);
      setTimeout(fn, SETTLE_MS);
    };
    document.addEventListener("visibilitychange", handler);
  }

  function measure() {
    if (alreadyLow()) return;
    if (document.hidden) {
      whenVisible(measure);
      return;
    }

    /* Два замера подряд, берём лучший: одиночная просадка (сборка мусора,
       догрузка шрифта, чужой скрипт) не должна ронять оформление. */
    sample(function (first) {
      if (first === null) {
        whenVisible(measure);
        return;
      }
      if (first >= FPS_FLOOR) return; // первый же замер хороший — выходим
      sample(function (second) {
        if (second === null) {
          whenVisible(measure);
          return;
        }
        var best = Math.max(first, second);
        if (best < FPS_FLOOR) {
          downgrade("low-fps", best);
        }
      });
    });
  }

  function start() {
    if (!body()) {
      document.addEventListener("DOMContentLoaded", start, { once: true });
      return;
    }

    if (userForcedMode()) return;

    /* Решение, принятое на прошлой странице этой же вкладки, применяем
       сразу — до первой отрисовки, без повторного замера и мигания. */
    var remembered = null;
    try {
      remembered = sessionStorage.getItem(SESSION_KEY);
    } catch (e) {}
    if (remembered === "1") {
      downgrade("session-cache");
      return;
    }

    if (!window.requestAnimationFrame || !window.performance) return;

    if (document.readyState === "complete") {
      setTimeout(measure, SETTLE_MS);
    } else {
      window.addEventListener(
        "load",
        function () {
          setTimeout(measure, SETTLE_MS);
        },
        { once: true }
      );
    }
  }

  start();
})();
