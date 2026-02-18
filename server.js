const express = require("express");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const PORT = Number(process.env.PORT || 3000);
const ONLINE_TTL_SECONDS = Number(process.env.ONLINE_TTL_SECONDS || 45);
const ONLINE_TTL_MS = ONLINE_TTL_SECONDS * 1000;
const ADMIN_BACKEND_URL = String(process.env.ADMIN_BACKEND_URL || "http://localhost:4100").replace(/\/$/, "");
const SEED_DEMO_STATS = String(
  process.env.SEED_DEMO_STATS || (String(process.env.NODE_ENV || "").toLowerCase() === "production" ? "false" : "true")
).toLowerCase() === "true";
const IS_PRODUCTION = String(process.env.NODE_ENV || "").toLowerCase() === "production";

const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "stats.sqlite");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db;

function createDb() {
  return new sqlite3.Database(dbPath);
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function maskEmail(email) {
  const atIndex = email.indexOf("@");
  if (atIndex <= 1) return "***" + email.slice(atIndex);

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  const first = local[0];
  const last = local[local.length - 1];
  return `${first}***${last}${domain}`;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function logInfo(message) {
  process.stdout.write(`[storefront] ${message}\n`);
}

function logError(message, error) {
  const suffix = error && error.message ? `: ${error.message}` : "";
  process.stderr.write(`[storefront] ${message}${suffix}\n`);
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS online_sessions (
      session_id TEXT PRIMARY KEY,
      path TEXT,
      last_seen INTEGER NOT NULL
    )
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_purchases_created_at
    ON purchases (created_at DESC)
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_online_last_seen
    ON online_sessions (last_seen)
  `);
}

async function seedDemoDataIfEmpty() {
  const demoEmails = [
    "alexz@gmail.com",
    "markov@mail.ru",
    "danik@yandex.ru",
    "natalia.petrova@gmail.com",
    "ivank@outlook.com",
    "sergey1989@mail.ru",
    "lisa.dev@gmail.com",
    "michael.jackson@mail.com",
    "olga@proton.me",
    "dmitryk@yandex.ru",
    "anna.z@example.com",
    "romanv@mail.ru",
    "kate.williams@gmail.com",
    "pavel.sidorov@mail.ru",
    "denis.kim@yandex.ru",
    "sofia.lee@outlook.com",
    "egor.petrov@gmail.com",
    "maria.novikova@mail.ru",
  ];

  const minDemoSales = 45;
  const minDemoOnline = 12;

  const salesRow = await get("SELECT COUNT(*) AS count FROM purchases");
  const salesCount = Number(salesRow?.count || 0);
  const missingSales = Math.max(0, minDemoSales - salesCount);

  for (let i = 0; i < missingSales; i += 1) {
    const email = demoEmails[(salesCount + i) % demoEmails.length];
    await run(
      "INSERT INTO purchases (email, created_at) VALUES (?, datetime('now', ?))",
      [email, `-${(i + 1) * 7} minutes`]
    );
  }

  const cutoff = Date.now() - ONLINE_TTL_MS;
  await run("DELETE FROM online_sessions WHERE last_seen < ?", [cutoff]);

  const onlineRow = await get("SELECT COUNT(*) AS count FROM online_sessions");
  const onlineCount = Number(onlineRow?.count || 0);
  const missingOnline = Math.max(0, minDemoOnline - onlineCount);

  const now = Date.now();
  for (let i = 1; i <= missingOnline; i += 1) {
    await run(
      "INSERT OR REPLACE INTO online_sessions (session_id, path, last_seen) VALUES (?, ?, ?)",
      [`demo-online-${i}`, "/en/index.html", now - i * 3000]
    );
  }
}

function createApp() {
  const app = express();
  const notFoundPagePath = path.join(__dirname, "404.html");
  const errorPagePath = path.join(__dirname, "500.html");

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  if (IS_PRODUCTION) {
    app.use((req, res, next) => {
      const forwardedProto = String(req.headers["x-forwarded-proto"] || "").toLowerCase();
      const host = String(req.headers.host || "");
      if (host && forwardedProto && forwardedProto !== "https") {
        return res.redirect(301, `https://${host}${req.originalUrl}`);
      }
      return next();
    });
  }

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );
  app.use(compression());
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 200,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );
  app.use(express.json({ limit: "256kb" }));
  app.use(
    express.static(__dirname, {
      dotfiles: "ignore",
      index: false,
      etag: true,
      maxAge: IS_PRODUCTION ? "7d" : 0,
      setHeaders: (res, filePath) => {
        if (/\.(html?)$/i.test(filePath)) {
          res.setHeader("Cache-Control", "no-store");
        }
      },
    })
  );

  async function proxyToAdminBackend(req, res, targetPath) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const targetUrl = `${ADMIN_BACKEND_URL}${targetPath}`;
      const headers = {
        Accept: req.headers.accept || "application/json",
      };

      if (req.headers.authorization) {
        headers.Authorization = req.headers.authorization;
      }
      if (req.headers.cookie) {
        headers.Cookie = req.headers.cookie;
      }
      if (req.headers["content-type"]) {
        headers["Content-Type"] = req.headers["content-type"];
      }

      const method = String(req.method || "GET").toUpperCase();
      const response = await fetch(targetUrl, {
        method,
        headers,
        body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(req.body || {}),
        signal: controller.signal,
      });
      const body = await response.text();
      clearTimeout(timeout);

      const contentType = response.headers.get("content-type");
      if (contentType) {
        res.setHeader("Content-Type", contentType);
      }

      const setCookie = response.headers.get("set-cookie");
      if (setCookie) {
        res.setHeader("set-cookie", setCookie);
      }

      return res.status(response.status).send(body);
    } catch (_) {
      clearTimeout(timeout);
      return res.status(502).json({ error: "Admin API unavailable" });
    }
  }

  app.use("/api/admin", async (req, res) => {
    const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    const basePath = `/api/admin${req.path}`;
    return proxyToAdminBackend(req, res, `${basePath}${query}`);
  });

  app.post("/api/heartbeat", async (req, res) => {
    const sessionId = String(req.body?.sessionId || "").trim();
    const currentPath = String(req.body?.path || "").trim().slice(0, 200);

    if (!sessionId || sessionId.length > 120) {
      return res.status(400).json({ error: "Invalid sessionId" });
    }

    const now = Date.now();
    try {
      await run(
        `
        INSERT INTO online_sessions (session_id, path, last_seen)
        VALUES (?, ?, ?)
        ON CONFLICT(session_id)
        DO UPDATE SET path = excluded.path, last_seen = excluded.last_seen
        `,
        [sessionId, currentPath, now]
      );
      res.json({ ok: true });
    } catch (_error) {
      res.status(500).json({ error: "Failed to update heartbeat" });
    }
  });

  app.post("/api/purchases", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email" });
    }

    try {
      const result = await run(
        "INSERT INTO purchases (email, created_at) VALUES (?, datetime('now'))",
        [email]
      );
      res.status(201).json({
        id: result.lastID,
        email: maskEmail(email),
      });
    } catch (_) {
      res.status(500).json({ error: "Failed to create purchase" });
    }
  });


  app.get("/api/public/products", async (req, res) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const lang = String(req.query?.lang || "ru").toLowerCase().startsWith("en") ? "en" : "ru";

    try {
      const response = await fetch(`${ADMIN_BACKEND_URL}/api/public/products?lang=${lang}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      if (!response.ok) {
        clearTimeout(timeout);
        return res.status(502).json({ error: "Failed to load products from admin backend" });
      }

      const payload = await response.json();
      clearTimeout(timeout);
      return res.json(payload);
    } catch (_) {
      clearTimeout(timeout);
      return res.status(502).json({ error: "Products API unavailable" });
    }
  });

  app.post("/api/public/create-order", async (req, res) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(`${ADMIN_BACKEND_URL}/api/public/create-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(req.body || {}),
        signal: controller.signal,
      });

      const body = await response.text();
      clearTimeout(timeout);

      if (!response.ok) {
        return res.status(response.status).type("application/json").send(body || JSON.stringify({ error: "Order create failed" }));
      }

      return res.status(response.status).type("application/json").send(body);
    } catch (_) {
      clearTimeout(timeout);
      return res.status(502).json({ error: "Order API unavailable" });
    }
  });

  app.post("/create-order", async (req, res) => {
    return res.redirect(307, "/api/public/create-order");
  });

  app.post("/api/orders/create", async (req, res) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(`${ADMIN_BACKEND_URL}/api/public/orders/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(req.body || {}),
        signal: controller.signal,
      });

      const body = await response.text();
      clearTimeout(timeout);

      if (!response.ok) {
        return res.status(response.status).type("application/json").send(body || JSON.stringify({ error: "Order create failed" }));
      }

      return res.status(response.status).type("application/json").send(body);
    } catch (_) {
      clearTimeout(timeout);
      return res.status(502).json({ error: "Order API unavailable" });
    }
  });

  app.post("/api/promo/validate", async (req, res) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(`${ADMIN_BACKEND_URL}/api/promo/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(req.body || {}),
        signal: controller.signal,
      });

      const body = await response.text();
      clearTimeout(timeout);

      if (!response.ok) {
        return res.status(response.status).type("application/json").send(body || JSON.stringify({ error: "Promo validate failed" }));
      }

      return res.status(response.status).type("application/json").send(body);
    } catch (_) {
      clearTimeout(timeout);
      return res.status(502).json({ error: "Promo API unavailable" });
    }
  });

  app.post("/api/payments/enot/create", async (req, res) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(`${ADMIN_BACKEND_URL}/api/payments/enot/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(req.body || {}),
        signal: controller.signal,
      });

      const body = await response.text();
      clearTimeout(timeout);

      if (!response.ok) {
        return res.status(response.status).type("application/json").send(body || JSON.stringify({ error: "Payment create failed" }));
      }

      return res.status(response.status).type("application/json").send(body);
    } catch (_) {
      clearTimeout(timeout);
      return res.status(502).json({ error: "Payment API unavailable" });
    }
  });

  app.get("/api/orders/:orderId", async (req, res) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const orderId = encodeURIComponent(String(req.params.orderId || "").trim());
      const response = await fetch(`${ADMIN_BACKEND_URL}/api/orders/${orderId}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      const body = await response.text();
      clearTimeout(timeout);

      if (!response.ok) {
        return res.status(response.status).type("application/json").send(body || JSON.stringify({ error: "Order status failed" }));
      }

      return res.status(response.status).type("application/json").send(body);
    } catch (_) {
      clearTimeout(timeout);
      return res.status(502).json({ error: "Order API unavailable" });
    }
  });

  app.get("/api/orders/:orderId/reconcile", async (req, res) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const orderId = encodeURIComponent(String(req.params.orderId || "").trim());
      const response = await fetch(`${ADMIN_BACKEND_URL}/api/orders/${orderId}/reconcile`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      const body = await response.text();
      clearTimeout(timeout);

      if (!response.ok) {
        return res.status(response.status).type("application/json").send(body || JSON.stringify({ error: "Order reconcile failed" }));
      }

      return res.status(response.status).type("application/json").send(body);
    } catch (_) {
      clearTimeout(timeout);
      return res.status(502).json({ error: "Order API unavailable" });
    }
  });

  app.get("/api/orders/:orderId/activation", async (req, res) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const orderId = encodeURIComponent(String(req.params.orderId || "").trim());
      const qs = String(req.url || "").includes("?") ? String(req.url || "").split("?")[1] : "";
      const suffix = qs ? `?${qs}` : "";
      const response = await fetch(`${ADMIN_BACKEND_URL}/api/orders/${orderId}/activation${suffix}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      const body = await response.text();
      clearTimeout(timeout);
      if (!response.ok) {
        return res.status(response.status).type("application/json").send(body || JSON.stringify({ error: "Activation fetch failed" }));
      }
      return res.status(response.status).type("application/json").send(body);
    } catch (_) {
      clearTimeout(timeout);
      return res.status(502).json({ error: "Order API unavailable" });
    }
  });

  app.post("/api/orders/:orderId/activation/validate-token", async (req, res) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const orderId = encodeURIComponent(String(req.params.orderId || "").trim());
      const qs = String(req.url || "").includes("?") ? String(req.url || "").split("?")[1] : "";
      const suffix = qs ? `?${qs}` : "";
      const response = await fetch(`${ADMIN_BACKEND_URL}/api/orders/${orderId}/activation/validate-token${suffix}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(req.body || {}),
        signal: controller.signal,
      });
      const body = await response.text();
      clearTimeout(timeout);
      if (!response.ok) {
        return res.status(response.status).type("application/json").send(body || JSON.stringify({ error: "Activation validate failed" }));
      }
      return res.status(response.status).type("application/json").send(body);
    } catch (_) {
      clearTimeout(timeout);
      return res.status(502).json({ error: "Order API unavailable" });
    }
  });

  app.post("/api/orders/:orderId/activation/start", async (req, res) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const orderId = encodeURIComponent(String(req.params.orderId || "").trim());
      const qs = String(req.url || "").includes("?") ? String(req.url || "").split("?")[1] : "";
      const suffix = qs ? `?${qs}` : "";
      const response = await fetch(`${ADMIN_BACKEND_URL}/api/orders/${orderId}/activation/start${suffix}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(req.body || {}),
        signal: controller.signal,
      });
      const body = await response.text();
      clearTimeout(timeout);
      if (!response.ok) {
        return res.status(response.status).type("application/json").send(body || JSON.stringify({ error: "Activation start failed" }));
      }
      return res.status(response.status).type("application/json").send(body);
    } catch (_) {
      clearTimeout(timeout);
      return res.status(502).json({ error: "Order API unavailable" });
    }
  });

  app.post("/api/orders/:orderId/activation/restart-with-new-key", async (req, res) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const orderId = encodeURIComponent(String(req.params.orderId || "").trim());
      const qs = String(req.url || "").includes("?") ? String(req.url || "").split("?")[1] : "";
      const suffix = qs ? `?${qs}` : "";
      const response = await fetch(`${ADMIN_BACKEND_URL}/api/orders/${orderId}/activation/restart-with-new-key${suffix}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(req.body || {}),
        signal: controller.signal,
      });
      const body = await response.text();
      clearTimeout(timeout);
      if (!response.ok) {
        return res.status(response.status).type("application/json").send(body || JSON.stringify({ error: "Activation restart failed" }));
      }
      return res.status(response.status).type("application/json").send(body);
    } catch (_) {
      clearTimeout(timeout);
      return res.status(502).json({ error: "Order API unavailable" });
    }
  });

  app.get("/api/orders/:orderId/activation/task/:taskId", async (req, res) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const orderId = encodeURIComponent(String(req.params.orderId || "").trim());
      const taskId = encodeURIComponent(String(req.params.taskId || "").trim());
      const qs = String(req.url || "").includes("?") ? String(req.url || "").split("?")[1] : "";
      const suffix = qs ? `?${qs}` : "";
      const response = await fetch(`${ADMIN_BACKEND_URL}/api/orders/${orderId}/activation/task/${taskId}${suffix}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      const body = await response.text();
      clearTimeout(timeout);
      if (!response.ok) {
        return res.status(response.status).type("application/json").send(body || JSON.stringify({ error: "Activation task fetch failed" }));
      }
      return res.status(response.status).type("application/json").send(body);
    } catch (_) {
      clearTimeout(timeout);
      return res.status(502).json({ error: "Order API unavailable" });
    }
  });
  app.get("/api/stats", async (_req, res) => {
    const cutoff = Date.now() - ONLINE_TTL_MS;

    try {
      await run("DELETE FROM online_sessions WHERE last_seen < ?", [cutoff]);

      const salesRow = await get("SELECT COUNT(*) AS sales FROM purchases");
      const onlineRow = await get("SELECT COUNT(*) AS online FROM online_sessions");
      const buyerRows = await all(
        "SELECT email FROM purchases ORDER BY datetime(created_at) DESC LIMIT 12"
      );

      res.json({
        sales: Number(salesRow?.sales || 0),
        online: Number(onlineRow?.online || 0),
        lastBuyers: buyerRows.map(row => maskEmail(row.email)),
      });
    } catch (_) {
      res.status(500).json({ error: "Failed to load stats" });
    }
  });

  app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
  });

  app.get("/en", (_req, res) => {
    res.sendFile(path.join(__dirname, "en", "index.html"));
  });

  app.get("/admin", (_req, res) => {
    res.sendFile(path.join(__dirname, "admin", "index.html"));
  });

  app.get("/admin/*", (req, res, next) => {
    if (path.extname(req.path)) {
      return next();
    }
    return res.sendFile(path.join(__dirname, "admin", "index.html"));
  });

  app.use((req, res) => {
    if (req.path.startsWith("/api/")) {
      return res.status(404).json({ error: "Not found" });
    }

    if (fs.existsSync(notFoundPagePath)) {
      return res.status(404).sendFile(notFoundPagePath);
    }

    return res.status(404).send("Not found");
  });

  app.use((error, req, res, _next) => {
    logError(`Unhandled error on ${req.method} ${req.originalUrl}`, error);

    if (req.path.startsWith("/api/")) {
      return res.status(500).json({ error: "Internal server error" });
    }

    if (fs.existsSync(errorPagePath)) {
      return res.status(500).sendFile(errorPagePath);
    }

    return res.status(500).send("Internal server error");
  });

  return app;
}

async function startServer(port = PORT) {
  db = createDb();
  await initDb();
  if (SEED_DEMO_STATS) {
    await seedDemoDataIfEmpty();
  }
  const app = createApp();

  return new Promise(resolve => {
    const server = app.listen(port, () => resolve(server));
  });
}

if (require.main === module) {
  startServer()
    .then(() => {
      logInfo(`Server started on port ${PORT}`);
    })
    .catch(error => {
      logError("Failed to start server", error);
      process.exit(1);
    });
}

module.exports = { startServer };



