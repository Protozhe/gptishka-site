export function normalizeActivationSiteUrl(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";

  parsed.hash = "";
  parsed.search = "";

  const normalized = parsed.toString().replace(/\/+$/, "");
  return normalized || "";
}

export function readActivationSiteUrlFromOrderDetails(orderDetails: unknown): string {
  if (!orderDetails || typeof orderDetails !== "object" || Array.isArray(orderDetails)) return "";
  const root = orderDetails as Record<string, any>;
  const selection = root.selection && typeof root.selection === "object" && !Array.isArray(root.selection)
    ? root.selection
    : {};
  return normalizeActivationSiteUrl(selection.serverActivationSiteUrl);
}

function baseUrlForRelativeProviderEndpoint(siteUrl: string): string {
  const parsed = new URL(siteUrl);
  const lastSegment = parsed.pathname.split("/").filter(Boolean).pop() || "";
  const looksLikeFile = /\.[a-z0-9]{2,8}$/i.test(lastSegment);
  if (parsed.pathname === "" || parsed.pathname === "/") {
    parsed.pathname = "/";
  } else if (!looksLikeFile && !parsed.pathname.endsWith("/")) {
    parsed.pathname = `${parsed.pathname}/`;
  }
  return parsed.toString();
}

export function buildActivationSiteEndpointUrl(siteUrl: unknown, endpoint: string): string {
  const normalizedSiteUrl = normalizeActivationSiteUrl(siteUrl);
  if (!normalizedSiteUrl) return "";
  const cleanEndpoint = String(endpoint || "").replace(/^\/+/, "");
  if (!cleanEndpoint) return normalizedSiteUrl;
  return new URL(cleanEndpoint, baseUrlForRelativeProviderEndpoint(normalizedSiteUrl)).toString();
}
