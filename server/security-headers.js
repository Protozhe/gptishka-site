const ADMIN_INLINE_SCRIPT_HASHES = [
  "'sha256-0EmvM5Y5ElZ/IxI9dtvRnNeKZe8VZ8XPJGfovZ1vgng='",
  "'sha256-j/AzaJP4t+MaBTLn/KnjQJ2fP42g6/Q8LyxwMRUXL9k='",
];

function parseReportOnly(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["false", "0", "no"].includes(normalized)) return false;
  if (["true", "1", "yes"].includes(normalized)) return true;
  return fallback;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function configuredConnectOrigins() {
  const production = process.env.NODE_ENV === "production";
  return unique(
    String(process.env.CSP_CONNECT_SRC_ORIGINS || "")
      .split(",")
      .map(value => {
        try {
          const url = new URL(value.trim());
          if (!["http:", "https:"].includes(url.protocol)) return "";
          if (production && url.protocol !== "https:") return "";
          return url.origin;
        } catch {
          return "";
        }
      })
  );
}

function isAdminPath(pathname) {
  const path = String(pathname || "").toLowerCase();
  return path === "/admin" || path.startsWith("/admin/");
}

function getStorefrontDirectives() {
  const connectOrigins = configuredConnectOrigins();
  return {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "https://mc.yandex.ru", "https://top-fwz1.mail.ru"],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "media-src": ["'self'", "data:", "blob:"],
    "connect-src": ["'self'", ...connectOrigins, "https://mc.yandex.ru", "https://top-fwz1.mail.ru", "https://api.telegram.org"],
    "frame-src": ["https://www.youtube.com"],
    "form-action": ["'self'", "https:"],
    "upgrade-insecure-requests": [],
  };
}

function getAdminDirectives() {
  const connectOrigins = configuredConnectOrigins();
  return {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'self'"],
    "script-src": ["'self'", ...ADMIN_INLINE_SCRIPT_HASHES, "https://top-fwz1.mail.ru"],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "img-src": ["'self'", "data:", "blob:", "https://top-fwz1.mail.ru"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "connect-src": ["'self'", ...connectOrigins],
    "form-action": ["'self'"],
    "upgrade-insecure-requests": [],
  };
}

function getCspDirectivesForPath(pathname) {
  return isAdminPath(pathname) ? getAdminDirectives() : getStorefrontDirectives();
}

function buildCspHeader(directives) {
  return Object.entries(directives)
    .map(([name, values]) => (values.length ? `${name} ${unique(values).join(" ")}` : name))
    .join("; ");
}

function getCspHeaderName(options = {}) {
  return options.reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
}

function applyContentSecurityPolicy(req, res, next) {
  const reportOnly = parseReportOnly(process.env.CSP_REPORT_ONLY, true);
  res.setHeader(getCspHeaderName({ reportOnly }), buildCspHeader(getCspDirectivesForPath(req.path)));
  next();
}

module.exports = {
  applyContentSecurityPolicy,
  buildCspHeader,
  getCspDirectivesForPath,
  getCspHeaderName,
};
