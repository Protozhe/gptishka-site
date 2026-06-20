import assert from "node:assert/strict";
import test from "node:test";
import {
  buildActivationSiteEndpointUrl,
  normalizeActivationSiteUrl,
  readActivationSiteUrlFromOrderDetails,
} from "./activation-site";

test("normalizeActivationSiteUrl keeps origin and path but removes trailing slash", () => {
  assert.equal(normalizeActivationSiteUrl(" https://vip.sxzfd.com/ "), "https://vip.sxzfd.com");
  assert.equal(normalizeActivationSiteUrl("https://9977ai.vip/go.php"), "https://9977ai.vip/go.php");
  assert.equal(normalizeActivationSiteUrl("https://aisub.vip///"), "https://aisub.vip");
});

test("normalizeActivationSiteUrl rejects non-http urls", () => {
  assert.equal(normalizeActivationSiteUrl("javascript:alert(1)"), "");
  assert.equal(normalizeActivationSiteUrl("ftp://vip.sxzfd.com"), "");
  assert.equal(normalizeActivationSiteUrl(""), "");
});

test("readActivationSiteUrlFromOrderDetails reads server snapshot only", () => {
  assert.equal(
    readActivationSiteUrlFromOrderDetails({
      selection: {
        activationSiteUrl: "https://client.example",
        serverActivationSiteUrl: "https://vip.sxzfd.com/",
      },
    }),
    "https://vip.sxzfd.com"
  );
});

test("buildActivationSiteEndpointUrl resolves provider endpoints for roots and page urls", () => {
  assert.equal(
    buildActivationSiteEndpointUrl("https://vip.sxzfd.com/", "api-verify.php"),
    "https://vip.sxzfd.com/api-verify.php"
  );
  assert.equal(
    buildActivationSiteEndpointUrl("https://9977ai.vip/go.php", "api-verify.php"),
    "https://9977ai.vip/api-verify.php"
  );
  assert.equal(
    buildActivationSiteEndpointUrl("https://example.com/recharge/", "api-verify.php"),
    "https://example.com/recharge/api-verify.php"
  );
});
