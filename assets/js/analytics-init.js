(function () {
  var TMR_ID = "3744660";
  var YM_ID = 106969126;
  var TMR_SCRIPT_ID = "tmr-code";
  var YM_SCRIPT_SRC = "https://mc.yandex.ru/metrika/tag.js";
  var TMR_SCRIPT_SRC = "https://top-fwz1.mail.ru/js/code.js";

  if (window.__gptishkaAnalyticsInitialized) return;
  window.__gptishkaAnalyticsInitialized = true;

  function hasScript(srcPrefix) {
    var scripts = document.scripts || [];
    for (var i = 0; i < scripts.length; i += 1) {
      if (String(scripts[i].src || "").indexOf(srcPrefix) === 0) return true;
    }
    return false;
  }

  window._tmr = window._tmr || [];
  window._tmr.push({
    id: TMR_ID,
    type: "pageView",
    start: Date.now()
  });

  window.ym = window.ym || function () {
    (window.ym.a = window.ym.a || []).push(arguments);
  };
  window.ym.l = window.ym.l || Date.now();

  window.ym(YM_ID, "init", {
    ssr: true,
    webvisor: true,
    clickmap: true,
    ecommerce: "dataLayer",
    referrer: document.referrer,
    url: location.href,
    accurateTrackBounce: true,
    trackLinks: true
  });

  var analyticsStarted = false;
  var analyticsTimer = 0;
  var interactionEvents = ["pointerdown", "touchstart", "keydown", "scroll"];

  function removeInteractionListeners() {
    for (var i = 0; i < interactionEvents.length; i += 1) {
      window.removeEventListener(interactionEvents[i], startExternalAnalytics);
    }
  }

  function insertAsyncScript(script) {
    var anchor = document.getElementsByTagName("script")[0];
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(script, anchor);
    } else {
      document.head.appendChild(script);
    }
  }

  function startExternalAnalytics() {
    if (analyticsStarted) return;
    analyticsStarted = true;
    if (analyticsTimer) window.clearTimeout(analyticsTimer);
    removeInteractionListeners();

    if (!document.getElementById(TMR_SCRIPT_ID)) {
      var tmrScript = document.createElement("script");
      tmrScript.type = "text/javascript";
      tmrScript.async = true;
      tmrScript.id = TMR_SCRIPT_ID;
      tmrScript.src = TMR_SCRIPT_SRC;
      insertAsyncScript(tmrScript);
    }

    if (!hasScript(YM_SCRIPT_SRC)) {
      var ymScript = document.createElement("script");
      ymScript.async = true;
      ymScript.src = YM_SCRIPT_SRC + "?id=" + YM_ID;
      insertAsyncScript(ymScript);
    }
  }

  window.gptishkaStartExternalAnalytics = startExternalAnalytics;

  function scheduleAfterLoad() {
    analyticsTimer = window.setTimeout(startExternalAnalytics, 4000);
  }

  for (var i = 0; i < interactionEvents.length; i += 1) {
    window.addEventListener(interactionEvents[i], startExternalAnalytics, {
      once: true,
      passive: true
    });
  }

  if (/\/(?:success|fail)\.html$/i.test(window.location.pathname || "")) {
    startExternalAnalytics();
  } else if (document.readyState === "complete") {
    scheduleAfterLoad();
  } else {
    window.addEventListener("load", scheduleAfterLoad, { once: true });
  }
})();
