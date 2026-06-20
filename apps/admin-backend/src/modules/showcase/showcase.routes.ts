import { Router } from "express";
import { validateBody } from "../../common/middleware/validation";
import { allowRoles, requireAuth } from "../auth/auth.middleware";
import { imageUpload } from "../files/files.middleware";
import {
  addShowcasePlacement,
  createShowcaseSection,
  deleteProductVisualHoverImage,
  deleteProductVisualImage,
  deleteShowcasePlacement,
  deleteShowcaseSection,
  getProductVisual,
  listShowcaseSections,
  updateShowcasePlacement,
  updateShowcaseSection,
  uploadProductVisualHoverImage,
  uploadProductVisualImage,
  upsertProductVisual,
} from "./showcase.controller";
import {
  productVisualConfigSchema,
  showcasePlacementSchema,
  showcasePlacementUpdateSchema,
  showcaseSectionSchema,
  showcaseSectionUpdateSchema,
} from "./showcase.schemas";

export const productVisualRouter = Router({ mergeParams: true });

productVisualRouter.use(requireAuth);
productVisualRouter.get("/", allowRoles(["OWNER", "ADMIN", "MANAGER"]), getProductVisual);
productVisualRouter.put("/", allowRoles(["OWNER", "ADMIN", "MANAGER"]), validateBody(productVisualConfigSchema), upsertProductVisual);
productVisualRouter.post(
  "/image",
  allowRoles(["OWNER", "ADMIN", "MANAGER"]),
  imageUpload.single("image"),
  uploadProductVisualImage
);
productVisualRouter.delete("/image", allowRoles(["OWNER", "ADMIN", "MANAGER"]), deleteProductVisualImage);
productVisualRouter.post(
  "/hover-image",
  allowRoles(["OWNER", "ADMIN", "MANAGER"]),
  imageUpload.single("image"),
  uploadProductVisualHoverImage
);
productVisualRouter.delete("/hover-image", allowRoles(["OWNER", "ADMIN", "MANAGER"]), deleteProductVisualHoverImage);

export const showcaseAdminRouter = Router();

showcaseAdminRouter.use(requireAuth);
showcaseAdminRouter.get("/sections", allowRoles(["OWNER", "ADMIN", "MANAGER"]), listShowcaseSections);
showcaseAdminRouter.post("/sections", allowRoles(["OWNER", "ADMIN"]), validateBody(showcaseSectionSchema), createShowcaseSection);
showcaseAdminRouter.put("/sections/:id", allowRoles(["OWNER", "ADMIN", "MANAGER"]), validateBody(showcaseSectionUpdateSchema), updateShowcaseSection);
showcaseAdminRouter.delete("/sections/:id", allowRoles(["OWNER", "ADMIN"]), deleteShowcaseSection);
showcaseAdminRouter.post("/sections/:id/products", allowRoles(["OWNER", "ADMIN", "MANAGER"]), validateBody(showcasePlacementSchema), addShowcasePlacement);
showcaseAdminRouter.put("/placements/:id", allowRoles(["OWNER", "ADMIN", "MANAGER"]), validateBody(showcasePlacementUpdateSchema), updateShowcasePlacement);
showcaseAdminRouter.delete("/placements/:id", allowRoles(["OWNER", "ADMIN", "MANAGER"]), deleteShowcasePlacement);
