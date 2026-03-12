import { Router } from "express";
import { allowRoles, requireAuth } from "../auth/auth.middleware";
import { exportVpnCsv, getVpnMe, listVpnAccessAudit } from "./vpn.controller";

export const vpnPublicRouter = Router();
export const vpnAdminRouter = Router();

vpnPublicRouter.get("/vpn/me", getVpnMe);

vpnAdminRouter.use(requireAuth);
vpnAdminRouter.get("/list", allowRoles(["OWNER", "ADMIN"]), listVpnAccessAudit);
vpnAdminRouter.get("/export", allowRoles(["OWNER", "ADMIN"]), exportVpnCsv);
