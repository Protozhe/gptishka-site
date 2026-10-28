const assert = require("node:assert/strict");
const test = require("node:test");
const { startServer } = require("../server");

async function withServer(fn) {
  const server = await startServer(0);
  try {
    const { port } = server.address();
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test("service landing routes serve their dedicated static pages", async () => {
  await withServer(async (baseUrl) => {
    for (const [route, marker] of [
      ["/chatgpt", 'data-service-page="chatgpt"'],
      ["/claude", 'data-service-page="claude"'],
      ["/supergrok", 'data-service-page="grok"'],
      ["/suno", 'data-service-page="suno"'],
    ]) {
      const response = await fetch(`${baseUrl}${route}`);
      const body = await response.text();

      assert.equal(response.status, 200, route);
      assert.ok(body.includes(marker), route);
      assert.equal(response.headers.get("cache-control")?.includes("no-store"), true, route);
    }
  });
});

test("retired public VPN routes cannot accept new purchases", async () => {
  await withServer(async (baseUrl) => {
    for (const route of ["/store/vpn", "/store/vpn/", "/en/store/vpn", "/en/store/vpn/"]) {
      const response = await fetch(`${baseUrl}${route}`);
      const body = await response.text();

      assert.equal(response.status, 410, route);
      assert.equal(body, "Gone", route);
      assert.equal(response.headers.get("cache-control")?.includes("no-store"), true, route);
    }
  });
});

test("KYC and CVP payment POST returns open the protected RU/EN manager page", async () => {
  await withServer(async (baseUrl) => {
    for (const prefix of ["", "/en"]) {
      for (const product of ["kyc", "cvp"]) {
        const query = new URLSearchParams({
          order_id: `fixture-${product}-order`,
          t: "fixture+protected/link=token",
        });
        const route = `${prefix}/verification-support.html?${query}`;
        const response = await fetch(`${baseUrl}${route}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "status=success",
          redirect: "manual",
        });

        assert.equal(response.status, 303, route);
        assert.equal(response.headers.get("location"), route, "preserve the full protected order query");

        const page = await fetch(new URL(response.headers.get("location"), baseUrl));
        const html = await page.text();
        assert.equal(page.status, 200, route);
        assert.match(html, new RegExp(`<html lang="${prefix ? "en" : "ru"}">`));
        assert.match(html, /id="supportPaidDetails" hidden/, "a return alone cannot confirm payment");
        assert.match(html, /id="supportContact"/);
        assert.match(html, /\/assets\/js\/verification-support-receipt\.js/);
        assert.ok(page.headers.get("cache-control").includes("no-store"));
      }
    }

    // Browser return handling must not turn arbitrary POSTs into page loads.
    const unrelated = await fetch(`${baseUrl}/claude`, { method: "POST", redirect: "manual" });
    assert.equal(unrelated.status, 404);
  });
});
