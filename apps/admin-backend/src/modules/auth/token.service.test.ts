import assert from "node:assert/strict";
import test from "node:test";

process.env.APP_URL ||= "https://gptishka.shop";
process.env.ADMIN_UI_URL ||= "https://admin.gptishka.shop";
process.env.DATABASE_URL ||= "postgresql://user:password@localhost:5432/gptishka_test";
process.env.JWT_ACCESS_SECRET ||= "test_access_secret_at_least_16_chars";
process.env.JWT_REFRESH_SECRET ||= "test_refresh_secret_at_least_16_chars";

test("signRefreshToken includes a unique token id", async () => {
  const { signRefreshToken, verifyRefreshToken } = await import("./token.service");

  const first = signRefreshToken("user_1");
  const second = signRefreshToken("user_1");

  assert.notEqual(first, second);
  assert.match(verifyRefreshToken(first).jti || "", /^[0-9a-f-]{36}$/i);
  assert.match(verifyRefreshToken(second).jti || "", /^[0-9a-f-]{36}$/i);
});
