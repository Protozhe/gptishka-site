import { Router } from "express";
import { validateBody } from "../../common/middleware/validation";
import { allowRoles, requireAuth } from "../auth/auth.middleware";
import {
  addServicePagePlacement,
  createServicePage,
  deleteServicePage,
  deleteServicePagePlacement,
  getPublicServicePage,
  getServicePage,
  listServicePages,
  patchServicePageStatus,
  updateServicePage,
  updateServicePagePlacement,
} from "./service-pages.controller";
import {
  servicePagePlacementSchema,
  servicePagePlacementUpdateSchema,
  servicePageSchema,
  servicePageStatusSchema,
  servicePageUpdateSchema,
} from "./service-pages.schemas";

export const servicePagesAdminRouter = Router();

servicePagesAdminRouter.use(requireAuth);
servicePagesAdminRouter.get("/", allowRoles(["OWNER", "ADMIN", "MANAGER"]), listServicePages);
servicePagesAdminRouter.get("/:id", allowRoles(["OWNER", "ADMIN", "MANAGER"]), getServicePage);
servicePagesAdminRouter.post("/", allowRoles(["OWNER", "ADMIN"]), validateBody(servicePageSchema), createServicePage);
servicePagesAdminRouter.put("/:id", allowRoles(["OWNER", "ADMIN", "MANAGER"]), validateBody(servicePageUpdateSchema), updateServicePage);
servicePagesAdminRouter.patch("/:id/status", allowRoles(["OWNER", "ADMIN"]), validateBody(servicePageStatusSchema), patchServicePageStatus);
servicePagesAdminRouter.delete("/:id", allowRoles(["OWNER", "ADMIN"]), deleteServicePage);
servicePagesAdminRouter.post("/:id/products", allowRoles(["OWNER", "ADMIN", "MANAGER"]), validateBody(servicePagePlacementSchema), addServicePagePlacement);
servicePagesAdminRouter.put("/placements/:id", allowRoles(["OWNER", "ADMIN", "MANAGER"]), validateBody(servicePagePlacementUpdateSchema), updateServicePagePlacement);
servicePagesAdminRouter.delete("/placements/:id", allowRoles(["OWNER", "ADMIN", "MANAGER"]), deleteServicePagePlacement);

export const servicePagesPublicRouter = Router();

servicePagesPublicRouter.get("/service-pages/:slug", getPublicServicePage);
