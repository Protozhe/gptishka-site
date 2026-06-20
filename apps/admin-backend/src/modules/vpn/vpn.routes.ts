import { Router } from "express";
import { allowRoles, requireAuth } from "../auth/auth.middleware";
import { adminDisableVpnAccess, adminExtendVpnAccess, exportVpnCsv, getVpnAccessAdmin, getVpnMe, listVpnAccessAudit, listVpnServers } from "./vpn.controller";

export const vpnPublicRouter = Router();
export const vpnAdminRouter = Router();

vpnPublicRouter.get("/vpn/me", getVpnMe);
vpnPublicRouter.get("/vpn/servers", listVpnServers);

vpnAdminRouter.use(requireAuth);
vpnAdminRouter.get("/list", allowRoles(["OWNER", "ADMIN"]), listVpnAccessAudit);
vpnAdminRouter.get("/export", allowRoles(["OWNER", "ADMIN"]), exportVpnCsv);
vpnAdminRouter.get("/:id", allowRoles(["OWNER", "ADMIN", "MANAGER"]), getVpnAccessAdmin);
vpnAdminRouter.post("/:id/extend", allowRoles(["OWNER", "ADMIN", "MANAGER"]), adminExtendVpnAccess);
vpnAdminRouter.post("/:id/disable", allowRoles(["OWNER", "ADMIN", "MANAGER"]), adminDisableVpnAccess);
