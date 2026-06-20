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
    ]) {
      const response = await fetch(`${baseUrl}${route}`);
      const body = await response.text();

      assert.equal(response.status, 200, route);
      assert.ok(body.includes(marker), route);
      assert.equal(response.headers.get("cache-control")?.includes("no-store"), true, route);
    }
  });
});
