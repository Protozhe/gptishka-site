import { AppError } from "../../common/errors/app-error";

export function isExplicitlyEnabled(value: unknown) {
  if (value === true) return true;
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function assertBootstrapRegistrationEnabled(value: unknown) {
  if (!isExplicitlyEnabled(value)) {
    throw new AppError("Bootstrap registration is disabled", 403);
  }
}

export function authAuditMeta(req: { requestMeta?: { ip?: string; userAgent?: string } }) {
  return {
    ip: req.requestMeta?.ip,
    userAgent: req.requestMeta?.userAgent,
  };
}
