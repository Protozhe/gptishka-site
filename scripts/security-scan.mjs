#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

function readIfExists(relPath) {
  const fullPath = path.join(root, relPath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, "utf8");
}

function rel(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function stripComments(source) {
  let stripped = "";
  let state = "code";
  let quote = "";

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (state === "line-comment") {
      if (char === "\n") {
        stripped += char;
        state = "code";
      } else {
        stripped += " ";
      }
      continue;
    }

    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        stripped += "  ";
        index += 1;
        state = "code";
      } else {
        stripped += char === "\n" ? "\n" : " ";
      }
      continue;
    }

    if (state === "string") {
      stripped += char;
      if (char === "\\") {
        if (index + 1 < source.length) {
          stripped += source[index + 1];
          index += 1;
        }
      } else if (char === quote) {
        state = "code";
        quote = "";
      }
      continue;
    }

    if (char === "/" && next === "/") {
      stripped += "  ";
      index += 1;
      state = "line-comment";
      continue;
    }

    if (char === "/" && next === "*") {
      stripped += "  ";
      index += 1;
      state = "block-comment";
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      state = "string";
      quote = char;
    }

    stripped += char;
  }

  return stripped;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function firstMatchIndex(source, pattern) {
  const match = pattern.exec(source);
  return match ? match.index : -1;
}

function findClosingParen(source, openIndex) {
  let depth = 0;
  let state = "code";
  let quote = "";

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];

    if (state === "string") {
      if (char === "\\") {
        index += 1;
      } else if (char === quote) {
        state = "code";
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      state = "string";
      quote = char;
      continue;
    }

    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function getCallArgumentsFromOpenParen(source, openIndex) {
  if (openIndex < 0 || source[openIndex] !== "(") return null;
  const closeIndex = findClosingParen(source, openIndex);
  if (closeIndex === -1) return null;
  return {
    args: source.slice(openIndex + 1, closeIndex),
    endIndex: closeIndex,
  };
}

function splitTopLevelArgs(source) {
  const args = [];
  let start = 0;
  let depth = 0;
  let state = "code";
  let quote = "";

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (state === "string") {
      if (char === "\\") {
        index += 1;
      } else if (char === quote) {
        state = "code";
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      state = "string";
      quote = char;
      continue;
    }

    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
      continue;
    }

    if (char === ")" || char === "]" || char === "}") {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (char === "," && depth === 0) {
      args.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }

  const finalArg = source.slice(start).trim();
  if (finalArg) args.push(finalArg);
  return args;
}

function isStringLiteral(value, expectedValue) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  return (
    (quote === "\"" || quote === "'" || quote === "`") &&
    trimmed.endsWith(quote) &&
    trimmed.slice(1, -1) === expectedValue
  );
}

function usesOnlyAllowedLocalStorageKey(source, allowedKey) {
  const allowedRanges = [];
  const operationPattern = /\b(?:window\s*\.\s*)?localStorage\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g;
  let match;

  while ((match = operationPattern.exec(source))) {
    const method = match[1];
    const openIndex = source.indexOf("(", match.index);
    const call = getCallArgumentsFromOpenParen(source, openIndex);
    if (!call) continue;

    const args = splitTopLevelArgs(call.args);
    if (
      ["getItem", "setItem", "removeItem"].includes(method) &&
      args.length >= 1 &&
      isStringLiteral(args[0], allowedKey)
    ) {
      allowedRanges.push([match.index, call.endIndex + 1]);
    }

    operationPattern.lastIndex = Math.max(operationPattern.lastIndex, call.endIndex + 1);
  }

  const maskedSource = source.split("");
  for (const [start, end] of allowedRanges) {
    for (let index = start; index < end; index += 1) {
      maskedSource[index] = " ";
    }
  }

  return !/\blocalStorage\b/.test(maskedSource.join(""));
}

function regexLiteralAllowsSvg(source) {
  const regexPattern = /\/((?:\\.|[^/\\\r\n])+?)\/[dgimsuvy]*/g;
  let match;
  while ((match = regexPattern.exec(source))) {
    const regexBody = match[1];
    if (/\|/.test(regexBody) && /\bsvg\b/i.test(regexBody)) return true;
  }
  return false;
}

function sourceAllowsSvgUpload(source) {
  return (
    /\bimage\/svg\+xml\b/i.test(source) ||
    /(["'`])\.svg\1/i.test(source) ||
    /(["'`])svg\1/i.test(source) ||
    regexLiteralAllowsSvg(source)
  );
}

function hasAppliedProjectCspMiddleware(source) {
  return /\bapp\s*\.\s*use\s*\(\s*applyContentSecurityPolicy\b/.test(source);
}

function hasCspHeaderSetter(source) {
  return /\b(?:res|response)\s*\.\s*(?:setHeader|header)\s*\(\s*(["'`])Content-Security-Policy\1\s*,/i.test(source);
}

function hasEnabledHelmetCspApplication(source) {
  const appHelmetPattern = /\bapp\s*\.\s*use\s*\(\s*helmet\s*\(/g;
  let match;

  while ((match = appHelmetPattern.exec(source))) {
    const openIndex = source.indexOf("(", match.index);
    const call = getCallArgumentsFromOpenParen(source, openIndex);
    if (!call) continue;

    const statement = source.slice(match.index, call.endIndex + 1);
    if (!/\bcontentSecurityPolicy\s*:\s*false\b/.test(statement)) return true;

    appHelmetPattern.lastIndex = Math.max(appHelmetPattern.lastIndex, call.endIndex + 1);
  }

  return false;
}

function routeStatementHasRequireAuthBeforeHandler(statement) {
  const openIndex = statement.indexOf("(");
  const call = getCallArgumentsFromOpenParen(statement, openIndex);
  if (!call) return false;

  const routeArgs = splitTopLevelArgs(call.args).slice(1);
  const requireAuthIndex = routeArgs.findIndex((arg) => /\brequireAuth\b/.test(arg));
  return requireAuthIndex !== -1 && requireAuthIndex < routeArgs.length - 1;
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
    } else {
      acc.push(full);
    }
  }
  return acc;
}

function fail(message) {
  failures.push(message);
}

const failures = [];

const adminApi = stripComments(read("apps/admin-ui/src/lib/api.ts"));
if (/admin_access_token/.test(adminApi) || /localStorage\.(?:getItem|setItem|removeItem)\(\s*["']admin_access_token/.test(adminApi)) {
  fail("Admin access token must not be stored in localStorage.");
}

const adminUiFiles = walk(path.join(root, "apps", "admin-ui", "src")).filter((file) => /\.(?:ts|tsx|js|jsx)$/.test(file));
for (const file of adminUiFiles) {
  const source = fs.readFileSync(file, "utf8");
  const relativePath = rel(file);
  const sourceWithoutComments = stripComments(source);
  const isThemeToggle = relativePath === "apps/admin-ui/src/components/ThemeToggle.tsx";
  if (!isThemeToggle && /\blocalStorage\b/.test(sourceWithoutComments)) {
    fail(`Admin UI must not use localStorage outside ThemeToggle: ${relativePath}`);
  }
  if (
    isThemeToggle &&
    /\blocalStorage\b/.test(sourceWithoutComments) &&
    !usesOnlyAllowedLocalStorageKey(sourceWithoutComments, "admin_theme")
  ) {
    fail("Admin UI ThemeToggle must only use localStorage key admin_theme.");
  }
  if (sourceWithoutComments.includes("dangerouslySetInnerHTML")) {
    fail(`Admin UI must not use dangerouslySetInnerHTML: ${relativePath}`);
  }
}

const uploadSources = [
  "apps/admin-backend/src/modules/files/files.middleware.ts",
  "apps/admin-backend/src/modules/files/files.service.ts",
]
  .map((relPath) => {
    const source = readIfExists(relPath);
    return source ? { relPath, source: stripComments(source) } : null;
  })
  .filter(Boolean);
const uploadHasFileFilter = uploadSources.some(({ source }) => /\bfileFilter\b/.test(source));
const uploadAllowsSvg = uploadSources.some(({ source }) => sourceAllowsSvgUpload(source));
if (!uploadHasFileFilter || uploadAllowsSvg) {
  fail("Admin uploads must not allow SVG files.");
}

const serverSource = stripComments(read("server.js"));
const hasProjectCspMiddleware = hasAppliedProjectCspMiddleware(serverSource);
const hasCspHeader = hasCspHeaderSetter(serverSource);
const hasHelmetWithCspEnabled = hasEnabledHelmetCspApplication(serverSource);
const hasHelmetCspDisabled = /\bcontentSecurityPolicy\s*:\s*false\b/.test(serverSource);
if (
  (!hasProjectCspMiddleware && !hasCspHeader && !hasHelmetWithCspEnabled) ||
  (hasHelmetCspDisabled && !hasProjectCspMiddleware)
) {
  fail("server.js must apply a project CSP middleware or enable Helmet CSP.");
}

const adminRouteFiles = [
  ["apps/admin-backend/src/modules/products/products.routes.ts", ["productsRouter"]],
  ["apps/admin-backend/src/modules/orders/orders.routes.ts", ["ordersRouter"]],
  ["apps/admin-backend/src/modules/analytics/analytics.routes.ts", ["analyticsRouter"]],
  ["apps/admin-backend/src/modules/audit/audit.routes.ts", ["auditRouter"]],
  ["apps/admin-backend/src/modules/users/users.routes.ts", ["usersRouter"]],
  ["apps/admin-backend/src/modules/promocodes/promocodes.routes.ts", ["promoCodesRouter"]],
  ["apps/admin-backend/src/modules/partners/partners.routes.ts", ["partnersRouter", "partnerEarningsRouter"]],
  ["apps/admin-backend/src/modules/cdks/cdks.routes.ts", ["cdkKeysRouter"]],
  ["apps/admin-backend/src/modules/vpn/vpn.routes.ts", ["vpnAdminRouter"]],
  ["apps/admin-backend/src/modules/account/account.admin.routes.ts", ["accountAdminRouter"]],
  ["apps/admin-backend/src/modules/system/system.routes.ts", ["systemAdminRouter"]],
  ["apps/admin-backend/src/modules/telegram-bots/telegram-bots.admin.routes.ts", ["telegramBotsAdminRouter"]],
  ["apps/admin-backend/src/modules/showcase/showcase.routes.ts", ["productVisualRouter", "showcaseAdminRouter"]],
  ["apps/admin-backend/src/modules/service-pages/service-pages.routes.ts", ["servicePagesAdminRouter"]],
];

for (const [relPath, routerNames] of adminRouteFiles) {
  const source = readIfExists(relPath);
  if (!source) continue;
  const sourceWithoutComments = stripComments(source);
  for (const routerName of routerNames) {
    const safeRouterName = escapeRegExp(routerName);
    const routerGuardPattern = new RegExp(`\\b${safeRouterName}\\b\\s*\\.\\s*use\\s*\\(\\s*requireAuth\\b`);
    const routePattern = new RegExp(
      `\\b${safeRouterName}\\b\\s*\\.\\s*(?:(?:get|post|put|patch|delete|all|route)\\s*\\(|use\\s*\\(\\s*["'\`])`
    );
    const guardIndex = firstMatchIndex(sourceWithoutComments, routerGuardPattern);
    const firstRouteIndex = firstMatchIndex(sourceWithoutComments, routePattern);
    if (guardIndex === -1) {
      fail(`Admin router should apply router-level requireAuth: ${relPath} (${routerName})`);
    } else if (firstRouteIndex !== -1 && firstRouteIndex < guardIndex) {
      fail(`Admin router should apply requireAuth before route declarations: ${relPath} (${routerName})`);
    }
  }
}

const authRoutes = stripComments(read("apps/admin-backend/src/modules/auth/auth.routes.ts"));
const logoutAllRouteStatements = authRoutes.match(/\bauthRouter\b\s*\.\s*(?:get|post|put|patch|delete|all)\s*\(\s*["']\/logout-all["'][\s\S]*?;/g) || [];
if (!logoutAllRouteStatements.some((statement) => routeStatementHasRequireAuthBeforeHandler(statement))) {
  fail("Auth routes must expose /logout-all behind requireAuth.");
}

if (failures.length) {
  console.error("Security scan failed:");
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log("Security scan passed.");
