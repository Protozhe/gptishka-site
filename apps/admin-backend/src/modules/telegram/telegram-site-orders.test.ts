import assert from "node:assert/strict";
import {
  buildTelegramLinkedOrderText,
  buildTelegramOrderDetailsText,
  buildTelegramOrdersText,
} from "./telegram-order-messages";
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

function testTelegramOrdersTextIncludesFullPaidOrderSummary() {
  const text = buildTelegramOrdersText([
    {
      id: orderId,
      status: "paid",
      productTitle: "ChatGPT Plus",
      amount: 1990,
      currency: "RUB",
      promoCode: "SUMMER10",
      deliveryType: "support_claude",
      activationStatus: "waiting_for_token",
      paidAt: "2026-06-21T10:30:00.000Z",
    },
  ]);

  assert.match(text, /Мои покупки GPTishka/);
  assert.match(text, /ChatGPT Plus/);
  assert.match(text, new RegExp(orderId));
  assert.match(text, /Статус: оплачен/);
  assert.match(text, /Сумма: 1990 RUB/);
  assert.match(text, /Промокод: SUMMER10/);
  assert.match(text, /Доставка: активация Claude через поддержку/);
  assert.match(text, /Активация: ожидает токен входа/);
  assert.match(text, /Оплачен: 21\.06\.2026, 13:30/);
  assert.match(text, new RegExp(`/check ${orderId}`));
}

function testTelegramOrdersTextUsesCreatedDateForUnpaidOrder() {
  const text = buildTelegramOrdersText([
    {
      id: "created-order-1",
      status: "unpaid",
      productTitle: "Claude Pro",
      amount: 29.99,
      currency: "USD",
      deliveryType: "activation",
      activationStatus: "pending",
      createdAt: "2026-06-21T09:00:00.000Z",
    },
  ]);

  assert.match(text, /Claude Pro/);
  assert.match(text, /Заказ: created-order-1/);
  assert.match(text, /Статус: не оплачен/);
  assert.match(text, /Сумма: 29\.99 USD/);
  assert.match(text, /Доставка: автоматическая активация/);
  assert.match(text, /Активация: ожидает обработки/);
  assert.match(text, /Создан: 21\.06\.2026, 12:00/);
  assert.doesNotMatch(text, /\/check created-order-1/);
}

function testTelegramLinkedOrderTextIncludesCheckForPaidOrder() {
  const text = buildTelegramLinkedOrderText({
    id: orderId,
    status: "paid",
    productTitle: "ChatGPT Plus",
  });

  assert.match(text, /Заказ привязан/);
  assert.match(text, new RegExp(`/check ${orderId}`));
}

function testTelegramVpnOrderDetailsText() {
  const text = buildTelegramOrderDetailsText({
    order: {
      id: orderId,
      status: "paid",
      productTitle: "VPN",
    },
    activation: {
      deliveryMode: "vpn",
      plan: "30 дней",
      accessLink: "vless://example",
      deeplinkUrl: "vpn://open",
      expiresAt: "2026-07-21T10:30:00.000Z",
    },
  });

  assert.match(text, /Данные VPN-доступа/);
  assert.match(text, /План: 30 дней/);
  assert.match(text, /Действует до: 21\.07\.2026, 13:30/);
  assert.match(text, /vless:\/\/example/);
  assert.match(text, /vpn:\/\/open/);
  assert.match(text, new RegExp(`/check ${orderId}`));
}

function testTelegramEmptyOrdersText() {
  const text = buildTelegramOrdersText([]);

  assert.match(text, /покупок пока нет/i);
  assert.match(text, /Telegram-ссылку/i);
}

function testTelegramUnpaidOrderDetailsText() {
  const text = buildTelegramOrderDetailsText({
    order: {
      id: orderId,
      status: "unpaid",
      productTitle: "ChatGPT Plus",
    },
  });

  assert.match(text, /Заказ пока не оплачен/);
  assert.match(text, /\/orders/);
}

function testTelegramCredentialsOrderDetailsText() {
  const text = buildTelegramOrderDetailsText({
    order: {
      id: orderId,
      status: "paid",
      productTitle: "ChatGPT Plus",
    },
    activation: {
      deliveryMode: "credentials",
      status: "credentials_ready",
      credentials: {
        login: "user@example.com",
        password: "secret-password",
      },
    },
  });

  assert.match(text, /Данные для входа/);
  assert.match(text, /Логин: user@example\.com/);
  assert.match(text, /Пароль: secret-password/);
}

function testTelegramManualLoginOrderDetailsText() {
  const text = buildTelegramOrderDetailsText({
    order: {
      id: orderId,
      status: "paid",
      productTitle: "Claude Pro",
    },
    activation: {
      deliveryMode: "manual_login",
      status: "pending_manual",
      message: "Проверим доступ вручную",
    },
  });

  assert.match(text, /Менеджер обработает доступ вручную/);
  assert.match(text, /Статус активации: ожидает ручной обработки/);
  assert.match(text, /Проверим доступ вручную/);
}

function testTelegramActivationOrderDetailsText() {
  const text = buildTelegramOrderDetailsText({
    order: {
      id: orderId,
      status: "paid",
      productTitle: "ChatGPT Plus",
    },
    activation: {
      activationFlow: "token",
      status: "waiting_for_token",
      verificationState: "pending",
      lastProviderMessage: "Нужен токен входа",
    },
  });

  assert.match(text, /Статус активации: ожидает токен входа/);
  assert.match(text, /Проверка: ожидает проверки/);
  assert.match(text, /Сообщение провайдера: Нужен токен входа/);
  assert.match(text, new RegExp(`/token ${orderId} <токен>`));
}

function testTelegramSupportOrderDetailsText() {
  const text = buildTelegramOrderDetailsText({
    order: {
      id: orderId,
      status: "paid",
      productTitle: "Claude Pro",
    },
    activation: {
      deliveryMode: "support",
      activationFlow: "support",
      status: "running",
      verificationState: "failed",
      supportUrl: "https://support.example",
    },
  });

  assert.match(text, /Статус активации: выполняется/);
  assert.match(text, /Проверка: проверка не прошла/);
  assert.match(text, /https:\/\/support\.example/);
  assert.match(text, /обратитесь в поддержку/);
}

function testTelegramKnownLabelsDoNotExposeInternalValues() {
  const text = buildTelegramOrdersText([
    {
      id: "activation-order",
      status: "completed",
      productTitle: "Activation",
      deliveryType: "activation",
      activationStatus: "completed",
    },
    {
      id: "vpn-order",
      status: "error",
      productTitle: "VPN",
      deliveryType: "vpn",
      activationStatus: "vpn_ready",
    },
    {
      id: "credentials-order",
      status: "failed",
      productTitle: "Credentials",
      deliveryType: "credentials",
      activationStatus: "credentials_ready",
    },
    {
      id: "manual-order",
      status: "pending",
      productTitle: "Manual",
      deliveryType: "manual_login",
      activationStatus: "pending_manual",
    },
    {
      id: "support-order",
      status: "running",
      productTitle: "Support",
      deliveryType: "support",
      activationStatus: "running",
    },
    {
      id: "support-claude-order",
      status: "paid",
      productTitle: "Support Claude",
      deliveryType: "support_claude",
      activationStatus: "waiting_for_token",
    },
    {
      id: "no-login-order",
      status: "unpaid",
      productTitle: "No Login",
      deliveryType: "no_login",
      activationStatus: "paid",
    },
    {
      id: "with-login-order",
      status: "new",
      productTitle: "With Login",
      deliveryType: "with_login",
      activationStatus: "error",
    },
  ]);

  assert.match(text, /Доставка: автоматическая активация/);
  assert.match(text, /Доставка: VPN-доступ/);
  assert.match(text, /Доставка: логин и пароль/);
  assert.match(text, /Доставка: ручная обработка менеджером/);
  assert.match(text, /Доставка: через поддержку/);
  assert.match(text, /Доставка: активация Claude через поддержку/);
  assert.match(text, /Доставка: без передачи логина/);
  assert.match(text, /Доставка: с логином пользователя/);
  assert.match(text, /Активация: VPN готов/);
  assert.match(text, /Активация: данные для входа готовы/);
  assert.match(text, /Активация: ожидает ручной обработки/);
  assert.match(text, /Активация: выполняется/);
  assert.doesNotMatch(
    text,
    /\b(waiting_for_token|credentials_ready|pending_manual|vpn_ready|manual_login|support_claude|no_login|with_login)\b/
  );
}

testParseOrderStartPayload();
testDeepLinkBuilder();
testRedeemTokenHashVerification();
testTelegramOrderLinkProofVerification();
testTelegramIdNormalization();
testTelegramOrdersTextIncludesFullPaidOrderSummary();
testTelegramOrdersTextUsesCreatedDateForUnpaidOrder();
testTelegramLinkedOrderTextIncludesCheckForPaidOrder();
testTelegramVpnOrderDetailsText();
testTelegramEmptyOrdersText();
testTelegramUnpaidOrderDetailsText();
testTelegramCredentialsOrderDetailsText();
testTelegramManualLoginOrderDetailsText();
testTelegramActivationOrderDetailsText();
testTelegramSupportOrderDetailsText();
testTelegramKnownLabelsDoNotExposeInternalValues();

console.log("telegram-site-orders tests passed");
