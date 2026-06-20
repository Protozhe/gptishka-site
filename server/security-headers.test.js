const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  applyContentSecurityPolicy,
  buildCspHeader,
  getCspDirectivesForPath,
  getCspHeaderName,
} = require("./security-headers");

function withEnv(values, fn) {
  const previous = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    if (values[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(values)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

function applyCsp(pathname) {
  const headers = new Map();
  applyContentSecurityPolicy(
    { path: pathname },
    {
      setHeader(name, value) {
        headers.set(name, value);
      },
    },
    () => {}
  );
  return headers;
}

function inlineScriptHashes(filePath) {
  const html = fs.readFileSync(filePath, "utf8");
  return [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(source => source.trim())
    .map(source => `'sha256-${crypto.createHash("sha256").update(source).digest("base64")}'`);
}

function adminIndexHtml() {
  return fs.readFileSync(path.join(__dirname, "..", "apps", "admin-ui", "index.html"), "utf8");
}

function adminMetaCspContent() {
  const match = adminIndexHtml().match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);
  return match ? match[1] : "";
}

test("getCspHeaderName defaults to report-only", () => {
  assert.equal(getCspHeaderName({ reportOnly: true }), "Content-Security-Policy-Report-Only");
  assert.equal(getCspHeaderName({ reportOnly: false }), "Content-Security-Policy");
});

test("CSP_REPORT_ONLY only disables report-only for explicit false values", () => {
  for (const value of [undefined, "", "true", "1", "yes", "maybe", "treu"]) {
    withEnv({ CSP_REPORT_ONLY: value }, () => {
      const headers = applyCsp("/");
      assert.ok(headers.has("Content-Security-Policy-Report-Only"), String(value));
      assert.equal(headers.has("Content-Security-Policy"), false, String(value));
    });
  }

  for (const value of ["false", "0", "no", "FALSE", " No "]) {
    withEnv({ CSP_REPORT_ONLY: value }, () => {
      const headers = applyCsp("/");
      assert.ok(headers.has("Content-Security-Policy"), value);
      assert.equal(headers.has("Content-Security-Policy-Report-Only"), false, value);
    });
  }
});

test("connect-src only uses explicit browser origins and filters non-https origins in production", () => {
  withEnv(
    {
      NODE_ENV: "production",
      CSP_CONNECT_SRC_ORIGINS: "https://api.example.com, http://localhost:4100, https://admin.example.com/path",
      ADMIN_BACKEND_URL: "http://127.0.0.1:4100",
      API_URL: "http://10.0.0.5:4100",
    },
    () => {
      const directives = getCspDirectivesForPath("/admin");
      assert.ok(directives["connect-src"].includes("https://api.example.com"));
      assert.ok(directives["connect-src"].includes("https://admin.example.com"));
      assert.equal(directives["connect-src"].includes("http://localhost:4100"), false);
      assert.equal(directives["connect-src"].includes("http://127.0.0.1:4100"), false);
      assert.equal(directives["connect-src"].includes("http://10.0.0.5:4100"), false);
    }
  );
});

test("admin csp only applies to /admin and nested admin paths", () => {
  assert.equal(getCspDirectivesForPath("/admin")["form-action"][0], "'self'");
  assert.equal(getCspDirectivesForPath("/admin/users")["form-action"][0], "'self'");
  assert.equal(getCspDirectivesForPath("/Admin")["script-src"].includes("'unsafe-inline'"), false);
  assert.equal(getCspDirectivesForPath("/ADMIN/users")["script-src"].includes("'unsafe-inline'"), false);
  assert.ok(getCspDirectivesForPath("/administrator")["script-src"].includes("'unsafe-inline'"));
});

test("admin csp is stricter than storefront csp", () => {
  const admin = getCspDirectivesForPath("/admin/");
  const storefront = getCspDirectivesForPath("/");
  assert.deepEqual(admin["default-src"], ["'self'"]);
  assert.ok(admin["script-src"].includes("'self'"));
  assert.equal(admin["script-src"].includes("'unsafe-inline'"), false);
  assert.ok(storefront["media-src"].includes("data:"));
});

test("admin csp allows current external and hashed inline assets without unsafe-inline scripts", () => {
  const admin = getCspDirectivesForPath("/admin");
  const hashes = inlineScriptHashes(path.join(__dirname, "..", "apps", "admin-ui", "index.html"));

  assert.equal(hashes.length, 2);
  for (const hash of hashes) {
    assert.ok(admin["script-src"].includes(hash), hash);
  }
  assert.equal(admin["script-src"].includes("'unsafe-inline'"), false);
  assert.ok(admin["script-src"].includes("https://top-fwz1.mail.ru"));
  assert.ok(admin["style-src"].includes("https://fonts.googleapis.com"));
  assert.ok(admin["font-src"].includes("https://fonts.gstatic.com"));
  assert.ok(admin["img-src"].includes("https://top-fwz1.mail.ru"));
});

test("admin static HTML includes CSP meta fallback before inline scripts", () => {
  const html = adminIndexHtml();
  const metaCsp = adminMetaCspContent();
  const firstScriptIndex = html.search(/<script\b/i);
  const metaIndex = html.search(/<meta\s+http-equiv="Content-Security-Policy"/i);
  const { "frame-ancestors": _frameAncestors, ...metaDirectives } = getCspDirectivesForPath("/admin");

  assert.ok(metaCsp, "missing admin CSP meta tag");
  assert.ok(metaIndex !== -1 && metaIndex < firstScriptIndex, "admin CSP meta must appear before scripts");
  assert.equal(metaCsp, buildCspHeader(metaDirectives));
  assert.equal(metaCsp.includes("frame-ancestors"), false);
  assert.equal(metaCsp.includes("'unsafe-inline'"), true);
  assert.equal(/script-src[^;]*'unsafe-inline'/.test(metaCsp), false);
});

test("storefront csp allows Google Fonts and YouTube embeds", () => {
  const storefront = getCspDirectivesForPath("/");
  assert.ok(storefront["style-src"].includes("https://fonts.googleapis.com"));
  assert.ok(storefront["font-src"].includes("https://fonts.gstatic.com"));
  assert.deepEqual(storefront["frame-src"], ["https://www.youtube.com"]);
});

test("buildCspHeader serializes directives", () => {
  const header = buildCspHeader({ "default-src": ["'self'"], "object-src": ["'none'"] });
  assert.equal(header, "default-src 'self'; object-src 'none'");
});
