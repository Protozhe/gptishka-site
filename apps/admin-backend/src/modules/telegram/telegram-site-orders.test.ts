import assert from "node:assert/strict";
import {
  buildSiteOrderTelegramDeepLink,
  parseSiteOrderStartPayload,
  sha256Hex,
  verifyRedeemTokenHash,
} from "../orders/telegram-order-linking";

function testParseOrderStartPayload() {
  assert.deepEqual(parseSiteOrderStartPayload("order_cmqjs5sbe000x9nw4696b343m_abcDEF_1234567890"), {
    orderId: "cmqjs5sbe000x9nw4696b343m",
    orderToken: "abcDEF_1234567890",
  });
  assert.equal(parseSiteOrderStartPayload("login_abc"), null);
  assert.equal(parseSiteOrderStartPayload("order_only"), null);
}

function testDeepLinkBuilder() {
  assert.equal(
    buildSiteOrderTelegramDeepLink({
      botUsername: "@GPTishka_myBot",
      orderId: "cmqjs5sbe000x9nw4696b343m",
      orderToken: "secret_token",
    }),
    "https://t.me/GPTishka_myBot?start=order_cmqjs5sbe000x9nw4696b343m_secret_token"
  );
  assert.equal(
    buildSiteOrderTelegramDeepLink({
      botUsername: "",
      orderId: "cmqjs5sbe000x9nw4696b343m",
      orderToken: "secret_token",
    }),
    ""
  );
}

function testRedeemTokenHashVerification() {
  const token = "safe_order_token";
  const hash = sha256Hex(token);
  assert.doesNotThrow(() => verifyRedeemTokenHash({ expectedHash: hash, providedToken: token }));
  assert.throws(() => verifyRedeemTokenHash({ expectedHash: hash, providedToken: "wrong" }), /Invalid order link token/);
  assert.throws(() => verifyRedeemTokenHash({ expectedHash: "", providedToken: token }), /does not support Telegram linking/);
}

testParseOrderStartPayload();
testDeepLinkBuilder();
testRedeemTokenHashVerification();

console.log("telegram-site-orders tests passed");
