import assert from "node:assert/strict";
import {
  buildTelegramOrderLinkProof,
  buildSiteOrderTelegramDeepLink,
  isCompactTelegramOrderPayload,
  isLegacyTelegramOrderPayload,
  normalizeTelegramIdForOrder,
  parseSiteOrderStartPayload,
  sha256Hex,
  verifyRedeemTokenHash,
  verifyTelegramOrderLinkProof,
} from "../orders/telegram-order-linking";

const orderId = "cmqjs5sbe000x9nw4696b343m";

function testParseOrderStartPayload() {
  const legacyPayload = parseSiteOrderStartPayload("order_cmqjs5sbe000x9nw4696b343m_abcDEF_1234567890");
  const compactPayload = parseSiteOrderStartPayload(`o_${orderId}_${"a".repeat(32)}`);

  assert.deepEqual(legacyPayload, {
    kind: "legacy-token",
    orderId,
    orderToken: "abcDEF_1234567890",
  });
  assert.deepEqual(compactPayload, {
    kind: "compact-proof",
    orderId,
    proof: "a".repeat(32),
  });
  assert.equal(isLegacyTelegramOrderPayload(legacyPayload), true);
  assert.equal(isCompactTelegramOrderPayload(legacyPayload), false);
  assert.equal(isCompactTelegramOrderPayload(compactPayload), true);
  assert.equal(isLegacyTelegramOrderPayload(compactPayload), false);
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
    kind: "compact-proof",
    orderId,
    proof: expectedProof,
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
  const wrongOrderId = "cmqjs5sbe000x9nw4696b343n";
  const wrongRedeemTokenHash = sha256Hex("other_order_token");

  assert.equal(proof.length, 32);
  assert.match(proof, /^[A-Za-z0-9_-]{32}$/);
  assert.doesNotThrow(() => verifyTelegramOrderLinkProof({ orderId, redeemTokenHash, providedProof: proof }));
  assert.throws(
    () => verifyTelegramOrderLinkProof({ orderId: "", redeemTokenHash, providedProof: proof }),
    /Invalid order link token/
  );
  assert.throws(
    () => verifyTelegramOrderLinkProof({ orderId: wrongOrderId, redeemTokenHash, providedProof: proof }),
    /Invalid order link token/
  );
  assert.throws(
    () => verifyTelegramOrderLinkProof({ orderId, redeemTokenHash: wrongRedeemTokenHash, providedProof: proof }),
    /Invalid order link token/
  );
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
