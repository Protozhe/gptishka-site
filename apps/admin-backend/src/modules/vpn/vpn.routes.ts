import { Router } from "express";
import { allowRoles, requireAuth } from "../auth/auth.middleware";
import { validateBody, validateQuery } from "../../common/middleware/validation";
import { vpnAccessReadRateLimit, vpnAccessWriteRateLimit } from "../../common/security/rate-limit";
import {
  exportVpnCsv,
  getVpnAccessById,
  getVpnMe,
  listVpnAccessAudit,
  regenerateVpnAccess,
  revokeVpnAccess,
  setVpnAccessExpiry,
  syncExpiredVpnAccesses,
  syncVpnAccessTraffic,
} from "./vpn.controller";
import { vpnActionReasonSchema, vpnExportQuerySchema, vpnListQuerySchema, vpnSetExpirySchema, vpnSyncExpiredSchema } from "./vpn.schemas";

export const vpnPublicRouter = Router();
export const vpnAdminRouter = Router();

vpnPublicRouter.get("/vpn/me", vpnAccessReadRateLimit, getVpnMe);

vpnAdminRouter.use(requireAuth);
vpnAdminRouter.get("/list", allowRoles(["OWNER", "ADMIN"]), validateQuery(vpnListQuerySchema), listVpnAccessAudit);
vpnAdminRouter.get("/export", allowRoles(["OWNER", "ADMIN"]), validateQuery(vpnExportQuerySchema), exportVpnCsv);
vpnAdminRouter.get("/:id", allowRoles(["OWNER", "ADMIN", "MANAGER", "SUPPORT"]), getVpnAccessById);
vpnAdminRouter.post(
  "/:id/revoke",
  allowRoles(["OWNER", "ADMIN"]),
  vpnAccessWriteRateLimit,
  validateBody(vpnActionReasonSchema),
  revokeVpnAccess
);
vpnAdminRouter.post(
  "/:id/regenerate",
  allowRoles(["OWNER", "ADMIN"]),
  vpnAccessWriteRateLimit,
  validateBody(vpnActionReasonSchema),
  regenerateVpnAccess
);
vpnAdminRouter.patch(
  "/:id/expiry",
  allowRoles(["OWNER", "ADMIN"]),
  vpnAccessWriteRateLimit,
  validateBody(vpnSetExpirySchema),
  setVpnAccessExpiry
);
vpnAdminRouter.post(
  "/:id/sync-traffic",
  allowRoles(["OWNER", "ADMIN", "MANAGER", "SUPPORT"]),
  vpnAccessWriteRateLimit,
  syncVpnAccessTraffic
);
vpnAdminRouter.post(
  "/sync-expired",
  allowRoles(["OWNER", "ADMIN"]),
  vpnAccessWriteRateLimit,
  validateBody(vpnSyncExpiredSchema),
  syncExpiredVpnAccesses
);
