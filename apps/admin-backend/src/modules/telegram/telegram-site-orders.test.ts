import assert from "node:assert/strict";
import {
  buildTelegramOrderLinkProof,
  buildSiteOrderTelegramDeepLink,
  normalizeTelegramIdForOrder,
  parseSiteOrderStartPayload,
  sha256Hex,
  verifyRedeemTokenHash,
  verifyTelegramOrderLinkProof,
} from "../orders/telegram-order-linking";

const orderId = "cmqjs5sbe000x9nw4696b343m";

function testParseOrderStartPayload() {
  assert.deepEqual(parseSiteOrderStartPayload("order_cmqjs5sbe000x9nw4696b343m_abcDEF_1234567890"), {
    orderId,
    orderToken: "abcDEF_1234567890",
  });
  assert.deepEqual(parseSiteOrderStartPayload(`o_${orderId}_${"a".repeat(32)}`), {
    orderId,
    orderToken: "a".repeat(32),
  });
  assert.equal(parseSiteOrderStartPayload("login_abc"), null);
  assert.equal(parseSiteOrderStartPayload("order_only"), null);
  assert.equal(parseSiteOrderStartPayload(`o_${orderId}_${"a".repeat(33)}`), null);
  assert.equal(parseSiteOrderStartPayload(`o_${orderId}_${"a".repeat(31)}+`), null);
  assert.equal(parseSiteOrderStartPayload(`order_${orderId}_${"a".repeat(33)}`), null);
  assert.equal(parseSiteOrderStartPayload(`order_${orderId}_${"a".repeat(64)}`), null);
}

function testDeepLinkBuilder() {
  const orderToken = "safe_order_token";
  const link = buildSiteOrderTelegramDeepLink({
    botUsername: "@GPTishka_myBot",
    orderId,
    orderToken,
  });
  const startPayload = new URL(link).searchParams.get("start");
  const expectedProof = buildTelegramOrderLinkProof({
    orderId,
    redeemTokenHash: sha256Hex(orderToken),
  });

  assert.equal(link, `https://t.me/GPTishka_myBot?start=o_${orderId}_${expectedProof}`);
  assert.ok(startPayload);
  assert.ok(startPayload.length <= 64);
  assert.match(startPayload, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(parseSiteOrderStartPayload(startPayload), {
    orderId,
    orderToken: expectedProof,
  });
  assert.equal(
    buildSiteOrderTelegramDeepLink({
      botUsername: "",
      orderId,
      orderToken: "secret_token",
    }),
    ""
  );
  assert.equal(
    buildSiteOrderTelegramDeepLink({
      botUsername: "GPTishka_myBot",
      orderId: "bad/order",
      orderToken: "secret_token",
    }),
    ""
  );
  assert.equal(
    buildSiteOrderTelegramDeepLink({
      botUsername: "GPTishka_myBot",
      orderId: "123456789012345678901234567890",
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
  assert.throws(() => verifyRedeemTokenHash({ expectedHash: "not-a-hash", providedToken: token }), /does not support Telegram linking/);
  assert.throws(() => verifyRedeemTokenHash({ expectedHash: hash, providedToken: "" }), /Order link token is required/);
}

function testTelegramOrderLinkProofVerification() {
  const redeemTokenHash = sha256Hex("safe_order_token");
  const proof = buildTelegramOrderLinkProof({ orderId, redeemTokenHash });

  assert.equal(proof.length, 32);
  assert.match(proof, /^[A-Za-z0-9_-]{32}$/);
  assert.doesNotThrow(() => verifyTelegramOrderLinkProof({ orderId, redeemTokenHash, providedProof: proof }));
  assert.throws(
    () => verifyTelegramOrderLinkProof({ orderId, redeemTokenHash, providedProof: "b".repeat(32) }),
    /Invalid order link token/
  );
  assert.throws(
    () => verifyTelegramOrderLinkProof({ orderId, redeemTokenHash: "", providedProof: proof }),
    /does not support Telegram linking/
  );
  assert.throws(
    () => verifyTelegramOrderLinkProof({ orderId, redeemTokenHash, providedProof: "" }),
    /Order link token is required/
  );
}

function testTelegramIdNormalization() {
  assert.equal(normalizeTelegramIdForOrder(" 123 "), "123");
  assert.equal(normalizeTelegramIdForOrder("-100123"), "-100123");
  assert.throws(() => normalizeTelegramIdForOrder(""), /Telegram user id is required/);
}

testParseOrderStartPayload();
testDeepLinkBuilder();
testRedeemTokenHashVerification();
testTelegramOrderLinkProofVerification();
testTelegramIdNormalization();

console.log("telegram-site-orders tests passed");
