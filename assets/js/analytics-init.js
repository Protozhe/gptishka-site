(function () {
  var TMR_ID = "3744660";
  var YM_ID = 106969126;
  var TMR_SCRIPT_ID = "tmr-code";
  var YM_SCRIPT_SRC = "https://mc.yandex.ru/metrika/tag.js";
  var TMR_SCRIPT_SRC = "https://top-fwz1.mail.ru/js/code.js";
  var ATTRIBUTION_STORAGE_KEY = "gptishka_attribution_v1";
  var ATTRIBUTION_SESSION_KEY = "gptishka_session_attribution_v1";
  var ATTRIBUTION_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "yclid"];

  if (window.__gptishkaAnalyticsInitialized) return;
  window.__gptishkaAnalyticsInitialized = true;

  function readJson(storage, key) {
    try {
      var raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function writeJson(storage, key, value) {
    try {
      storage.setItem(key, JSON.stringify(value));
    } catch (_) {
      // Attribution must never interfere with the storefront.
    }
  }

  function clipped(value, maxLength) {
    return String(value || "").trim().slice(0, maxLength);
  }

  function cleanUrl(value, maxLength) {
    try {
      var url = new URL(String(value || ""));
      url.search = "";
      url.hash = "";
      return clipped(url.toString(), maxLength);
    } catch (_) {
      return "";
    }
  }

  function buildAttributionTouch() {
    var pageUrl;
    try {
      pageUrl = new URL(window.location.href);
    } catch (_) {
      return null;
    }

    var campaign = {};
    var hasCampaignParams = false;
    for (var i = 0; i < ATTRIBUTION_PARAMS.length; i += 1) {
      var key = ATTRIBUTION_PARAMS[i];
      var value = clipped(pageUrl.searchParams.get(key), 200);
      if (!value) continue;
      campaign[key] = value;
      hasCampaignParams = true;
    }

    var rawReferrer = clipped(document.referrer, 1500);
    var referrer = cleanUrl(rawReferrer, 1000);
    var source = clipped(campaign.utm_source, 120);
    var medium = clipped(campaign.utm_medium, 120);
    if (!source && campaign.yclid) source = "yandex";
    if (!medium && campaign.yclid) medium = "cpc";
    if (!source && referrer) {
      try {
        source = clipped(new URL(rawReferrer).hostname.replace(/^www\./, ""), 120);
        medium = "referral";
      } catch (_) {
        source = "referral";
        medium = "referral";
      }
    }
    if (!source) source = "direct";
    if (!medium) medium = "none";

    return {
      capturedAt: new Date().toISOString(),
      source: source,
      medium: medium,
      landingPage: cleanUrl(pageUrl.toString(), 1000),
      referrer: referrer,
      hasCampaignParams: hasCampaignParams,
      utm_source: campaign.utm_source || "",
      utm_medium: campaign.utm_medium || "",
      utm_campaign: campaign.utm_campaign || "",
      utm_content: campaign.utm_content || "",
      utm_term: campaign.utm_term || "",
      yclid: campaign.yclid || ""
    };
  }

  function persistAttribution() {
    var touch = buildAttributionTouch();
    if (!touch) return;

    var stored = readJson(window.localStorage, ATTRIBUTION_STORAGE_KEY) || {};
    var sessionTouch = readJson(window.sessionStorage, ATTRIBUTION_SESSION_KEY);
    var shouldRefreshSession = !sessionTouch || touch.hasCampaignParams;
    if (shouldRefreshSession) {
      sessionTouch = touch;
      writeJson(window.sessionStorage, ATTRIBUTION_SESSION_KEY, sessionTouch);
    }

    var attribution = {
      version: 1,
      firstTouch: stored.firstTouch || sessionTouch,
      lastTouch: shouldRefreshSession ? sessionTouch : (stored.lastTouch || sessionTouch)
    };
    writeJson(window.localStorage, ATTRIBUTION_STORAGE_KEY, attribution);

    window.gptishkaGetAttribution = function () {
      var latest = readJson(window.localStorage, ATTRIBUTION_STORAGE_KEY) || attribution;
      var activeSession = readJson(window.sessionStorage, ATTRIBUTION_SESSION_KEY) || sessionTouch;
      return {
        version: 1,
        firstTouch: latest.firstTouch || null,
        lastTouch: latest.lastTouch || activeSession || null,
        session: activeSession || null
      };
    };
  }

  persistAttribution();

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

  function scheduleAfterLoad() {
    analyticsTimer = window.setTimeout(startExternalAnalytics, 4000);
  }

  for (var i = 0; i < interactionEvents.length; i += 1) {
    window.addEventListener(interactionEvents[i], startExternalAnalytics, {
      once: true,
      passive: true
    });
  }

  if (document.readyState === "complete") {
    scheduleAfterLoad();
  } else {
    window.addEventListener("load", scheduleAfterLoad, { once: true });
  }
})();
